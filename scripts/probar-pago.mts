// scripts/probar-pago.mts
//
// PASO 1 — el nanopago mínimo real. El hito que valida o mata el proyecto:
// que un pago de testnet aterrice on-chain por una "cita" (acá simulada con un
// solo endpoint). Corre todo el loop x402 localmente:
//
//   1. levanta el seller mínimo (payTo = SELLER_ADDRESS = autor de prueba)
//   2. construye el GatewayClient con la wallet PAYER (el agente comprador)
//   3. deposita un poco de USDC en el Gateway Wallet (si hace falta)
//   4. paga el endpoint del autor vía gateway.pay() -> verify + settle
//   5. imprime la tx de settlement + link al explorer de Arc
//
// REQUISITO: la PAYER address debe estar fondeada en faucet.circle.com (Arc testnet).

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
  console.error("Falta PAYER_PRIVATE_KEY en .env");
  process.exit(1);
}

const server = await startSeller({ port: PORT });

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: payerKey });

// --- balances ---
let bal = await gateway.getBalances();
console.log(`Wallet USDC: ${bal.wallet.balance.toString()} atomic | Gateway disponible: ${bal.gateway.formattedAvailable}`);

if (bal.wallet.balance === 0n && bal.gateway.available === 0n) {
  console.error("\n✗ Wallet sin fondos. Fondeá la PAYER address en https://faucet.circle.com (Arc testnet) y reintentá.");
  process.exit(1);
}

// --- depósito en Gateway si el balance disponible es bajo ---
if (bal.gateway.available < 100_000n) {
  console.log("Depositando 0.5 USDC en el Gateway Wallet...");
  const dep = await gateway.deposit("0.5");
  console.log(`✓ Deposit tx: ${dep.depositTxHash}\n  ${EXPLORER}${dep.depositTxHash}`);
  bal = await gateway.getBalances();
  console.log(`Nuevo Gateway disponible: ${bal.gateway.formattedAvailable}`);
}

// --- el pago al autor ---
console.log("\nPagando al autor vía x402...");
const r = await gateway.pay(URL, { method: "GET" });
console.log(`✓ Pago liquidado: ${r.formattedAmount} USDC`);
console.log("Resultado del SDK:", JSON.stringify(r, null, 2));

const balAfter = await gateway.getBalances();
console.log(`\nGateway disponible después del pago: ${balAfter.gateway.formattedAvailable}`);

server.close();
process.exit(0);
