// scripts/seed-author-wallets.mts
//
// STEP 3 — author -> wallet registry (seeded demo).
//
// Fills the empty `wallet` field of every author in corpus/authors.json with a
// testnet address, so a verified citation can pay its author on-chain. One wallet
// per unique author identity (ORCID if present, else name) — an author who appears
// in several papers always gets the SAME wallet. Idempotent: never overwrites a
// wallet that's already set.
//
// These are receive-only demo wallets: we keep only the address (no private key),
// because in the demo authors only RECEIVE. The real ORCID claim flow (later) lets
// an author bind their own wallet, replacing the seeded one.

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
import path from "node:path";

const AUTHORS_PATH = path.resolve(process.cwd(), "corpus/authors.json");

interface Author { name: string; orcid?: string; wallet?: string; openalex_id?: string }
interface Paper { title: string; authors: Author[] }

const corpus = JSON.parse(fs.readFileSync(AUTHORS_PATH, "utf8")) as Record<string, Paper>;

const identity = (a: Author) => (a.orcid && a.orcid.trim()) || a.name.trim();

// One address per unique author identity (stable across papers).
const walletByIdentity = new Map<string, string>();
let created = 0;
let reused = 0;

// First pass: reuse any wallet already present in the file (idempotency).
for (const paper of Object.values(corpus)) {
  for (const a of paper.authors ?? []) {
    if (a.wallet && a.wallet.trim()) walletByIdentity.set(identity(a), a.wallet.trim());
  }
}

// Second pass: assign + fill.
for (const paper of Object.values(corpus)) {
  for (const a of paper.authors ?? []) {
    const id = identity(a);
    let w = walletByIdentity.get(id);
    if (!w) {
      w = privateKeyToAccount(generatePrivateKey()).address; // keep address only
      walletByIdentity.set(id, w);
      created++;
    }
    if (a.wallet === w) reused++;
    a.wallet = w;
  }
}

fs.writeFileSync(AUTHORS_PATH, JSON.stringify(corpus, null, 2) + "\n");

console.log(`✓ authors.json updated.`);
console.log(`  unique author identities: ${walletByIdentity.size}`);
console.log(`  wallets created this run:  ${created}`);
console.log(`  already-seeded (kept):     ${reused}`);
