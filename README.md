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
4. **The guard** (`agent/verify.ts`) re-verifies, in plain local code, that each cited span really is a substring of the paper. Only spans that survive this check can trigger a payment.
5. For each paper whose spans support the answer, OBOL fires a **nanopayment to the author's wallet** via x402 / Circle Gateway, with a receipt that lands on `testnet.arcscan.app`.
6. **Left:** the answer, each claim anchored to its literal cited span. **Right:** the *authors' ledger* — real money dropping to real researchers' wallets in real time, with explorer links and a most-cited leaderboard.

When a user asks for a *closed* paper, OBOL **does not pirate**: it uses Unpaywall to find the legal version the author themselves archived, serves that, and pays the author — never the publisher. If no legal version exists, it stops.

## Closing the loop: Agent mode (who pays OBOL)

The split screen shows the *outflow* — authors getting paid. **Agent mode** adds the *inflow*, and it's the same x402 rail pointed the other way: an external **client agent** pays OBOL per query before OBOL answers.

1. The agent hits OBOL's query endpoint and gets a **`402 Payment Required`** (the toll, in USDC).
2. It signs an EIP-3009 authorization and pays the toll to OBOL's **treasury** (on-chain, via Circle Gateway).
3. Only then does OBOL run the loop — and pays each cited author out of the same rail.
4. The agent receives the answer *and* the money-flow breakdown from the very call it paid with.

So the whole value chain settles in stablecoin: **agent → OBOL → authors**. The toll covers the author payouts plus the (off-chain) inference cost; the remainder is OBOL's margin. The author payments are real and on-chain; the inference cost is a real cost OBOL settles off-chain with the model provider — stated plainly, in the same spirit as the honest limit above.

Run it: `npm run agent-demo -- "your question"` (needs the AGENT wallet funded; see *Run it* below).

For the agentic core and the cost engineering behind it — with measured before/after numbers — see [`docs/PITCH.md`](docs/PITCH.md).

## Where the AI decides vs. where code decides (the agentic core)

| Decision | Who | Frequency |
|---|---|---|
| Retrieval, chunk→author mapping, **substring guard**, signing, spend cap, payment, anchoring | Deterministic code | Always, free |
| Drafting the answer + what to cite | LLM, grounded (Claude + Citations API) | 1 per query |
| Groundedness check (is the claim entailed by the span?) | LLM judge (optional) | 1 per cited paper |

**Everything verifiable is code; the LLM only drafts and judges.** Each payment carries the attestation of the citation that justified it.

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
cp .env.example .env   # set ANTHROPIC_API_KEY (and ANTHROPIC_MODEL)

# 3. run the demo UI (retrieve → Citations API → guard, over the real corpus)
cd web && npm run dev  # open the printed localhost URL

# 4. the on-chain payment rail (testnet)
npx tsx scripts/gen-wallet.mts      # generate testnet wallets into .env (idempotent)
#   → fund the printed PAYER and AGENT addresses at https://faucet.circle.com (Arc testnet)
npx tsx scripts/probar-balance.mts  # smoke test: RPC + chain + SDK
npx tsx scripts/probar-pago.mts     # the minimal end-to-end nanopayment → tx on the explorer

# 5. Agent mode — the closed loop (agent pays OBOL → OBOL answers → OBOL pays authors)
npm run agent-demo -- "Why do LLM agents fail on long-horizon tasks?"
```

## Status (Lepton, June 2026)

- ✅ Corpus of open-access papers + author/ORCID metadata
- ✅ Deterministic retrieval + Citations-API generation + the substring guard
- ✅ Split-screen UI (answer with inline citations + live authors' ledger)
- ✅ Payment rail working end-to-end on Arc testnet: EIP-3009 authorization → Circle Gateway verify + settle. A real $0.001 USDC nanopayment from the agent wallet to an author wallet (on-chain Gateway deposit + asynchronous batched settlement)
- ✅ Wired end-to-end: every verified citation pays its author on-chain (dynamic payTo per author) over an 871-author seeded wallet registry; the authors' ledger streams the real settlements live
- ✅ Out-of-corpus legal discovery (Unpaywall): ask a paper by DOI and a second guard (`agent/unpaywall.ts`) decides serve/stop — open license or author-archived copy → fetch the legal version, answer over it, pay the author; closed/paywalled → stop, never pirate
- ✅ Agent mode (closed loop): an external client agent pays OBOL per query over x402 (`402 → settle toll → answer`), and OBOL pays the cited authors out of the toll — the whole chain agent → OBOL → authors settles in USDC on Arc (`npm run agent-demo`)
- ✅ Model is selectable per query (Opus 4.8 / Sonnet 4.6 / Haiku 4.5) — the substring guard is identical regardless, so it's a pure cost/quality knob
- 🚧 Next: ORCID claim flow (real authors bind their own wallet), live deploy

## License

Apache-2.0.
