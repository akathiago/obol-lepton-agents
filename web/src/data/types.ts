// Data contracts. Both today's MOCK source and tomorrow's REAL source implement
// these; the UI neither knows nor cares which one is behind them.

/** An author <-> paper pair from the corpus (what feeds the mocks). */
export interface CorpusEntry {
  author: string;
  paperId: string;
  paperTitle: string;
  orcid?: string; // full ORCID URL, or "" when unknown
  openalexId?: string;
}

/** A nanopayment to an author for a verified citation. */
export interface Payment {
  id: string;
  author: string;
  paperId: string;
  paperTitle: string;
  amount: number; // USDC
  txHash: string;
  timestamp: number;
  orcid?: string;
}

/**
 * The payment source. Today it's the mock; tomorrow it's the listener over
 * pay.ts / on-chain events. The UI just subscribes.
 */
export interface PaymentSource {
  subscribe(onPayment: (p: Payment) => void): () => void; // returns unsubscribe
}

/** An inline citation inside the answer. */
export interface Citation {
  id: string;
  text: string; // the cited span, rendered underlined
  author: string;
  paperId: string;
  paperTitle: string;
  colorIndex: number; // 0..3 -> editorial underline color
  orcid?: string;
  status?: "exact" | "partial"; // how the guard matched it
  coverage?: number; // for partial: fraction of the span that matched
}

/** The answer is a sequence of segments: plain text or a citation. */
export type AnswerSegment =
  | { type: "text"; text: string }
  | { type: "cite"; citation: Citation };

/** A paper picked by retrieve, shown in "Sources consulted". */
export interface RetrievedSource {
  paperId: string;
  title: string;
  score: number;
  cited: boolean; // true if the answer actually cited it
}

/** The guard made visible: how many citations the model produced vs. verified. */
export interface VerifyStats {
  found: number;
  verified: number;
  partial: number;
  dropped: number;
}

/** Tokens and cost for one query (0 when cached or when no answer was generated). */
export interface QueryUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cached: boolean;
}

export interface AskResult {
  question: string;
  segments: AnswerSegment[];
  sources: RetrievedSource[];
  stats: VerifyStats;
  noMatch: boolean; // true if the corpus doesn't cover the question
  usage: QueryUsage;
}

/** Leaderboard row (accumulated per author). */
export interface AuthorStat {
  author: string;
  citations: number;
  total: number;
  lastPaperTitle: string;
  orcid?: string;
}

/** A researcher's account after signing in with ORCID (claim flow). */
export interface ClaimAccount {
  author: string;
  orcid: string; // bare iD, e.g. "0000-0002-7584-8802"
  citations: number;
  accrued: number; // USDC waiting to be claimed
  wallet: string; // (mock) custodial payout wallet
}
