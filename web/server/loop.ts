// web/server/loop.ts
//
// The REAL, server-side loop: retrieve (BM25) -> ask (Citations API, streaming)
// -> verify. Runs inside the Vite dev server so the API key never reaches the
// browser.
//
// runAskStream() is an async generator that emits events:
//   { type: "text", text }   -> accumulated text (for live display)
//   { type: "done", ...result } -> the final structured result
//
// The result includes sources (retrieved papers), guard stats, usage
// (tokens/cost) and noMatch (whether the corpus doesn't cover the question).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { verifySpan } from "../../agent/verify";
import { payForCitations } from "../../agent/pay";
import { decideCitations, enforceBudget, attest, type Candidate, type DecisionLog } from "../../agent/decide";

// Resolve paths relative to THIS module (repo root = two levels up), not the cwd,
// so the loop works under the Vite dev server (cwd=web/) and from CLI scripts alike.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(REPO_ROOT, ".env") });

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// The models the UI may pick between. Every entry must have a price in PRICES,
// and all share the Citations API, so swapping one for another never touches the
// guard — only cost/latency/quality of the prose. The backend validates any
// model the browser sends against this list and falls back to MODEL otherwise.
export const MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"] as const;
const resolveModel = (m?: string): string =>
  typeof m === "string" && (MODELS as readonly string[]).includes(m) ? m : MODEL;

const TOP_K = 8; // candidates the allocation agent rules on (it funds a subset)
export const DOC_CAP = 40000;
const SNIPPET_CHARS = 600; // head of each paper the agent judges relevance from

// The per-query economics. The budget is a HARD ceiling enforced in code; the
// agent decides how to allocate it. At $0.001/citation a $0.005 budget funds at
// most 5 of the 8 candidates, so the agent must choose. Both are env-tunable.
const CITATION_PRICE = parseFloat((process.env.CITATION_PRICE ?? "$0.001").replace("$", ""));
const QUERY_BUDGET = parseFloat(process.env.QUERY_BUDGET ?? "0.005");
// What a client agent pays OBOL per query (Agent mode). Used to surface the closed
// loop's economics: toll in − author payouts − inference cost = OBOL's margin.
const QUERY_TOLL = parseFloat((process.env.QUERY_TOLL ?? "$0.03").replace("$", ""));

// Shared answer-shaping system prompt (in-corpus loop + out-of-corpus legal flow).
export const ANSWER_SYSTEM =
  "Answer in plain, flowing prose grounded in the provided papers. Do not use markdown — no headings, bold, bullet lists, or numbered lists. Your answer is rendered as a single paragraph with inline citations, so write it as continuous sentences.";
const TITLE_BOOST = 3;
const K1 = 1.5;
const B = 0.75;

const PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

interface Paper {
  title: string;
  text: string;
  authors: { name: string; orcid?: string; wallet?: string }[];
}

// ──────── corpus (loaded once) ────────
let _corpus: Record<string, Paper> | null = null;

function getCorpus(): Record<string, Paper> {
  if (_corpus) return _corpus;
  const root = REPO_ROOT;
  const authors = JSON.parse(
    fs.readFileSync(path.join(root, "corpus/authors.json"), "utf8"),
  ) as Record<string, { title: string; authors: { name: string; orcid?: string; wallet?: string }[] }>;

  const dir = path.join(root, "corpus/papers");
  const papers: Record<string, Paper> = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const id = f.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trimStart();
    papers[id] = { title: authors[id]?.title ?? id, text: body, authors: authors[id]?.authors ?? [] };
  }
  _corpus = papers;
  return papers;
}

// ──────── index + retrieve (BM25) ────────
const STOP = new Set(
  "the a an of to in on for and or is are be by with from as at that this it its their your you we our how why what when which do does".split(
    " ",
  ),
);
const tokenize = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));

interface DocIndex {
  tf: Map<string, number>;
  len: number;
}
interface Bm25Index {
  docs: Record<string, DocIndex>;
  df: Map<string, number>;
  N: number;
  avgdl: number;
}

let _index: Bm25Index | null = null;

function getIndex(): Bm25Index {
  if (_index) return _index;
  const corpus = getCorpus();
  const docs: Record<string, DocIndex> = {};
  const df = new Map<string, number>();
  let totalLen = 0;
  const ids = Object.keys(corpus);

  for (const id of ids) {
    const p = corpus[id];
    const toks = tokenize(p.text);
    for (let i = 0; i < TITLE_BOOST; i++) toks.push(...tokenize(p.title));

    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);

    docs[id] = { tf, len: toks.length };
    totalLen += toks.length;
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }

  _index = { docs, df, N: ids.length, avgdl: totalLen / ids.length };
  return _index;
}

function bm25(qTerms: string[], doc: DocIndex, idx: Bm25Index): number {
  let s = 0;
  for (const t of qTerms) {
    const f = doc.tf.get(t) ?? 0;
    if (f === 0) continue;
    const n = idx.df.get(t) ?? 0;
    const idf = Math.log((idx.N - n + 0.5) / (n + 0.5) + 1);
    s += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * doc.len) / idx.avgdl));
  }
  return s;
}

interface Retrieval {
  results: { id: string; score: number }[];
  relevant: boolean;
}

function retrieve(question: string): Retrieval {
  const idx = getIndex();
  const qTerms = [...new Set(tokenize(question))];

  const scored = Object.entries(idx.docs).map(([id, doc]) => ({ id, score: bm25(qTerms, doc, idx) }));
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, TOP_K);

  // "relevant" if a SINGLE paper concentrates a majority of the question's
  // terms. An on-topic question concentrates; an off-topic one scatters common
  // words across different papers and none of them concentrates them.
  const bestCoverage = Math.max(
    0,
    ...results
      .filter((r) => r.score > 0)
      .map((r) => qTerms.filter((t) => idx.docs[r.id].tf.has(t)).length),
  );
  const threshold = Math.min(qTerms.length, Math.max(2, Math.ceil(qTerms.length * 0.6)));
  const relevant = (results[0]?.score ?? 0) > 0 && bestCoverage >= threshold;

  return { results, relevant };
}

// ──────── passage selection (send only the query-relevant parts) ────────
// The single biggest cost lever. Instead of shipping whole papers to the (expensive)
// answer call, we send the head (for context: title/abstract/intro) plus the windows
// with the most query-term overlap, capped at a char budget per paper. The Citations
// API still cites literal substrings of EXACTLY what we send, so the substring guard
// is unaffected — we just stop paying to ship paragraphs the answer never uses.
const PASSAGE_BUDGET = Number(process.env.PASSAGE_BUDGET ?? 6000); // chars per paper sent to ask
const WINDOW = 800; // char window granularity
const HEAD_WINDOWS = 2; // always keep the first N windows for context

export function selectPassages(text: string, qTerms: string[], budget = PASSAGE_BUDGET): string {
  if (text.length <= budget) return text;
  const qset = new Set(qTerms);

  const windows: { i: number; text: string; score: number }[] = [];
  for (let start = 0, i = 0; start < text.length; start += WINDOW, i++) {
    const w = text.slice(start, start + WINDOW);
    let score = 0;
    for (const t of tokenize(w)) if (qset.has(t)) score++;
    windows.push({ i, text: w, score });
  }

  const picked = new Map<number, (typeof windows)[number]>();
  let used = 0;
  for (const w of windows.slice(0, HEAD_WINDOWS)) {
    if (used > 0 && used + w.text.length > budget) break; // keep ≥1 head window, don't blow the budget
    picked.set(w.i, w);
    used += w.text.length;
  }
  // Then the highest query-overlap windows, in score order, until the budget is spent.
  for (const w of windows.slice(HEAD_WINDOWS).sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (w.score === 0) break; // nothing relevant left to add
    if (used + w.text.length > budget) continue;
    picked.set(w.i, w);
    used += w.text.length;
  }

  // Re-assemble in document order, marking the gaps between non-contiguous windows.
  let out = "";
  let prev = -1;
  for (const w of [...picked.values()].sort((a, b) => a.i - b.i)) {
    if (prev >= 0 && w.i !== prev + 1) out += "\n\n[…]\n\n";
    out += w.text;
    prev = w.i;
  }
  return out;
}

// ──────── ask + verify ────────
let _client: Anthropic | null = null;
export const getClient = () => (_client ??= new Anthropic());

// Dollar cost of one Anthropic usage object, with prompt-caching multipliers
// (fresh input 1×, cache writes 1.25×, cache reads 0.1×). Used per-call so we can
// sum the decide call and the answer call into one query cost.
function usdCost(u: any, model: string) {
  const inFresh = u?.input_tokens ?? 0;
  const cacheWrite = u?.cache_creation_input_tokens ?? 0;
  const cacheRead = u?.cache_read_input_tokens ?? 0;
  const outputTokens = u?.output_tokens ?? 0;
  const p = PRICES[model] ?? { in: 3, out: 15 };
  const costUsd =
    (inFresh * p.in + cacheWrite * p.in * 1.25 + cacheRead * p.in * 0.1 + outputTokens * p.out) / 1e6;
  return { inputTokens: inFresh + cacheWrite + cacheRead, outputTokens, cachedTokens: cacheRead, costUsd };
}

function computeUsage(msg: any, model: string) {
  const c = usdCost(msg?.usage, model);
  return { ...c, costUsd: Math.round(c.costUsd * 10000) / 10000, cached: false };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type SentDoc = { id: string; score: number; title: string; text: string; authors: { name: string; orcid?: string; wallet?: string }[] };

/** Builds the structured result from Claude's final message. */
export function buildResult(question: string, final: any, sent: SentDoc[], model: string = MODEL) {
  const segments: any[] = [];
  const cited: { author: string; paperId: string; paperTitle: string; orcid?: string; wallet?: string }[] = [];
  const citedSet = new Set<string>();
  const colorByPaper = new Map<string, number>();
  let found = 0;
  let verified = 0;
  let partial = 0;

  for (const block of final.content as any[]) {
    if (block.type !== "text" || !block.text.trim()) continue;

    // THE GUARD: each cited span against the paper that was sent. Accepts exact
    // ones and high-coverage partials (the latter marked as "partial").
    const blockVerified: { c: any; status: string; coverage: number }[] = [];
    for (const c of block.citations ?? []) {
      // Plain-text documents yield char_location citations carrying document_index.
      // Guard the field so a non-location citation can never index sent[undefined].
      if (typeof c.document_index !== "number") continue;
      found++;
      const src = sent[c.document_index];
      if (!src) continue;
      const r = verifySpan({ paperId: src.id, citedText: c.cited_text }, { [src.id]: src.text });
      if (r.status === "exact" || r.status === "partial") {
        verified++;
        if (r.status === "partial") partial++;
        blockVerified.push({ c, status: r.status, coverage: r.coverage });
      }
    }

    if (blockVerified.length > 0) {
      const best = blockVerified.find((v) => v.status === "exact") ?? blockVerified[0];
      const src = sent[best.c.document_index];
      const author = src.authors[0];
      if (!colorByPaper.has(src.id)) colorByPaper.set(src.id, colorByPaper.size % 4);
      const citation = {
        id: `cite-${segments.length}`,
        text: block.text,
        author: author?.name ?? "Unknown author",
        paperId: src.id,
        paperTitle: src.title,
        colorIndex: colorByPaper.get(src.id)!,
        orcid: author?.orcid || undefined,
        status: best.status,
        coverage: Math.round(best.coverage * 100) / 100,
      };
      segments.push({ type: "cite", citation });
      // Pay EVERY distinct verified paper in this block, not just the one we render
      // inline — a sentence grounded in two papers owes both authors. One payment per
      // paper per query (citedSet dedups across the whole answer).
      for (const v of blockVerified) {
        const vsrc = sent[v.c.document_index];
        if (!vsrc || citedSet.has(vsrc.id)) continue;
        citedSet.add(vsrc.id);
        const a = vsrc.authors[0];
        cited.push({ author: a?.name ?? "Unknown author", paperId: vsrc.id, paperTitle: vsrc.title, orcid: a?.orcid || undefined, wallet: a?.wallet });
      }
    } else {
      segments.push({ type: "text", text: block.text });
    }
  }

  return {
    question,
    segments,
    cited,
    sources: sent.map((s) => ({ paperId: s.id, title: s.title, score: round1(s.score), cited: citedSet.has(s.id) })),
    stats: { found, verified, partial, dropped: found - verified },
    noMatch: false,
    model,
    usage: computeUsage(final, model),
  };
}

// ──────── Agent mode: the loop as a single awaitable ────────
// Same retrieve -> decide -> ask -> guard -> pay-authors loop, but DRAINED into one
// structured result instead of streamed. This is what the x402 toll server returns
// to an external client agent that paid for the query: the answer, the allocation
// decision, and the real author settlements that the toll funded.
export interface AgentQueryResult {
  question: string;
  model: string;
  answerText: string;
  segments: any[];
  sources: any[];
  stats: any;
  usage: any;
  decision?: any;
  cited: any[];
  payments: any[];
  noMatch?: boolean;
  noFunded?: boolean;
}

export async function runAgentQuery(question: string, modelArg?: string): Promise<AgentQueryResult> {
  let answerText = "";
  let done: any = null;
  const payments: any[] = [];
  for await (const ev of runAskStream(question, modelArg)) {
    if (ev.type === "text") answerText = ev.text;
    else if (ev.type === "done") done = ev;
    else if (ev.type === "payment") payments.push(ev.payment);
  }
  if (!done) throw new Error("the loop produced no result");
  const { type, cited = [], ...rest } = done;
  void type;
  return { ...rest, answerText, cited, payments } as AgentQueryResult;
}

// In-memory cache: same question -> no paying again. We also cache the payment
// events so a repeat query replays the author settlements into the ledger instead
// of showing "paid $0" with citations present.
const cache = new Map<string, any>();
const payCache = new Map<string, any[]>();

export async function* runAskStream(question: string, modelArg?: string): AsyncGenerator<any> {
  const model = resolveModel(modelArg);
  // The model is part of the cache key: the same question on a different model is
  // a different answer (and a different cost), so it must not collide.
  const key = question.trim().toLowerCase() + "::" + model;

  // Cache: we emit the whole text at once and the done event with cached=true.
  const hit = cache.get(key);
  if (hit) {
    const text = hit.segments.map((s: any) => (s.type === "text" ? s.text : s.citation.text)).join("");
    if (text) yield { type: "text", text };
    yield { type: "done", ...hit, usage: { ...hit.usage, cached: true } };
    // Replay the original author settlements so a repeat query still shows them.
    for (const p of payCache.get(key) ?? []) yield { type: "payment", payment: p };
    return;
  }

  const corpus = getCorpus();
  const { results, relevant } = retrieve(question);

  // No relevant papers: we don't force an answer (nor spend on Claude).
  if (!relevant) {
    const out = {
      question,
      segments: [],
      cited: [],
      sources: results.map((r) => ({ paperId: r.id, title: corpus[r.id].title, score: round1(r.score), cited: false })),
      stats: { found: 0, verified: 0, partial: 0, dropped: 0 },
      noMatch: true,
      model,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, cached: false },
    };
    cache.set(key, out);
    yield { type: "done", ...out };
    return;
  }

  // ──────── THE ALLOCATION DECISION ────────
  // The agent rules on all candidates under the budget BEFORE we answer. The LLM
  // prioritizes; enforceBudget (code) caps the spend; we sign the decisions.
  const candidates: Candidate[] = results.map((r) => ({
    paperId: r.id,
    title: corpus[r.id].title,
    snippet: corpus[r.id].text.slice(0, SNIPPET_CHARS),
    bm25Score: r.score,
  }));

  const opts = { budget: QUERY_BUDGET, price: CITATION_PRICE };
  const { strategy, decisions, usage: decideUsage } = await decideCitations(question, candidates, opts, model);
  const { funded, logged, spend } = enforceBudget(candidates, decisions, opts);

  const decisionLog: DecisionLog = {
    question,
    budget: QUERY_BUDGET,
    pricePerCitation: CITATION_PRICE,
    strategy,
    candidates: logged,
    spend,
  };
  decisionLog.attestation = await attest(decisionLog, Date.now());

  // Surface the decisions immediately — this is the agency, made visible.
  yield { type: "decision", decision: decisionLog };

  // The agent judged nothing worth paying: answer-less, payment-less, by choice.
  if (funded.length === 0) {
    const out = {
      question,
      segments: [],
      cited: [],
      sources: logged.map((l) => ({ paperId: l.paperId, title: l.title, score: l.bm25Score, cited: false })),
      stats: { found: 0, verified: 0, partial: 0, dropped: 0 },
      noMatch: false,
      noFunded: true,
      model,
      decision: decisionLog,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, cached: false },
    };
    cache.set(key, out);
    yield { type: "done", ...out };
    return;
  }

  // Only the FUNDED papers reach the answer (and are eligible to be paid). We send
  // the query-relevant PASSAGES of each (not the whole paper) — the main cost lever.
  const qTerms = [...new Set(tokenize(question))];
  const scoreById = new Map(results.map((r) => [r.id, r.score]));
  const sent: SentDoc[] = funded.map((id) => ({
    id,
    score: scoreById.get(id) ?? 0,
    title: corpus[id].title,
    text: selectPassages(corpus[id].text.slice(0, DOC_CAP), qTerms),
    authors: corpus[id].authors,
  }));

  const documents = sent.map((d, idx) => ({
    type: "document",
    title: d.title,
    source: { type: "text", media_type: "text/plain", data: d.text },
    citations: { enabled: true },
    // One cache breakpoint on the last document caches the whole document prefix:
    // a later query that funds the same papers reads them back at 0.1× instead of 1×.
    ...(idx === sent.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
  }));

  const stream = getClient().messages.stream({
    model,
    max_tokens: 1024,
    system: ANSWER_SYSTEM,
    messages: [{ role: "user", content: [...documents, { type: "text", text: question }] }],
  } as any);

  // We stream the text as it arrives (the "live" effect).
  let acc = "";
  for await (const event of stream as any) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      acc += event.delta.text;
      yield { type: "text", text: acc };
    }
  }

  // With the final message (citations already assembled) we run the guard and build everything.
  const final = await stream.finalMessage();
  const out: any = buildResult(question, final, sent, model);

  // Reconcile what was actually cited+verified (and thus paid) back into the log.
  const paidIds = new Set(out.cited.map((c: any) => c.paperId));
  for (const l of decisionLog.candidates) {
    if (l.status === "funded" && paidIds.has(l.paperId)) {
      l.paid = true;
      l.amount = CITATION_PRICE;
    }
  }
  decisionLog.spend.paid = decisionLog.candidates.filter((l) => l.paid).length;
  out.decision = decisionLog;

  // Fold the allocation (decide) call's cost into the query's inference cost — it's
  // a real LLM call, so the economics must count BOTH calls, not just the answer.
  const dCost = usdCost(decideUsage, model);
  out.usage.inputTokens += dCost.inputTokens;
  out.usage.outputTokens += dCost.outputTokens;
  out.usage.costUsd = Math.round((out.usage.costUsd + dCost.costUsd) * 1e4) / 1e4;

  // The closed loop's economics for THIS query, made visible: what an agent pays in,
  // what flows out to authors, what inference cost, and what's left for OBOL.
  const authorsCost = out.cited.length * CITATION_PRICE;
  out.economics = {
    toll: QUERY_TOLL,
    authors: Math.round(authorsCost * 1e4) / 1e4,
    inference: out.usage.costUsd,
    margin: Math.round((QUERY_TOLL - authorsCost - out.usage.costUsd) * 1e4) / 1e4,
  };

  cache.set(key, out);
  yield { type: "done", ...out };

  // Real nanopayments to each cited author, AFTER the answer is shown, streamed so
  // they drop into the ledger live. Best-effort: failures come back as `pending`
  // (escrow) so a slow/empty wallet never breaks the demo.
  const paymentEvents: any[] = [];
  if (out.cited.length > 0) {
    const results = await payForCitations(out.cited);
    let i = 0;
    for (const r of results) {
      const payment = {
        id: `pay-${Date.now()}-${i++}`,
        author: r.author,
        paperId: r.paperId,
        paperTitle: r.paperTitle ?? "",
        amount: r.amount,
        txHash: r.ref ?? "",
        timestamp: Date.now(),
        orcid: r.orcid,
        wallet: r.wallet,
        pending: r.pending ?? !r.ok,
      };
      paymentEvents.push(payment);
      yield { type: "payment", payment };
    }
  }
  payCache.set(key, paymentEvents);
}
