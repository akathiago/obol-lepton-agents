// scripts/probar-pago.mts
//
// STEP 1 — the minimal real nanopayment. The milestone that validates or kills
// the project: a testnet payment landing on-chain for a "citation" (here
// simulated with a single endpoint). Runs the entire x402 loop locally:
//
//   1. starts the minimal seller (payTo = SELLER_ADDRESS = test author)
//   2. builds the GatewayClient with the PAYER wallet (the buyer agent)
//   3. deposits a bit of USDC into the Gateway Wallet (if needed)
//   4. pays the author's endpoint via gateway.pay() -> verify + settle
//   5. prints the settlement tx + link to the Arc explorer
//
// REQUIREMENT: the PAYER address must be funded at faucet.circle.com (Arc testnet).

import { GatewayClient } from "@circle-fin/x402-batching/client";
import dotenv from "dotenv";
import path from "node:path";
import { startSeller } from "../payments/seller.mts";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const PORT = 4021;
const URL = `http://localhost:${PORT}/pay-author`;
const EXPLORER = "https://testnet.arcscan.app/tx/";

const payerKey = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!payerKey) {
  console.error("Missing PAYER_PRIVATE_KEY in .env");
  process.exit(1);
}

const server = await startSeller({ port: PORT });

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: payerKey });

// --- balances ---
let bal = await gateway.getBalances();
console.log(`Wallet USDC: ${bal.wallet.balance.toString()} atomic | Gateway available: ${bal.gateway.formattedAvailable}`);

if (bal.wallet.balance === 0n && bal.gateway.available === 0n) {
  console.error("\n✗ Wallet with no funds. Fund the PAYER address at https://faucet.circle.com (Arc testnet) and retry.");
  process.exit(1);
}

// --- deposit into Gateway if the available balance is low ---
if (bal.gateway.available < 100_000n) {
  console.log("Depositing 0.5 USDC into the Gateway Wallet...");
  const dep = await gateway.deposit("0.5");
  console.log(`✓ Deposit tx: ${dep.depositTxHash}\n  ${EXPLORER}${dep.depositTxHash}`);
  bal = await gateway.getBalances();
  console.log(`New Gateway available: ${bal.gateway.formattedAvailable}`);
}

// --- the payment to the author ---
console.log("\nPaying the author via x402...");
const r = await gateway.pay(URL, { method: "GET" });
console.log(`✓ Payment settled: ${r.formattedAmount} USDC`);
console.log("SDK result:", JSON.stringify(r, null, 2));

const balAfter = await gateway.getBalances();
console.log(`\nGateway available after the payment: ${balAfter.gateway.formattedAvailable}`);

server.close();
process.exit(0);
