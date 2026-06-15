// scripts/probar-pago-citas.mts
// Tests STEP 1: pay several real corpus authors (dynamic payTo) via agent/pay.ts.
import fs from "node:fs";
import path from "node:path";
import { payForCitations, type CitationToPay } from "../agent/pay.ts";

const corpus = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "corpus/authors.json"), "utf8"));
const ids = Object.keys(corpus).slice(0, 3);
const cited: CitationToPay[] = ids.map((id) => {
  const a = corpus[id].authors[0];
  return { paperId: id, author: a.name, paperTitle: corpus[id].title, orcid: a.orcid || undefined, wallet: a.wallet };
});

console.log("Paying these citations:");
for (const c of cited) console.log(`  ${c.author}  ->  ${c.wallet}`);

const results = await payForCitations(cited);
console.log("\nResults:");
console.log(JSON.stringify(results, null, 2));

const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} settled on-chain; ${results.length - ok} pending/escrow.`);
process.exit(0);
