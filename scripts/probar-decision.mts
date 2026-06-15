// scripts/probar-decision.mts
//
// Drives the in-corpus loop (web/server/loop.ts) from the CLI to inspect the
// ALLOCATION DECISION: retrieve 8 -> agent decides under budget -> answer -> pay.
// Prints the decision log (what it saw, funded, discarded, skipped, and why),
// the attestation, the answer stats, and the payments.
//
// Run with:  npx tsx scripts/probar-decision.mts ["your question"]

import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const { runAskStream } = await import("../web/server/loop.ts");

const question = process.argv[2] || "Why do LLM agents fail on long-horizon tasks?";

const STATUS_ICON: Record<string, string> = {
  funded: "💰 FUND ",
  discarded_relevance: "✂️  DROP ",
  discarded_cost: "🪙 COST ",
  skipped_budget: "⛔ BUDG ",
};

console.log(`\nQuestion: ${question}\n`);

for await (const ev of runAskStream(question)) {
  if (ev.type === "decision") {
    const d = ev.decision;
    console.log(`STRATEGY: ${d.strategy}`);
    console.log(`BUDGET:   $${d.budget} · price $${d.pricePerCitation}/cite\n`);
    for (const c of d.candidates) {
      const tag = STATUS_ICON[c.status] ?? c.status;
      console.log(`  ${tag} rel=${c.relevance.toFixed(2)}  ${c.paperId}`);
      console.log(`          ${c.reason}`);
    }
    const s = d.spend;
    console.log(`\nSPEND: seen ${s.seen} · funded ${s.funded} · dropped(rel) ${s.discardedRelevance} · dropped(cost) ${s.discardedCost} · skipped(budget) ${s.skippedBudget}`);
    console.log(`       committed $${s.committed} / $${s.budget} · remaining $${s.remaining}`);
    console.log(`ATTEST: ${d.attestation?.hash?.slice(0, 18)}…  sig ${d.attestation?.signature?.slice(0, 14) ?? "(none)"}…  signer ${d.attestation?.signer ?? "—"}\n`);
  } else if (ev.type === "done") {
    if (ev.noFunded) {
      console.log("RESULT: agent funded nothing — no answer, no payment (by choice).\n");
    } else {
      const answer = ev.segments.map((s: any) => (s.type === "text" ? s.text : s.citation.text)).join("");
      console.log(`ANSWER (${answer.length} chars):\n${answer.slice(0, 600)}${answer.length > 600 ? "…" : ""}\n`);
      console.log(`GUARD: ${ev.stats.verified}/${ev.stats.found} verified · ${ev.stats.dropped} dropped · cost $${ev.usage.costUsd}`);
      console.log(`PAID:  ${ev.decision.spend.paid} authors · ${ev.cited.map((c: any) => c.author).join(", ") || "(none)"}`);
    }
  } else if (ev.type === "payment") {
    const p = ev.payment;
    console.log(`PAY    ${p.pending ? "pending" : "settled"} $${p.amount} -> ${p.author}  ref:${p.txHash?.slice(0, 10) || "—"}`);
  } else if (ev.type === "error") {
    console.log(`ERROR  ${ev.error}`);
  }
}
