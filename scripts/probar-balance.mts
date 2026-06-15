// scripts/probar-balance.mts
//
// Smoke test SIN fondos: construye el GatewayClient con la wallet PAYER y lee
// balances on-chain. Valida RPC + chainId + SDK + wallet de una sola pasada,
// antes de fondear nada. Si esto devuelve (aunque sea en cero), la config esta OK.

import { GatewayClient } from "@circle-fin/x402-batching/client";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const payerKey = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!payerKey) {
  console.error("Falta PAYER_PRIVATE_KEY en .env (corré: npx tsx scripts/gen-wallet.mts)");
  process.exit(1);
}

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: payerKey });

const bal = await gateway.getBalances();
console.log("✓ GatewayClient construido y RPC respondió.");
console.log("Wallet USDC (ERC-20):     ", bal.wallet.balance.toString(), "atomic");
console.log("Gateway disponible:       ", bal.gateway.formattedAvailable);
console.log("Gateway (atomic):         ", bal.gateway.available.toString());
console.log("\nSi los números son 0, está perfecto: falta fondear la PAYER address en faucet.circle.com.");
