// agent/verify.ts
//
// THE GUARD. The core piece of Obolo. 100% local logic, zero chain.
//
// Takes the citations returned by ask.ts (each with the span Claude claims to
// have cited) and keeps ONLY those that appear verbatim in the original paper.
// For each citation that survives this filter, a nanopayment is fired later on.
//
// It's robust against the typical noise of PDFs / parsing:
//   - normalizes quotes, dashes, and odd whitespace before comparing
//   - joins words split across a line break (inter-\nface -> interface)
//   - collapses line breaks and multiple spaces
// And it handles PARTIAL CITATIONS: if there's no exact match, it measures what
// fraction of the span does appear verbatim and, opt-in, lets through those with
// high coverage — labeled as "partial" with their number, so as not to loosen
// honesty by default.
//
// Honesty about the limit: this proves VERIFIABLE ATTRIBUTION (the answer is
// anchored to a literal span of the paper), NOT that the paper was indispensable.

/** A citation exactly as ask.ts produces it. */
export interface Citation {
  paperId: string; // which paper it claims to cite
  citedText: string; // the span Claude cited
}

export type MatchStatus = "exact" | "partial" | "unverified";

/** The detailed result of verifying a span against its paper. */
export interface SpanResult {
  status: MatchStatus;
  coverage: number; // 1 = exact; fraction of the span that matched in the partial case
  matched: string; // the (normalized) fragment that was actually found
}

/** A citation that passed the guard. Carries how it matched and with what confidence. */
export interface VerifiedCitation extends Citation {
  verified: true;
  status: "exact" | "partial";
  coverage: number;
  matchedText: string;
}

/** The corpus: a dictionary mapping each paperId to its full text. */
export type Corpus = Record<string, string>;

export interface VerifyOptions {
  /** If true, also lets through high-coverage partial citations. Default: false. */
  acceptPartial?: boolean;
}

// Thresholds for accepting a PARTIAL citation (only if acceptPartial = true).
const PARTIAL_MIN_COVERAGE = 0.8; // at least 80% of the span has to match...
const PARTIAL_MIN_CHARS = 24; // ...and the matched stretch has to be substantial.

/**
 * Normalizes text for comparison so PDF noise doesn't cause false negatives.
 * Doesn't change meaning: it only unifies formatting. Applied equally to both sides.
 */
export function normalizeText(s: string): string {
  return (
    s
      .normalize("NFKC")
      // quotes and dashes that PDFs deform -> ASCII
      .replace(/[‘’ʼ′]/g, "'") // ' ' modifier-apostrophe prime
      .replace(/[“”″]/g, '"') // " " double-prime
      .replace(/[‐-―−]/g, "-") // various dashes + minus sign
      .replace(/…/g, "...") // ellipsis
      // joins words split across a line break: inter-\nface -> interface
      .replace(/-\s*\n\s*/g, "")
      // soft hyphen and zero-width characters
      .replace(/[­​-‍﻿]/g, "")
      // collapses ALL whitespace (line breaks, tabs, NBSP, multiples) to a single one
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

/**
 * Longest stretch of CONSECUTIVE words from the span that is a substring of the paper.
 * Used to measure how much of a partial citation is actually verbatim.
 */
function longestMatchingRun(span: string, paper: string): { run: string; coverage: number } {
  const words = span.split(" ").filter(Boolean);
  let best = "";

  for (let i = 0; i < words.length; i++) {
    let run = "";
    for (let j = i; j < words.length; j++) {
      const candidate = run ? `${run} ${words[j]}` : words[j];
      if (paper.includes(candidate)) run = candidate;
      else break; // as soon as it stops matching, we cut off this start
    }
    if (run.length > best.length) best = run;
  }

  return { run: best, coverage: span.length ? best.length / span.length : 0 };
}

/**
 * Verifies a span against its paper. Returns the matching detail:
 *  - "exact":   the span appears verbatim (after normalizing)
 *  - "partial": not exact, but a contiguous stretch covers >= 80% of the span
 *  - "unverified": not even that -> likely hallucination
 */
export function verifySpan(cita: Citation, corpus: Corpus): SpanResult {
  const paperRaw = corpus[cita.paperId];
  if (paperRaw === undefined) return { status: "unverified", coverage: 0, matched: "" };

  const span = normalizeText(cita.citedText);
  if (span === "") return { status: "unverified", coverage: 0, matched: "" };

  const paper = normalizeText(paperRaw);

  if (paper.includes(span)) {
    return { status: "exact", coverage: 1, matched: span };
  }

  const { run, coverage } = longestMatchingRun(span, paper);
  if (coverage >= PARTIAL_MIN_COVERAGE && run.length >= PARTIAL_MIN_CHARS) {
    return { status: "partial", coverage, matched: run };
  }

  return { status: "unverified", coverage, matched: run };
}

/**
 * Strict boolean: true only if the span is literal (exact after normalizing).
 * It's the default gate — the one the loop uses — and the most defensible.
 */
export function isLiteralSpan(cita: Citation, corpus: Corpus): boolean {
  return verifySpan(cita, corpus).status === "exact";
}

/**
 * Returns only the verified citations. By default, strict (exact only).
 * With { acceptPartial: true } the high-coverage partial ones also pass,
 * marked with status "partial" and their `coverage` so the rest of the loop
 * (or the UI) can display them differently.
 */
export function verifyCitations(
  citations: Citation[],
  corpus: Corpus,
  opts: VerifyOptions = {},
): VerifiedCitation[] {
  const acceptPartial = opts.acceptPartial ?? false;
  const out: VerifiedCitation[] = [];

  for (const cita of citations) {
    const r = verifySpan(cita, corpus);
    if (r.status === "exact" || (acceptPartial && r.status === "partial")) {
      out.push({
        ...cita,
        verified: true,
        status: r.status,
        coverage: Math.round(r.coverage * 100) / 100,
        matchedText: r.matched,
      });
    }
  }

  return out;
}
