# OBOL

**An academic research agent that attacks the *cause* of Sci-Hub, not its method: when an AI uses a paper, the paper's author gets paid — directly, on-chain, in sub-cent USDC.**

Built for the **Lepton Agents Hackathon** (Canteen × Circle), on **Arc** — Circle's stablecoin-native L1.

---

## The problem

Reading one paywalled paper costs ~$40. Of that $40, the researcher who wrote it gets **zero**. Sci-Hub "solved" this by pirating. The academic micropayment never existed — not because nobody wanted it, but because a card fee floor of ~30¢ made a $0.05 payment absurd (the fee was 6× the payment). Arc breaks that floor.

OBOL is the first time the exact attribution of a RAG answer — *which paper did I actually use?* — becomes an automatic payment to the author, with an on-chain receipt, over **100% legal open-access content**.

## The loop (what the judge sees, one split screen)

1. A researcher asks a question.
2. OBOL retrieves chunks from its corpus of **open-access** papers (deterministic BM25 retrieval).
3. It generates the answer with the **Anthropic Citations API**, which guarantees at the API level that every cited span is a *literal* substring of the source paper — not hallucinated.
4. **The guard** (`agent/verify.ts`) re-verifies, in plain local code, that each cited span really is a substring of the paper — an exact match, or a high-coverage partial that is flagged as such. Only spans that survive this check can trigger a payment.
5. For each paper whose spans support the answer, OBOL fires a **nanopayment to the author's wallet** via x402 / Circle Gateway, with a receipt that lands on `testnet.arcscan.app`.
6. **Left:** the answer, each claim anchored to its literal cited span. **Right:** the *authors' ledger* — USDC settling to each cited author's wallet in real time (batched Circle Gateway settlement on Arc testnet; explorer links + a most-cited leaderboard). The 150-paper corpus is seeded with **893 testnet author wallets** so the loop runs end-to-end today.

When a user asks for a *closed* paper, OBOL **does not pirate**: it uses Unpaywall to find the legal version the author themselves archived, serves that, and pays the author — never the publisher. If no legal version exists, it stops.

## Closing the loop: Agent mode (who pays OBOL)

The split screen shows the *outflow* — authors getting paid. **Agent mode** adds the *inflow*, and it's the same x402 rail pointed the other way: an external **client agent** pays OBOL per query before OBOL answers.

1. The agent hits OBOL's query endpoint and gets a **`402 Payment Required`** (the toll, in USDC).
2. It signs an EIP-3009 authorization and pays the toll to OBOL's **treasury** (on-chain, via Circle Gateway).
3. Only then does OBOL run the loop — and pays each cited author out of the same rail.
4. The agent receives the answer *and* the money-flow breakdown from the very call it paid with.

So the whole value chain settles in stablecoin: **agent → OBOL → authors**. The toll covers the author payouts plus the (off-chain) inference cost; the remainder is OBOL's margin. At the demo default (**Haiku 4.5, a $0.03 toll**) the margin is genuinely **positive** (~+$0.01/query); trading up to Sonnet/Opus in the model selector costs more and turns it negative — that's the cost/quality dial, made explicit. The author payments are real and on-chain; the inference cost is a real cost OBOL settles off-chain with the model provider (you can't pay Anthropic in USDC on Arc) — stated plainly, in the same spirit as the honest limit above.

Run it: `npm run agent-demo -- "your question"` (needs **both** the AGENT and PAYER wallets funded + an `ANTHROPIC_API_KEY`; see *Run it* below).

For the agentic core and the cost engineering behind it — with measured before/after numbers — see [`docs/PITCH.md`](docs/PITCH.md).

## Architecture

```text
  ┌─ Client agent (+ wallet) ─┐
  │   asks a question and      │   ① POST /agent-query
  │   pays OBOL per query      │ ─────────────────────────────►  x402 toll gate
  └────────────┬───────────────┘   ◄── ② 402 Payment Required ──   payments/toll.mts
               │                    ③ EIP-3009 authorization (sign + pay)
               ▼
     Circle Gateway settle  ──►  OBOL treasury wallet  ──┐  toll = $0.03 USDC
     (USDC · Arc testnet)                                │  funds the run
                                                         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  OBOL pipeline — linear, no agent framework                               │
  │                                                                           │
  │    retrieve  ─►   DECIDE   ─►   ask     ─►   guard     ─►   pay            │
  │    BM25           budgeted      Claude       substring      1 USDC nano-   │
  │    (code)         LLM agent     Citations    match          payment per    │
  │                                 API          (code)         verified cite  │
  │                                                                           │
  │    ▸ the agentic core is DECIDE: under a hard per-query budget the LLM     │
  │      chooses which papers are worth paying to cite; deterministic code     │
  │      enforces the cap and SIGNS the decision before any money moves.       │
  └───────────────────────────────────────────────────────────┬──────────────┘
                                                               │  dynamic payTo
                                                               ▼  = author wallet
                                          ┌─────────────────────────────────────┐
                                          │  Authors' ledger (streams live)      │
                                          │  893 seeded testnet wallets ·         │
                                          │  Circle Gateway settlement on Arc     │
                                          └─────────────────────────────────────┘

  Out-of-corpus DOI?  →  Unpaywall legal gate (agent/unpaywall.ts):
     open license / author-archived copy  →  fetch it, answer, pay the author
     paywalled · no legal version         →  STOP. Never pirate.

  Whole chain settles in USDC on Arc:  agent ──► OBOL treasury ──► authors
  Legend:  LLM decides ▸ DECIDE, ask      Code decides ▸ retrieve, guard, budget, sign, pay
```

## Where the AI decides vs. where code decides (the agentic core)

The agentic moment is the **allocation decision** (`agent/decide.ts`): given a hard per-query budget, the LLM agent reasons about which retrieved papers are genuinely worth *paying* to cite — and which are tangential or redundant and should be discarded. It does **not** have to spend the whole budget, and routinely doesn't. Then deterministic code enforces the cap and the agent **signs** its decision before any money moves.

| Decision | Who | Frequency |
|---|---|---|
| **Allocation — which candidate papers are worth paying to cite, under a budget** | **LLM agent (reasons + prioritizes), `decide.ts`** | **1 per query** |
| Budget enforcement (the LLM proposes, code disposes — the cap the LLM can't exceed) | Deterministic code | Always, free |
| Drafting the grounded answer + which spans to cite | LLM (Claude + Citations API) | 1 per query |
| Retrieval (BM25), substring guard, attestation signing, payment, anchoring | Deterministic code | Always, free |

**The LLM reasons and prioritizes; deterministic code enforces, verifies, and pays.** Everything verifiable is code — the budget cap, the substring guard, the signature. Each payment carries the signed attestation of the decision that justified it.

## Honest limit (stated out loud, on purpose)

OBOL proves **verifiable attribution** — the answer is anchored to literal spans of the paper — **not verified necessity** (that the paper was strictly indispensable; the model might have known it anyway). This is trust-minimized, not trustless. Naming the limit is part of the design.

## Why it's legal (≠ Sci-Hub)

Legality comes 100% from the **license**, never from the payment. The payment is an ethical layer on top, never a permission to access. OBOL:
- only uses open-access content (CC0 / CC-BY / CC-BY-SA), or the legally author-archived version verified via Unpaywall;
- never hosts, caches, or unlocks paywalled papers;
- never scrapes publisher sites, uses institutional credentials/proxies, or circumvents DRM;
- stops honestly when no legal version exists.

## Stack

- **Agent:** TypeScript, no agent framework — the loop is linear (retrieve → ask → verify → pay).
- **Model:** Claude via the Anthropic **Citations API** (one call per query).
- **Identity:** ORCID + OpenAlex map each author to a wallet (an author claims their wallet by proving ORCID ownership).
- **Payments:** forked from `circlefin/arc-nanopayments` — off-chain **EIP-3009** authorizations batched and settled by **Circle Gateway**, so a citation costs less gas than the payment itself.
- **Frontend:** React + Vite (split screen: answer + authors' ledger).

### Circle tools used

Nanopayments · Circle Gateway · x402 · USDC · EIP-3009 · (custodial onboarding via Circle Wallets, EURC/App Kit Swap for non-USD payout — optional).

### Arc testnet

| | |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` |
| Gateway Wallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| Explorer | https://testnet.arcscan.app |

## Run it

> Requires **Node 22+** and an Anthropic API key. Everything is testnet — USDC has no real value.

```bash
# 1. install
npm install            # root (agent + payment scripts)
cd web && npm install  # frontend

# 2. configure
cp .env.example .env   # REQUIRED: set ANTHROPIC_API_KEY. Default model is Haiku 4.5 (cheapest).

# 3. run the demo UI (retrieve → decide → Citations API → guard, over the real corpus)
cd web && npm run dev  # open the printed localhost URL — needs ANTHROPIC_API_KEY set in step 2

# 4. the on-chain payment rail (testnet)
npx tsx scripts/gen-wallet.mts      # generate PAYER + AUTHOR + AGENT testnet wallets into .env (idempotent)
#   → fund BOTH the printed PAYER and AGENT addresses at https://faucet.circle.com (Arc testnet)
npx tsx scripts/probar-balance.mts  # smoke test: RPC + chain + SDK
npx tsx scripts/probar-pago.mts     # the minimal end-to-end nanopayment → settlement ref on the explorer

# 5. Agent mode — the closed loop (agent pays OBOL → OBOL answers → OBOL pays authors)
#    Requires ANTHROPIC_API_KEY + BOTH the AGENT and PAYER wallets funded (else payouts show as escrow).
npm run agent-demo -- "Why do LLM agents fail on long-horizon tasks?"                    # Haiku, profitable
npm run agent-demo -- "Why do LLM agents fail on long-horizon tasks?" claude-sonnet-4-6  # trade up
```

## Status (Lepton, June 2026)

- ✅ Corpus of open-access papers + author/ORCID metadata
- ✅ Deterministic retrieval + Citations-API generation + the substring guard
- ✅ Split-screen UI (answer with inline citations + live authors' ledger)
- ✅ Payment rail working end-to-end on Arc testnet: EIP-3009 authorization → Circle Gateway verify + settle. A real $0.001 USDC nanopayment from the agent wallet to an author wallet (on-chain Gateway deposit + asynchronous batched settlement)
- ✅ Wired end-to-end: every verified citation pays its author on-chain (dynamic payTo per author) over a 150-paper corpus seeded with 893 testnet author wallets; the authors' ledger streams the real settlements live
- ✅ Out-of-corpus legal discovery (Unpaywall): ask a paper by DOI and a second guard (`agent/unpaywall.ts`) decides serve/stop — open license or author-archived copy → fetch the legal version, answer over it, pay the author; closed/paywalled → stop, never pirate
- ✅ Agent mode (closed loop): an external client agent pays OBOL per query over x402 (`402 → settle toll → answer`), and OBOL pays the cited authors out of the toll — the whole chain agent → OBOL → authors settles in USDC on Arc (`npm run agent-demo`)
- ✅ Model is selectable per query (Opus 4.8 / Sonnet 4.6 / Haiku 4.5) — the substring guard is identical regardless, so it's a pure cost/quality knob
- 🚧 Next: ORCID claim flow (real authors bind their own wallet), live deploy

## License

Apache-2.0.
