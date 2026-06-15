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
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { verifySpan } from "../../agent/verify";
import { payForCitations } from "../../agent/pay";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const TOP_K = 4;
const DOC_CAP = 40000;
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
  const root = path.resolve(process.cwd(), "..");
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

// ──────── ask + verify ────────
let _client: Anthropic | null = null;
const getClient = () => (_client ??= new Anthropic());

function computeUsage(msg: any) {
  const u = msg?.usage ?? {};
  const inputTokens =
    (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  const outputTokens = u.output_tokens ?? 0;
  const p = PRICES[MODEL] ?? { in: 3, out: 15 };
  const costUsd = (inputTokens * p.in + outputTokens * p.out) / 1e6;
  return { inputTokens, outputTokens, costUsd: Math.round(costUsd * 10000) / 10000, cached: false };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

type SentDoc = { id: string; score: number; title: string; text: string; authors: { name: string; orcid?: string; wallet?: string }[] };

/** Builds the structured result from Claude's final message. */
function buildResult(question: string, final: any, sent: SentDoc[]) {
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
      // One payment per cited paper per query: only the first time we see it.
      if (!citedSet.has(src.id)) {
        cited.push({ author: citation.author, paperId: src.id, paperTitle: src.title, orcid: citation.orcid, wallet: author?.wallet });
      }
      citedSet.add(src.id);
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
    usage: computeUsage(final),
  };
}

// In-memory cache: same question -> no paying again.
const cache = new Map<string, any>();

export async function* runAskStream(question: string): AsyncGenerator<any> {
  const key = question.trim().toLowerCase();

  // Cache: we emit the whole text at once and the done event with cached=true.
  const hit = cache.get(key);
  if (hit) {
    const text = hit.segments.map((s: any) => (s.type === "text" ? s.text : s.citation.text)).join("");
    if (text) yield { type: "text", text };
    yield { type: "done", ...hit, usage: { ...hit.usage, cached: true } };
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
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, cached: false },
    };
    cache.set(key, out);
    yield { type: "done", ...out };
    return;
  }

  const sent: SentDoc[] = results.map((r) => ({
    id: r.id,
    score: r.score,
    title: corpus[r.id].title,
    text: corpus[r.id].text.slice(0, DOC_CAP),
    authors: corpus[r.id].authors,
  }));

  const documents = sent.map((d) => ({
    type: "document",
    title: d.title,
    source: { type: "text", media_type: "text/plain", data: d.text },
    citations: { enabled: true },
  }));

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system:
      "Answer in plain, flowing prose grounded in the provided papers. Do not use markdown — no headings, bold, bullet lists, or numbered lists. Your answer is rendered as a single paragraph with inline citations, so write it as continuous sentences.",
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
  const out = buildResult(question, final, sent);
  cache.set(key, out);
  yield { type: "done", ...out };

  // Real nanopayments to each cited author, AFTER the answer is shown, streamed so
  // they drop into the ledger live. Best-effort: failures come back as `pending`
  // (escrow) so a slow/empty wallet never breaks the demo.
  if (out.cited.length > 0) {
    const results = await payForCitations(out.cited);
    let i = 0;
    for (const r of results) {
      yield {
        type: "payment",
        payment: {
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
        },
      };
    }
  }
}
