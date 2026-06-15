// scripts/probar-verify.ts
//
// Demo of the hardened guard. Injects typical PDF noise into the paper and tests:
//   A) exact match despite line breaks, multiple spaces, and a break hyphen
//   B) exact match despite curly quotes and a non-breaking space (NBSP)
//   C) PARTIAL citation (one omitted word) -> passes only with acceptPartial
//   D) HALLUCINATED citation -> never passes
// Run with:  npx tsx scripts/probar-verify.ts

import { verifyCitations, verifySpan, type Citation, type Corpus } from "../agent/verify";

// "Dirty" characters built without ambiguity.
const LDQUO = String.fromCharCode(0x201c); // left curly double quote
const RDQUO = String.fromCharCode(0x201d); // right curly double quote
const NBSP = String.fromCharCode(0x00a0); // non-breaking space

// The paper as it would come out of a PDF: line break mid-sentence,
// triple spaces, "pay-\nwalls" broken, NBSP, and curly quotes.
const paper =
  "Open access accelerates\nscientific   progress by removing pay-\nwalls. " +
  "Authors," +
  NBSP +
  "however, rarely receive " +
  LDQUO +
  "direct compensation" +
  RDQUO +
  " for citations.";

const corpus: Corpus = { "paper-001": paper };

const citas: { label: string; cita: Citation; expect: string }[] = [
  {
    label: "A  (breaks/spaces/hyphen)",
    expect: "exact",
    cita: {
      paperId: "paper-001",
      citedText: "Open access accelerates scientific progress by removing paywalls.",
    },
  },
  {
    label: "B  (curly quotes + NBSP)",
    expect: "exact",
    cita: {
      paperId: "paper-001",
      citedText: 'rarely receive "direct compensation" for citations.',
    },
  },
  {
    label: "C  (partial: omits 'however')",
    expect: "partial",
    cita: {
      paperId: "paper-001",
      citedText: 'Authors, rarely receive "direct compensation" for citations.',
    },
  },
  {
    label: "D  (hallucinated)",
    expect: "unverified",
    cita: {
      paperId: "paper-001",
      citedText: "Open access doubles researcher salaries overnight.",
    },
  },
];

console.log("PAPER (with PDF noise):");
console.log(JSON.stringify(paper));
console.log("");

for (const { label, cita, expect } of citas) {
  const r = verifySpan(cita, corpus);
  const ok = r.status === expect ? "ok" : "REVIEW";
  console.log(
    `${label.padEnd(30)} ${r.status.padEnd(11)} cov ${r.coverage.toFixed(2)}   [${ok}]`,
  );
}

const all = citas.map((c) => c.cita);
const strict = verifyCitations(all, corpus); // default: exact only
const withPartial = verifyCitations(all, corpus, { acceptPartial: true });

console.log("");
console.log(`Strict (default):       ${strict.length} verified`);
console.log(`Accepting partials:     ${withPartial.length} verified`);
