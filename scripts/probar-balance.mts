// scripts/probar-balance.mts
//
// Smoke test WITHOUT funds: builds the GatewayClient with the PAYER wallet and
// reads on-chain balances. Validates RPC + chainId + SDK + wallet in a single
// pass, before funding anything. If this returns (even at zero), the config is OK.

import { GatewayClient } from "@circle-fin/x402-batching/client";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const payerKey = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!payerKey) {
  console.error("Missing PAYER_PRIVATE_KEY in .env (run: npx tsx scripts/gen-wallet.mts)");
  process.exit(1);
}

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: payerKey });

const bal = await gateway.getBalances();
console.log("✓ GatewayClient built and RPC responded.");
console.log("Wallet USDC (ERC-20):     ", bal.wallet.balance.toString(), "atomic");
console.log("Gateway available:        ", bal.gateway.formattedAvailable);
console.log("Gateway (atomic):         ", bal.gateway.available.toString());
console.log("\nIf the numbers are 0, that's perfect: the PAYER address just needs funding at faucet.circle.com.");
