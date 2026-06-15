// ─────────────────────────────────────────────────────────────────────────────
//  THE MOCK / REAL BOUNDARY.
//
//  `ask` is now REAL: it hits the /api/ask backend (retrieve -> Citations API ->
//  verify) over the real corpus. Payments are still mock — that's the next stage.
//  When you wire real on-chain payments, swap paymentSource / signInWithOrcid /
//  claimFees for their real versions (same interface). The components don't change.
// ─────────────────────────────────────────────────────────────────────────────

import { mockClaim, mockSignInWithOrcid } from "./mockData";
import { realAsk } from "./realData";
import { realPaymentSource } from "./realPayments";

export const paymentSource = realPaymentSource; // ← real payments over Circle Gateway
export const ask = realAsk; // ← real answers over the corpus
export const signInWithOrcid = mockSignInWithOrcid; // claim flow still mock (next step)
export const claimFees = mockClaim;
