// scripts/gen-wallet.mts
//
// Genera DOS wallets de TESTNET para Obolo y las escribe en ../.env:
//   - PAYER  (el agente comprador): firma autorizaciones EIP-3009 y deposita en Gateway.
//   - AUTHOR (el cobrador de prueba): hace de "seller" / wallet de autor que RECIBE el pago.
//
// Solo imprime las DIRECCIONES (nunca las private keys). Es idempotente: si una clave
// ya existe en .env, NO la pisa (para no perder una wallet ya fondeada).

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
import path from "node:path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

function readEnv(): string {
  return fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
}

/** Setea KEY=value en el texto del .env: respeta si ya tiene valor, completa si esta vacia, agrega si falta. */
function setIfEmpty(env: string, key: string, value: string): { env: string; wrote: boolean } {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = env.match(re);
  if (m) {
    if (m[1].trim() !== "") return { env, wrote: false }; // ya tiene valor: no tocar
    return { env: env.replace(re, `${key}=${value}`), wrote: true };
  }
  const sep = env.endsWith("\n") || env === "" ? "" : "\n";
  return { env: `${env}${sep}${key}=${value}\n`, wrote: true };
}

function ensureWallet(env: string, keyName: string, addrName: string, label: string): string {
  const pk = generatePrivateKey();
  const addr = privateKeyToAccount(pk).address;

  const r1 = setIfEmpty(env, keyName, pk);
  if (!r1.wrote) {
    // Ya habia clave: derivar su address para reportarla.
    const existing = env.match(new RegExp(`^${keyName}=(.*)$`, "m"))?.[1].trim() as `0x${string}`;
    const existingAddr = privateKeyToAccount(existing).address;
    console.log(`${label.padEnd(7)} (ya existia): ${existingAddr}`);
    return env;
  }
  const r2 = setIfEmpty(r1.env, addrName, addr);
  console.log(`${label.padEnd(7)} (nueva)     : ${addr}`);
  return r2.env;
}

let env = readEnv();
env = ensureWallet(env, "PAYER_PRIVATE_KEY", "PAYER_ADDRESS", "PAYER");
env = ensureWallet(env, "SELLER_PRIVATE_KEY", "SELLER_ADDRESS", "AUTHOR");
fs.writeFileSync(ENV_PATH, env);

console.log("\n.env actualizado. Fondea la PAYER address en https://faucet.circle.com (Arc testnet).");
