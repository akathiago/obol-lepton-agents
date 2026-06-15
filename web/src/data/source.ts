// ─────────────────────────────────────────────────────────────────────────────
//  THE MOCK / REAL BOUNDARY.
//
//  `ask` is now REAL: it hits the /api/ask backend (retrieve -> Citations API ->
//  verify) over the real corpus. Payments are still mock — that's the next stage.
//  When you wire real on-chain payments, swap paymentSource / signInWithOrcid /
//  claimFees for their real versions (same interface). The components don't change.
// ─────────────────────────────────────────────────────────────────────────────

import { mockClaim, mockPaymentSource, mockSignInWithOrcid } from "./mockData";
import { realAsk } from "./realData";

export const paymentSource = mockPaymentSource; // payments still mock
export const ask = realAsk; // ← real answers over the corpus
export const signInWithOrcid = mockSignInWithOrcid;
export const claimFees = mockClaim;
