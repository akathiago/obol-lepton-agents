# OBOL — pre-submission checklist & demo tips

What's left before submitting to the Lepton hackathon. The code is hardened and the
economics are positive by default (Haiku + $0.03 toll → ~+$0.01/query). These are the
human-only tasks and the talking points for the demo.

## Before you record / submit

- [ ] **Fund both testnet wallets** at https://faucet.circle.com (Arc testnet):
      - `PAYER`  — OBOL's wallet, pays the authors (and receives the toll).
      - `AGENT`  — the external client agent that pays OBOL per query.
      - Addresses are printed by `npx tsx scripts/gen-wallet.mts` (and stored in `.env`).
- [ ] **Set `ANTHROPIC_API_KEY`** in `.env` (required — the answer call needs it).
- [ ] **Dry-run the 4 suggested chips** in the web UI before filming, so the live ledger
      shows **settled (green)** payments, not escrow. Ask *fresh* questions on camera —
      a repeated question hits the cache and won't move the ledger as dramatically.
- [ ] **Confirm the economics panel is green** (positive margin) on the default model
      (Haiku). Switching to Sonnet/Opus turns it negative on purpose — show that as the
      cost/quality dial, not as a bug.

## The two things that most move the judges' needle

- [ ] **Record a 2–3 min demo video** (screen capture of the split screen + one
      `npm run agent-demo` run showing the on-chain money flow).
- [ ] **Deploy a live link** (Vercel/Netlify for the web UI). Still on the roadmap
      (`🚧 Next: live deploy`). Once you have it, add the video + link at the top of the README.

## Talking points (what to say)

- **The agentic core is `DECIDE`** (`agent/decide.ts`): under a hard per-query budget, the
  LLM picks which papers are worth *paying* to cite; deterministic code enforces the cap and
  **signs** the decision before any money moves. (See the README architecture diagram + table.)
- **Circle/x402 is used both ways**: outflow (pay authors) and inflow (the client agent pays
  OBOL per query via `402 → settle toll → answer`). The whole chain settles in USDC on Arc.
- **Cost engineering = an agentic property**: the same budget that bounds spend also bounds how
  much context goes to the expensive answer call. Passage selection cut inference ~80%; Haiku
  is ~17× cheaper than the naive baseline. Numbers in `docs/PITCH.md`.
- **Honest framing is a feature**: the "honest limit" (verifiable attribution, not verified
  necessity), the off-chain inference settlement, and the negative margin on premium models are
  all stated out loud. Don't hide them — they're credibility.

### Real vs. mock (be ready for the question)
- **Real:** retrieval (BM25), the allocation decision + attestation, Citations-API answer +
  substring guard, token/cost usage, the model selector, the economics panel, the Unpaywall
  legal gate, and the on-chain author payments (Circle Gateway settlement on Arc testnet).
- **Mock:** the **ORCID claim flow** only (sign-in returns a sandbox account) — it's the
  documented "next integration." It carries a "sandbox demo" disclaimer in the UI.

## Optional polish (deferred from the review — nice-to-have, not blocking)

- [ ] Style the legal "PDF-only" note as an explicit info state (not the same as no-match).
- [ ] Verify the split panels scroll independently at projector resolution (answer +
      DecisionLog + Sources + Economics can stack tall).
- [ ] Translate the remaining Spanish comments in `.env.example` / script names for
      international judges (cosmetic).

## Key defaults (so you don't get surprised on camera)

| Setting | Value | Where |
|---|---|---|
| Default model | `claude-haiku-4-5` | `.env.example` `ANTHROPIC_MODEL`, UI selector |
| Query toll | `$0.03` | `.env.example` `QUERY_TOLL` (loop.ts / toll.mts fallback) |
| Citation price | `$0.001` | `CITATION_PRICE` |
| Per-query budget | `$0.005` | `QUERY_BUDGET` (the cap the agent allocates under) |
| Corpus | 150 papers · 893 seeded author wallets | `corpus/` |
