// scripts/probar-arxiv.ts
//
// Smoke test for the live, license-gated arXiv retrieval (agent/arxiv.ts).
// No blockchain, no Anthropic — just: search → license gate → ingest text.
//
// Run:  npx tsx scripts/probar-arxiv.ts "your question here"

import { ingestOpenAccess } from "../agent/arxiv.ts";

const question = process.argv.slice(2).join(" ") || "Why do LLM agents fail on long-horizon tasks?";

async function main() {
  console.log(`Question: ${question}\n`);
  console.log("Searching arXiv live (open-access only)...\n");

  const papers = await ingestOpenAccess(question, {
    want: 3,
    scan: 10,
    onProgress: (id, status) => console.log(`  · ${status.padEnd(10)} ${id}`),
  });

  console.log(`\n──────── INGESTED ${papers.length} OPEN-ACCESS PAPERS ────────`);
  for (const p of papers) {
    console.log(`\n${p.id}  [${p.license.id}]`);
    console.log(`  title:   ${p.title}`);
    console.log(`  authors: ${p.authors.map((a) => `${a.name} → ${a.wallet.slice(0, 10)}…`).join(", ")}`);
    console.log(`  text:    ${p.text.length} chars`);
    console.log(`  source:  ${p.sourceUrl}`);
  }
  if (papers.length === 0) console.log("(no open-access papers found for this query)");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
