// scripts/probar-agente-paga.mts
//
// AGENT MODE — the closed economic loop, end to end in one command.
//
//   external client agent  --pays the query toll-->  OBOL (treasury)
//                                                       └─ runs the loop, answers
//                                                       └─ pays each cited author
//
// It runs the whole thing locally:
//   1. starts OBOL's x402 TOLL server (payTo = OBOL treasury), wired to runAgentQuery
//   2. builds a GatewayClient with the AGENT wallet (the external buyer, NOT OBOL's PAYER)
//   3. deposits a little USDC into the Gateway Wallet (if needed)
//   4. agent.pay(tollUrl, POST {question}) -> verify+settle toll -> OBOL answers + pays authors
//   5. prints the answer and the full money flow (toll in, authors out, inference cost)
//
// REQUIREMENT: the AGENT address must be funded at faucet.circle.com (Arc testnet),
// and PAYER (OBOL) must also be funded so it can pay the authors.

import { GatewayClient } from "@circle-fin/x402-batching/client";
import dotenv from "dotenv";
import path from "node:path";
import { startTollServer } from "../payments/toll.mts";
import { runAgentQuery } from "../web/server/loop.ts";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const PORT = Number(process.env.TOLL_PORT ?? 4023);
const URL = `http://localhost:${PORT}/agent-query`;
const EXPLORER = "https://testnet.arcscan.app/tx/";

const question = process.argv[2] ?? "Why do LLM agents fail on long-horizon tasks?";
const model = process.argv[3] ?? process.env.ANTHROPIC_MODEL;

const agentKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!agentKey) {
  console.error("Missing AGENT_PRIVATE_KEY in .env — run: npx tsx scripts/gen-wallet.mts");
  process.exit(1);
}

const bigIntSafe = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
const usd = (n: number) => `$${n.toFixed(4)}`;

// 1. OBOL's toll server: on payment, run the real query loop (answer + author payouts).
const server = await startTollServer({ port: PORT, onPaid: ({ question, model }) => runAgentQuery(question, model) });

// 2. the external client agent wallet (the buyer).
const agent = new GatewayClient({ chain: "arcTestnet", privateKey: agentKey });
console.log(`Agent (client) wallet: ${agent.address}`);

// 3. balances + deposit if needed.
let bal = await agent.getBalances();
console.log(`Agent USDC: ${bal.wallet.balance.toString()} atomic | Gateway available: ${bal.gateway.formattedAvailable}`);
if (bal.wallet.balance === 0n && bal.gateway.available === 0n) {
  console.error("\n✗ Agent wallet has no funds. Fund AGENT_ADDRESS at https://faucet.circle.com (Arc testnet) and retry.");
  process.exit(1);
}
if (bal.gateway.available < 100_000n) {
  console.log("Depositing 0.5 USDC into the Gateway Wallet...");
  const dep = await agent.deposit("0.5");
  console.log(`✓ Deposit tx: ${dep.depositTxHash}\n  ${EXPLORER}${dep.depositTxHash}`);
}

// 4. the agent pays OBOL for the query and gets the answer back from the same call.
console.log(`\nAgent asks (paying the query toll): "${question}"`);
const r = await agent.pay<{ ok: boolean; tollTx: string | null; result: any }>(URL, {
  method: "POST",
  body: { question, model },
});
console.log(`✓ Query toll settled: ${r.formattedAmount} USDC  (tx ${r.transaction})\n  ${EXPLORER}${r.transaction}`);

const result = r.data?.result;
if (!result) {
  console.error("No result returned:", JSON.stringify(r.data, bigIntSafe, 2));
  server.close();
  process.exit(1);
}

// 5. the answer + the full money flow.
console.log("\n──────── ANSWER ────────");
console.log(result.answerText?.trim() || "(no answer — see economics below)");

// The economics are computed once, server-side (result.economics), so the on-screen
// money flow can't drift from what the backend charged. Authors/inference/margin all
// come from there; the per-author tx list comes from the settled payment events.
const settled = (result.payments ?? []).filter((p: any) => !p.pending);
const pending = (result.payments ?? []).filter((p: any) => p.pending);
const e = result.economics ?? { toll: 0, authors: 0, inference: result.usage?.costUsd ?? 0, margin: 0 };

console.log("\n──────── MONEY FLOW (the closed loop) ────────");
console.log(`Agent paid OBOL        : ${usd(e.toll)}  (toll, settled on-chain to treasury · ${r.formattedAmount} USDC)`);
console.log(`OBOL paid authors      : ${usd(e.authors)}  (${settled.length} settled${pending.length ? `, ${pending.length} escrow` : ""}, on-chain)`);
console.log(`Inference cost         : ${usd(e.inference)}  (off-chain, billed to OBOL's API key · decide + answer)`);
console.log(`OBOL margin            : ${usd(e.margin)}  (toll − authors − inference)`);

for (const p of settled) {
  console.log(`  → ${p.author}  ${usd(p.amount)}  ${p.txHash ? EXPLORER + p.txHash : "(batched ref)"}`);
}

console.log("\nFull result:", JSON.stringify({ ok: r.data.ok, tollTx: r.data.tollTx, stats: result.stats, usage: result.usage }, bigIntSafe, 2));

server.close();
process.exit(0);
