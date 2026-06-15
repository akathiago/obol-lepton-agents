// scripts/probar-unpaywall.mts
//
// Smoke test for the LEGAL GUARD (agent/unpaywall.ts) against the REAL Unpaywall
// API. Shows the gate deciding, live, on three kinds of DOI:
//   - an open-licensed paper (CC-BY)        -> serve
//   - a paper with only a green repo copy   -> serve (author-archived)
//   - a fully closed / paywalled paper      -> stop
//
// Run with:  npx tsx scripts/probar-unpaywall.mts [doi ...]
// With no args it runs the three canonical examples below.

import dotenv from "dotenv";
import path from "node:path";
import { legalCheck } from "../agent/unpaywall.ts";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Canonical demo DOIs. Override by passing DOIs as CLI args.
const DEFAULT_DOIS = [
  "10.1371/journal.pone.0173664", // PLOS ONE — gold OA, CC-BY        -> serve
  "10.1016/j.cell.2016.11.018", // Cell (Elsevier) — green repo copy   -> serve (archived)
  "10.1038/nphys1170", // Nature Physics — closed                      -> stop
];

const dois = process.argv.slice(2);
const targets = dois.length > 0 ? dois : DEFAULT_DOIS;

const icon = (d: string) => (d === "serve" ? "✅ SERVE" : "⛔ STOP ");

console.log(`\nLegal guard — Unpaywall (${targets.length} DOI${targets.length > 1 ? "s" : ""})\n`);

let served = 0;
let stopped = 0;

for (const doi of targets) {
  try {
    const v = await legalCheck(doi);
    v.decision === "serve" ? served++ : stopped++;

    console.log(`${icon(v.decision)}  ${v.doi}   [${v.oaStatus}]`);
    console.log(`   ${v.reason}`);
    if (v.legal) {
      console.log(`   basis: ${v.legal.basis} · host: ${v.legal.hostType} · version: ${v.legal.version ?? "—"}`);
      console.log(`   legal url: ${v.legal.url || "(none reported)"}`);
    }
    console.log();
  } catch (err) {
    stopped++;
    console.log(`⚠️  ${doi}  — lookup failed: ${(err as Error).message}\n`);
  }
}

console.log("──────── SUMMARY ────────");
console.log(`serve: ${served}   stop: ${stopped}   total: ${targets.length}`);
