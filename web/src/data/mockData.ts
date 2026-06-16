// ORCID claim flow — the one piece still mocked.
//
// Payments are now fully real (see realPayments.ts / the backend): the ledger reacts
// to the actual on-chain settlements the loop emits. What remains a placeholder is the
// ORCID sign-in/claim flow (the "next integration" on the roadmap): signing in returns
// a sandbox account with simulated accrued balance, and claiming returns a fake tx.

import type { ClaimAccount, CorpusEntry } from "./types";
import corpusSample from "./corpus-sample.json";

const CORPUS = corpusSample as CorpusEntry[];
const CITATION_PRICE = 0.001; // USDC per citation — matches the backend CITATION_PRICE

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function randomHex(len: number): string {
  const hex = "0123456789abcdef";
  let h = "0x";
  for (let i = 0; i < len; i++) h += hex[Math.floor(Math.random() * 16)];
  return h;
}

// ── ORCID claim flow (placeholder until on-chain) ──
export async function mockSignInWithOrcid(): Promise<ClaimAccount> {
  await sleep(950); // simulates the OAuth round-trip
  const verified = CORPUS.filter((e) => e.orcid);
  const e = verified[Math.floor(Math.random() * verified.length)] ?? CORPUS[0];
  const citations = 400 + Math.floor(Math.random() * 2100);
  return {
    author: e.author,
    orcid: (e.orcid ?? "https://orcid.org/0000-0000-0000-0000").replace("https://orcid.org/", ""),
    citations,
    accrued: Number((citations * CITATION_PRICE).toFixed(4)),
    wallet: randomHex(40),
  };
}

export async function mockClaim(_account: ClaimAccount): Promise<{ txHash: string }> {
  await sleep(1100); // simulates the settlement
  return { txHash: randomHex(40) };
}
