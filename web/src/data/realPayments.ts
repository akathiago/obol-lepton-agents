// web/src/data/realPayments.ts
//
// The REAL payment source: a tiny pub/sub the Ledger subscribes to (same interface
// as the old mock). realData.ts pushes into it the payment events the backend emits
// as it settles each cited author over the x402 / Circle Gateway rail.

import type { Payment, PaymentSource } from "./types";

const listeners = new Set<(p: Payment) => void>();

export const realPaymentSource: PaymentSource = {
  subscribe(onPayment) {
    listeners.add(onPayment);
    return () => listeners.delete(onPayment);
  },
};

/** Pushes one real payment to every Ledger subscriber. */
export function emitRealPayment(p: Payment) {
  listeners.forEach((l) => l(p));
}
