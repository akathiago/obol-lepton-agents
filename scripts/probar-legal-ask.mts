// scripts/probar-legal-ask.mts
//
// Drives the full out-of-corpus flow (web/server/legal.ts) from the CLI:
//   gate (Unpaywall) -> ingest legal copy -> Citations API + guard -> pay.
// Prints each ndjson event so we can see the gate decide and the answer stream
// without the browser.
//
// Run with:  npx tsx scripts/probar-legal-ask.mts [doi] [question]

import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Import AFTER dotenv so the server modules see the env (corpus is lazy-loaded).
const { runLegalAskStream } = await import("../web/server/legal.ts");

const doi = process.argv[2] || "10.1371/journal.pone.0173664";
const question = process.argv[3] || "";

console.log(`\nLegal ask — ${doi}\n`);

let lastTextLen = 0;
for await (const ev of runLegalAskStream(doi, question)) {
  if (ev.type === "gate") {
    const v = ev.verdict;
    console.log(`GATE  ${v.decision.toUpperCase()}  [${v.oaStatus}]  ${v.reason}`);
    if (v.legal) console.log(`      legal: ${v.legal.basis} · ${v.legal.hostType} · ${v.legal.landingUrl || v.legal.url}`);
  } else if (ev.type === "text") {
    lastTextLen = ev.text.length; // keep the final length; we print the answer at "done"
  } else if (ev.type === "note") {
    console.log(`NOTE  ${ev.text}`);
  } else if (ev.type === "done") {
    if (ev.ingested) {
      const answer = ev.segments.map((s: any) => (s.type === "text" ? s.text : s.citation.text)).join("");
      console.log(`\nANSWER (${answer.length} chars, streamed ${lastTextLen}):\n${answer}\n`);
      console.log(`GUARD  ${ev.stats.verified}/${ev.stats.found} verified · ${ev.stats.dropped} dropped · cost $${ev.usage.costUsd}`);
      console.log(`SOURCE ${ev.sourceUrl}`);
      console.log(`CITED  ${ev.cited.map((c: any) => c.author).join(", ") || "(none)"}`);
    } else {
      console.log(`DONE   ${ev.stopped ? "stopped (not legal)" : "served but not ingested"}`);
    }
  } else if (ev.type === "payment") {
    const p = ev.payment;
    console.log(`PAY    ${p.pending ? "pending" : "settled"} $${p.amount} -> ${p.author} (${p.wallet?.slice(0, 10)}…)  ref:${p.txHash?.slice(0, 12) || "—"}`);
  } else if (ev.type === "error") {
    console.log(`ERROR  ${ev.error}`);
  }
}
