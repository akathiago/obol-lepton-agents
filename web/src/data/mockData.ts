// Payment layer (placeholder until pay.ts on-chain).
//
// It no longer invents activity: the ledger reacts ONLY to real questions. Each
// verified citation from a real query fires its entry via firePaymentsFor (called by
// realData with the citations the backend returned). The amounts and tx hashes are
// simulated until pay.ts settles them on-chain. The ORCID claim flow is also a
// placeholder until then.

import type { ClaimAccount, CorpusEntry, Payment, PaymentSource } from "./types";
import corpusSample from "./corpus-sample.json";

const CORPUS = corpusSample as CorpusEntry[];
const AMOUNT = 0.0005; // USDC per citation (simulated)

let seq = 0;
const uid = () => `pay-${Date.now()}-${seq++}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function randomHex(len: number): string {
  const hex = "0123456789abcdef";
  let h = "0x";
  for (let i = 0; i < len; i++) h += hex[Math.floor(Math.random() * 16)];
  return h;
}

function paymentFor(entry: CorpusEntry): Payment {
  return {
    id: uid(),
    author: entry.author,
    paperId: entry.paperId,
    paperTitle: entry.paperTitle,
    amount: AMOUNT,
    txHash: randomHex(40),
    timestamp: Date.now(),
    orcid: entry.orcid || undefined,
  };
}

// ── payment stream: no ambient activity; only emits what firePaymentsFor pushes ──
const listeners = new Set<(p: Payment) => void>();
const emit = (p: Payment) => listeners.forEach((l) => l(p));

export const mockPaymentSource: PaymentSource = {
  subscribe(onPayment) {
    listeners.add(onPayment);
    return () => listeners.delete(onPayment);
  },
};

/** Fires the payments for a set of citations — called with the REAL citations from a real query. */
export function firePaymentsFor(
  items: { author: string; paperId: string; paperTitle: string; orcid?: string }[],
) {
  items.forEach((e, i) =>
    setTimeout(
      () =>
        emit(
          paymentFor({
            author: e.author,
            paperId: e.paperId,
            paperTitle: e.paperTitle,
            orcid: e.orcid,
          }),
        ),
      400 + i * 550,
    ),
  );
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
    accrued: Number((citations * AMOUNT).toFixed(4)),
    wallet: randomHex(40),
  };
}

export async function mockClaim(_account: ClaimAccount): Promise<{ txHash: string }> {
  await sleep(1100); // simulates the settlement
  return { txHash: randomHex(40) };
}
