// scripts/gen-sample.ts
//
// Generates web/src/data/corpus-sample.json: a varied sample of REAL
// author<->paper pairs (with their ORCID when it exists), taken from corpus/authors.json,
// so the mock frontend displays with real corpus data.
// Run with: npx tsx scripts/gen-sample.ts

import { readFile, writeFile, mkdir } from "node:fs/promises";

interface Author {
  name: string;
  orcid: string;
  wallet: string;
  openalex_id?: string;
}
type AuthorsFile = Record<string, { title: string; authors: Author[] }>;

const data = JSON.parse(await readFile("corpus/authors.json", "utf8")) as AuthorsFile;

const pairs: {
  author: string;
  paperId: string;
  paperTitle: string;
  orcid: string;
  openalexId: string;
}[] = [];

for (const [paperId, p] of Object.entries(data)) {
  for (const a of p.authors) {
    pairs.push({
      author: a.name,
      paperId,
      paperTitle: p.title,
      orcid: a.orcid ?? "",
      openalexId: a.openalex_id ?? "",
    });
  }
}

// Evenly spaced sample so there's a variety of papers and authors.
const N = 60;
const step = Math.max(1, Math.floor(pairs.length / N));
const sample = pairs.filter((_, i) => i % step === 0).slice(0, N);
const withOrcid = sample.filter((s) => s.orcid).length;

await mkdir("web/src/data", { recursive: true });
await writeFile("web/src/data/corpus-sample.json", JSON.stringify(sample, null, 2), "utf8");

console.log(
  `corpus-sample.json: ${sample.length} pairs (${withOrcid} with ORCID) of ${pairs.length} total`,
);
