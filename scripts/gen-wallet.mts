// scripts/gen-wallet.mts
//
// Generates the TESTNET wallets for Obolo and writes them to ../.env:
//   - PAYER  (OBOL's operating wallet): signs EIP-3009 authorizations, deposits into
//            Gateway, and pays the authors. Also the default toll treasury.
//   - AUTHOR (the test payee): acts as the "seller" / author wallet that RECEIVES the payment.
//   - AGENT  (the external client, "Agent mode"): the buyer that PAYS OBOL per query.
//
// It only prints the ADDRESSES (never the private keys). It's idempotent: if a key
// already exists in .env, it does NOT overwrite it (so as not to lose an already-funded wallet).

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
import path from "node:path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

function readEnv(): string {
  return fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
}

/** Sets KEY=value in the .env text: keeps it if it already has a value, fills it in if empty, appends if missing. */
function setIfEmpty(env: string, key: string, value: string): { env: string; wrote: boolean } {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = env.match(re);
  if (m) {
    if (m[1].trim() !== "") return { env, wrote: false }; // already has a value: leave it
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
    // A key was already there: derive its address to report it.
    const existing = env.match(new RegExp(`^${keyName}=(.*)$`, "m"))?.[1].trim() as `0x${string}`;
    const existingAddr = privateKeyToAccount(existing).address;
    console.log(`${label.padEnd(7)} (existed)   : ${existingAddr}`);
    return env;
  }
  const r2 = setIfEmpty(r1.env, addrName, addr);
  console.log(`${label.padEnd(7)} (new)       : ${addr}`);
  return r2.env;
}

let env = readEnv();
env = ensureWallet(env, "PAYER_PRIVATE_KEY", "PAYER_ADDRESS", "PAYER");
env = ensureWallet(env, "SELLER_PRIVATE_KEY", "SELLER_ADDRESS", "AUTHOR");
env = ensureWallet(env, "AGENT_PRIVATE_KEY", "AGENT_ADDRESS", "AGENT");
fs.writeFileSync(ENV_PATH, env);

console.log("\n.env updated. Fund BOTH at https://faucet.circle.com (Arc testnet):");
console.log("  · PAYER  — OBOL pays the authors (and receives the query toll).");
console.log("  · AGENT  — the external client agent that pays OBOL per query (Agent mode).");
