// agent/decide.ts
//
// THE ALLOCATION AGENT. This is where OBOL stops being automation and becomes an
// agent: instead of citing+paying everything retrieval returns, it DECIDES, under
// a budget, which candidate papers are worth paying to cite for THIS question.
//
// The split that makes it robust (and is the whole pitch):
//   - the LLM REASONS and PRIORITIZES  -> relevance, cite/discard, worth-paying, why
//   - deterministic CODE ENFORCES      -> a hard per-query budget the LLM can't exceed
//   - the agent SIGNS its decisions    -> a wallet attestation, BEFORE any payment
//
// One LLM call evaluates all candidates at once (a forced tool call returns the
// decisions as structured JSON) — no per-paper calls.

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// ──────── types ────────

/** A retrieved paper the agent must rule on. */
export interface Candidate {
  paperId: string;
  title: string;
  snippet: string; // a short head of the paper, enough to judge relevance
  bm25Score: number;
}

/** The raw judgement the LLM returns per candidate (before budget enforcement). */
export interface RawDecision {
  paperId: string;
  relevance: number; // 0..1 — bearing on THIS question
  decision: "cite" | "discard";
  worthPaying: boolean; // cost/benefit verdict at the given toll
  reason: string;
}

export type CandidateStatus =
  | "funded" // approved by the agent AND within budget -> sent to the answer
  | "discarded_relevance" // agent chose not to cite (tangential / redundant)
  | "discarded_cost" // relevant-ish, but the agent judged it not worth the toll
  | "skipped_budget"; // agent wanted it, but deterministic budget ran out

/** A candidate after enforcement — what the decision log shows per paper. */
export interface LoggedCandidate {
  paperId: string;
  title: string;
  bm25Score: number;
  relevance: number;
  reason: string;
  status: CandidateStatus;
  paid: boolean; // filled in after the answer+guard (cited & verified -> paid)
  amount: number;
}

export interface Spend {
  budget: number;
  committed: number; // budget the agent committed to fund (price * funded)
  remaining: number;
  seen: number;
  funded: number;
  discardedRelevance: number;
  discardedCost: number;
  skippedBudget: number;
  paid: number; // filled in after the answer+guard
}

export interface Attestation {
  hash: string; // sha256 of the canonical decision payload
  signature?: string; // payer wallet personal_sign over the hash
  signer?: string; // payer address (recoverable from hash+signature)
  signedAt: number;
}

export interface DecisionLog {
  question: string;
  budget: number;
  pricePerCitation: number;
  strategy: string;
  candidates: LoggedCandidate[];
  spend: Spend;
  attestation?: Attestation;
}

// ──────── 1. the agent's judgement (one LLM call) ────────

const TOOL = {
  name: "record_decisions",
  description:
    "Record, for every candidate paper, whether to cite (and pay) it or discard it for this specific question.",
  input_schema: {
    type: "object" as const,
    properties: {
      strategy: {
        type: "string",
        description: "One sentence: how you allocated the budget across the candidates.",
      },
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            paperId: { type: "string" },
            relevance: { type: "number", description: "0..1 — how much this paper bears on THIS question." },
            decision: { type: "string", enum: ["cite", "discard"] },
            worthPaying: {
              type: "boolean",
              description: "Is paying the toll to cite this worth it for this question? False if redundant/marginal.",
            },
            reason: { type: "string", description: "Short, human-readable justification (one line)." },
          },
          required: ["paperId", "relevance", "decision", "worthPaying", "reason"],
        },
      },
    },
    required: ["strategy", "decisions"],
  },
};

let _client: Anthropic | null = null;
const getClient = () => (_client ??= new Anthropic());

/**
 * Asks the agent to rule on all candidates in ONE call. Returns its strategy and
 * a decision per candidate. Robust to omissions: any candidate the model skips is
 * defaulted to a discard, so the enforcement step always has a full picture.
 */
export async function decideCitations(
  question: string,
  candidates: Candidate[],
  opts: { budget: number; price: number },
): Promise<{ strategy: string; decisions: RawDecision[] }> {
  const list = candidates
    .map(
      (c, i) =>
        `[${i + 1}] paperId=${c.paperId} · retrieval_score=${c.bm25Score.toFixed(2)}\n` +
        `    title: ${c.title}\n` +
        `    excerpt: ${c.snippet.replace(/\s+/g, " ").slice(0, 600)}`,
    )
    .join("\n\n");

  const system =
    "You are OBOL's allocation agent. A researcher asked a question; retrieval returned candidate open-access papers. " +
    `You have a budget of $${opts.budget.toFixed(3)} for author payments on THIS question, and citing a paper pays its author $${opts.price.toFixed(3)}. ` +
    "Decide which candidates genuinely support an answer and are worth paying for, and which are tangential, redundant, or marginal and should be discarded. " +
    "Be selective: paying to cite a paper that doesn't really inform the answer wastes the researcher's money — you do NOT have to spend the whole budget. " +
    "Prefer a few high-relevance, non-redundant sources over many overlapping ones. Score relevance honestly (0..1), set worthPaying to false for anything marginal, and give a one-line reason per paper.";

  const msg = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    tools: [TOOL as any],
    tool_choice: { type: "tool", name: "record_decisions" } as any,
    messages: [
      {
        role: "user",
        content:
          `Question: ${question}\n\n` +
          `Candidates (${candidates.length}):\n\n${list}\n\n` +
          `Return a decision for every candidate by paperId.`,
      },
    ],
  });

  const block = (msg.content as any[]).find((b) => b.type === "tool_use");
  const out = (block?.input ?? {}) as { strategy?: string; decisions?: RawDecision[] };
  const byId = new Map<string, RawDecision>();
  for (const d of out.decisions ?? []) if (d?.paperId) byId.set(d.paperId, d);

  // Every candidate gets a decision; default omissions to a conservative discard.
  const decisions: RawDecision[] = candidates.map(
    (c) =>
      byId.get(c.paperId) ?? {
        paperId: c.paperId,
        relevance: 0,
        decision: "discard",
        worthPaying: false,
        reason: "the agent returned no decision for this paper",
      },
  );

  return { strategy: out.strategy ?? "(no strategy returned)", decisions };
}

// ──────── 2. deterministic budget enforcement (pure) ────────

/**
 * Applies the hard budget. The LLM proposes; this disposes. Approved candidates
 * (cite + worthPaying) are funded in relevance order until the budget is spent;
 * anything beyond the budget is cut to `skipped_budget`, regardless of what the
 * LLM wanted. The LLM can never overspend — the cap lives here, in code.
 */
export function enforceBudget(
  candidates: Candidate[],
  decisions: RawDecision[],
  opts: { budget: number; price: number },
): { funded: string[]; logged: LoggedCandidate[]; spend: Spend } {
  const dById = new Map(decisions.map((d) => [d.paperId, d]));
  const cById = new Map(candidates.map((c) => [c.paperId, c]));

  // Approved = the agent wants to cite AND judged it worth the toll.
  const approved = candidates
    .map((c) => ({ c, d: dById.get(c.paperId)! }))
    .filter(({ d }) => d && d.decision === "cite" && d.worthPaying)
    .sort((a, b) => b.d.relevance - a.d.relevance || b.c.bm25Score - a.c.bm25Score);

  // Greedy fund within budget.
  const fundedSet = new Set<string>();
  let committed = 0;
  for (const { c } of approved) {
    if (committed + opts.price <= opts.budget + 1e-9) {
      fundedSet.add(c.paperId);
      committed += opts.price;
    }
  }

  const statusFor = (c: Candidate): CandidateStatus => {
    const d = dById.get(c.paperId)!;
    if (d.decision === "discard") return "discarded_relevance";
    if (!d.worthPaying) return "discarded_cost";
    return fundedSet.has(c.paperId) ? "funded" : "skipped_budget";
  };

  const logged: LoggedCandidate[] = candidates
    .map((c) => {
      const d = dById.get(c.paperId)!;
      return {
        paperId: c.paperId,
        title: c.title,
        bm25Score: Math.round(c.bm25Score * 10) / 10,
        relevance: Math.round((d?.relevance ?? 0) * 100) / 100,
        reason: d?.reason ?? "",
        status: statusFor(c),
        paid: false,
        amount: 0,
      };
    })
    .sort((a, b) => b.relevance - a.relevance);

  const count = (s: CandidateStatus) => logged.filter((l) => l.status === s).length;
  const spend: Spend = {
    budget: opts.budget,
    committed: Math.round(committed * 1e6) / 1e6,
    remaining: Math.round((opts.budget - committed) * 1e6) / 1e6,
    seen: candidates.length,
    funded: fundedSet.size,
    discardedRelevance: count("discarded_relevance"),
    discardedCost: count("discarded_cost"),
    skippedBudget: count("skipped_budget"),
    paid: 0,
  };

  return { funded: [...fundedSet], logged, spend };
}

// ──────── 3. attestation: sign the decisions BEFORE paying ────────

/** Stable, key-sorted serialization of the parts of the log we attest to. */
function canonical(log: DecisionLog): string {
  const payload = {
    question: log.question,
    budget: log.budget,
    pricePerCitation: log.pricePerCitation,
    strategy: log.strategy,
    spend: log.spend,
    candidates: [...log.candidates]
      .sort((a, b) => a.paperId.localeCompare(b.paperId))
      .map((c) => ({ paperId: c.paperId, status: c.status, relevance: c.relevance, reason: c.reason })),
  };
  return JSON.stringify(payload);
}

/**
 * Hashes the decision payload and (when a payer key is present) signs it with the
 * payer wallet. This is computed BEFORE any payment — the agent commits to, and
 * signs, exactly what it decided and will spend. Anyone can recover the signer
 * from (hash, signature) and check it's the payer.
 */
export async function attest(log: DecisionLog, now: number): Promise<Attestation> {
  const hash = "0x" + createHash("sha256").update(canonical(log)).digest("hex");
  const key = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return { hash, signedAt: now };
  const account = privateKeyToAccount(key);
  const signature = await account.signMessage({ message: hash });
  return { hash, signature, signer: account.address, signedAt: now };
}
