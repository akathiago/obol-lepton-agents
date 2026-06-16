# OBOL — the agentic core, and how we made it cheap

This is the document for the judges' question *"where is the agent, really?"* — and the
follow-up *"and how is this not ruinously expensive?"* The two answers are the same answer:
**in OBOL, controlling cost is a consequence of the agency, not a trick bolted on top.**

---

## 1. Where the agent is

OBOL's loop is linear and small on purpose: `retrieve → decide → ask → guard → pay`. Exactly
one of those steps is where the system stops being automation and becomes an **agent**.

| Step | Who decides | What it decides |
|---|---|---|
| `retrieve` | Deterministic code (BM25) | Which papers are candidates for this question |
| **`decide`** | **The LLM, under a hard budget** | **Which candidates are worth *paying* to cite — and which to discard** |
| `ask` | The LLM (Citations API) | The prose answer + which spans to cite |
| `guard` | Deterministic code | Whether each cited span is a *literal* substring of the paper |
| `pay` | Deterministic code | The on-chain nanopayment to each verified author |

The agentic moment is **`decide`** (`agent/decide.ts`): the **allocation agent**. A researcher
asks a question; retrieval returns 8 candidate papers; the agent is given a **hard per-query
budget** and the price of citing each author. It then *reasons* about relevance, redundancy,
and cost/benefit, and chooses which papers to fund — it does **not** have to spend the whole
budget, and routinely doesn't.

The split that makes this robust — and is the whole pitch:

- **the LLM reasons and prioritizes** → relevance, cite-or-discard, worth-paying, why;
- **deterministic code enforces** → a budget cap the LLM physically cannot exceed (`enforceBudget`);
- **the agent signs its decision** → a wallet attestation (`attest`) committed **before** any money moves.

> Everything verifiable is code; the LLM only drafts and judges. Every payment carries the
> signed attestation of the citation that justified it.

### Two sides of the same agent

- **Outflow:** the agent pays each cited author, on-chain, in sub-cent USDC.
- **Inflow (Agent mode):** an *external* client agent pays OBOL per query over **x402** —
  `402 Payment Required` → settle the toll → answer. The whole value chain settles in
  stablecoin, machine-to-machine: **agent → OBOL → authors**. No human in the loop.

### The honest limit (stated on purpose)

OBOL proves **verifiable attribution** — the answer is anchored to literal spans of the paper —
**not verified necessity** (that the model strictly needed the paper; it might have known the
fact anyway). Trust-minimized, not trustless. Naming the limit is part of the design.

---

## 2. How we made it cheap — and why that's *also* the agent

The naive version of this product is bankrupt: ship every retrieved paper, whole, to the
model, on every query. We measured it (below): **$0.25 per query**, against a toll an agent
would pay of a cent or two. Here is how we closed the gap, in order of impact.

### Lever 0 (the agentic one): the budget caps *context*, not just spend

The allocation agent funds a **subset** of the 8 retrieved candidates. Only the funded papers
ever reach the expensive `ask` call. So the same decision that bounds *what OBOL pays out*
also bounds *how much context it pays the model to read*. **Cost control falls out of the
agency** — fund fewer, pay less, send less. This is the lever the other four amplify.

### Lever 1: passage selection (the big one)

Instead of shipping whole papers to `ask`, OBOL sends each funded paper's **head** (title /
abstract / intro, for context) plus the **windows with the most query-term overlap**, capped
at a char budget (`selectPassages`, `web/server/loop.ts`). The Citations API still cites
literal substrings of *exactly what we send*, so **the substring guard is unaffected** — we
simply stop paying to ship paragraphs the answer never uses.

→ **Input tokens 77.7k → 11.3k (−85%). Inference cost −80%. Guard still 100%.**

### Lever 2: model selection

The model is a per-query knob (Opus 4.8 / Sonnet 4.6 / Haiku 4.5), selectable in the UI and
over the API. The substring guard is **identical** regardless of model, so this is a pure
cost/quality dial with zero correctness risk. Haiku on the chunked context is **16× cheaper**
than the naive baseline.

### Lever 3: prompt caching (with honest accounting)

Document blocks carry a cache breakpoint (`cache_control`), and `computeUsage` prices the
three token buckets correctly — fresh input 1×, cache **writes 1.25×**, cache **reads 0.1×** —
so any saving is visible rather than hidden. **Honest note:** for OBOL's access pattern the
benefit is *situational*. Identical repeated questions are already short-circuited by an
in-memory cache (→ $0), and cross-query cache hits only land when two *different* questions
fund the *same* papers within the 5-minute window. We implemented it correctly; it is **not**
the dominant lever. Chunking and model choice are.

### Lever 4: the relevance gate (free refusals)

Off-topic questions never reach the LLM at all: `retrieve` decides relevance from term
concentration, and an off-topic question that scatters common words across papers is answered
with *"the corpus doesn't cover this"* — **zero tokens, zero spend, zero payments.** The
cheapest query is the one OBOL declines to run.

---

## 3. The numbers (real runs, Arc testnet)

Same question (*"Why do LLM agents fail on long-horizon tasks?"*), measured end-to-end through
the Agent-mode closed loop (`npm run agent-demo`):

| Config | Input tokens | Inference cost | Citations verified | vs. baseline |
|---|---|---|---|---|
| Sonnet 4.6 · whole papers (baseline) | 77,716 | **$0.2474** | 11 / 11 | — |
| Sonnet 4.6 · passage selection | 11,273 | **$0.0504** | 8 / 8 | **−80%** |
| Haiku 4.5 · passage selection | 11,376 | **$0.0154** | 4 / 4 | **−94%** |

The guard holds at 100% in every config — cheaper context did not buy hallucinated citations.

---

## 4. The loop closes (and the toll that makes it solvent)

Per query, the money flow is: **agent pays toll → OBOL pays authors → OBOL keeps the rest**,
minus the (off-chain) inference cost.

- Author payouts are **real and on-chain** (Circle Gateway settlements on Arc).
- Inference is a **real cost OBOL settles off-chain** with the model provider — you cannot pay
  Anthropic in USDC on Arc. We state this plainly, in the same spirit as the honest limit.

**Break-even toll** = inference + author payouts:

- Haiku: `$0.0154 + 3×$0.001 ≈ $0.018` → a **$0.02** toll is profitable per query.
- Sonnet: `$0.0504 + $0.003 ≈ $0.053` → a **$0.055** toll is profitable per query.

So the closed loop isn't just a demo of plumbing — it surfaced the real unit economics, and
the same agentic design that makes attribution verifiable is what makes a sub-cent-to-a-couple-
cents toll cover a real research answer *and* pay the authors who made it possible.

---

### Reproduce it

```bash
npm run agent-demo -- "Why do LLM agents fail on long-horizon tasks?"                 # default model
npm run agent-demo -- "Why do LLM agents fail on long-horizon tasks?" claude-haiku-4-5   # cheap path
```
