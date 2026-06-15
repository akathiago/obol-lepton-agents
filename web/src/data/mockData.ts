// Capa de pagos (placeholder hasta pay.ts on-chain).
//
// Ya NO inventa actividad: el ledger reacciona SOLO a preguntas reales. Cada cita
// verificada de una consulta real dispara su asiento via firePaymentsFor (lo llama
// realData con las citas que devolvio el backend). Los montos y tx hash son
// simulados hasta que pay.ts los liquide on-chain. El flujo de claim con ORCID
// tambien es un placeholder hasta entonces.

import type { ClaimAccount, CorpusEntry, Payment, PaymentSource } from "./types";
import corpusSample from "./corpus-sample.json";

const CORPUS = corpusSample as CorpusEntry[];
const AMOUNT = 0.0005; // USDC por cita (simulado)

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

// ── stream de pagos: sin actividad ambiente; solo emite lo que firePaymentsFor empuja ──
const listeners = new Set<(p: Payment) => void>();
const emit = (p: Payment) => listeners.forEach((l) => l(p));

export const mockPaymentSource: PaymentSource = {
  subscribe(onPayment) {
    listeners.add(onPayment);
    return () => listeners.delete(onPayment);
  },
};

/** Dispara los pagos de un conjunto de citas — se llama con las citas REALES de una consulta real. */
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

// ── flujo de claim con ORCID (placeholder hasta on-chain) ──
export async function mockSignInWithOrcid(): Promise<ClaimAccount> {
  await sleep(950); // simula el round-trip del OAuth
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
  await sleep(1100); // simula el settlement
  return { txHash: randomHex(40) };
}
