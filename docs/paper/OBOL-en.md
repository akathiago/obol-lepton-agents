# OBOL: Paying Authors When an AI Uses Their Paper

## An academic research agent that attacks the cause of Sci-Hub, not its method — when an AI uses a paper, the author gets paid, directly, on-chain, in sub-cent USDC

**Thiago**

[Affiliation — to be completed]

*Preprint — June 2026*

*Built for the Lepton Agents Hackathon (Canteen × Circle)*

---

## Abstract

Reading a single paywalled paper costs a reader roughly forty dollars, while the paper's author receives nothing. Sci-Hub responded to this by pirating — breaking the lock rather than fixing the system that made the lock necessary. The honest academic micropayment, the obvious alternative, never existed: not for lack of desire, but because the credit-card fee floor of about thirty cents made a five-cent payment economically absurd, with the fee six times larger than the payment itself. OBOL is a research agent built on Arc, Circle's stablecoin-native L1, where sub-cent transfers become viable and that floor disappears. OBOL answers a researcher's question grounded in a corpus of open-access papers and, for every literal span it cites, pays the cited author a nanopayment on-chain. The system is a linear five-stage loop — retrieve, decide, ask, guard, pay — in which the only agentic moment is an allocation decision: under a hard per-query budget, a language model reasons about which candidate papers are worth paying to cite, while deterministic code enforces the budget, verifies every cited span is a literal substring of the source, signs an attestation, and settles payment. We report real testnet runs in which passage selection cut input tokens by 82% (80.6k to 14.1k) and inference cost by 78%, while a substring guard held citation verification at 100% across every configuration. We state our central limitation plainly: OBOL proves verifiable *attribution*, not verified *necessity*. This is a trust-minimized system, not a trustless one, and naming that limit is part of the design.

**Keywords:** academic micropayments; author compensation; open access; stablecoin payments; x402; retrieval-augmented generation; verifiable attribution; AI agents; on-chain settlement; scholarly communication.

---

## 1. Introduction

The economics of academic publishing produce a specific absurdity. A reader who wants one paywalled paper pays on the order of forty dollars for it. The author of that paper — the person whose labor produced the knowledge — receives zero. The publisher captures the rent for access to work it did not produce.

Sci-Hub became the most famous response to this; empirical work shows it provides access to nearly all scholarly literature [1], against a backdrop in which a large and growing share of articles are legally open access [2]. But Sci-Hub did not fix the system; it pirated around it. It broke the lock instead of repairing the broken incentive behind the lock. The result is a tool that is illegal, adversarial to publishers, and — crucially — still does not pay authors. It substitutes free access for paid access without ever creating the missing thing: a way to compensate the author when their work is used.

Why did the honest alternative — a tiny payment to the author each time the work is consumed — never appear? Not because nobody wanted it. The obstacle was mechanical. Card payment rails impose a fee floor of roughly thirty cents per transaction, and beyond the raw fee there is the "mental transaction cost" that Szabo identified as fatal to micropayments [3]. Against that floor, a five-cent payment to an author is nonsensical: the fee is six times the payment. The academic micropayment was not undesirable; it was structurally impossible on the available rails. Disintermediated, low-friction value transfer — the move Bitcoin made against banks [4] — is what changes the picture. **Arc, Circle's stablecoin-native L1, breaks that floor** [13]: sub-cent transfers are viable, and the payment can finally be smaller than the value it carries.

There is a second, newer instance of the same extractive pattern, and it sharpens the motivation. A large language model such as Claude answers questions using knowledge distilled from papers whose authors were never paid. The model reproduces the publisher's old move: it monetizes access to knowledge it did not produce, except now the extractor is the AI platform rather than the journal. OBOL's thesis is that the same rail which makes author micropayments possible also lets us close *this* loop: when an AI uses a paper to answer, the author gets paid.

OBOL — named for the obol, the minimal coin placed with the dead to pay Charon for passage — is our attempt to attack the *cause* of Sci-Hub rather than its method. It was built for the Lepton Agents Hackathon (Canteen × Circle) and is released under Apache-2.0.

**Contributions.** This paper makes the following contributions:

- **A loop that pays authors for AI use.** We design and implement a linear five-stage research agent (retrieve → decide → ask → guard → pay) that, for every literal span an AI cites from an open-access paper, settles a sub-cent nanopayment to the cited author on-chain — attacking the cause of Sci-Hub rather than its method.
- **A disciplined agentic core.** We isolate the only model-discretion moment to a single budgeted allocation decision, signed as a wallet attestation *before* any money moves, while all verifiable steps (retrieval, substring verification, payment, anchoring) remain deterministic code.
- **An honestly bounded correctness claim.** We separate verifiable *attribution* from verified *necessity*, implement a two-layer substring guard that held citation verification at 100% across every configuration, and state plainly that the system is trust-minimized, not trustless.
- **Cost engineering with measured results.** We report a single-query testnet demonstration in which passage selection cut input tokens by 82% (80.6k → 14.1k) and inference cost by 78%, and we surface the real unit economics of a closed machine-to-machine payment loop, including the break-even toll.
- **A legality boundary.** We show how legality derives entirely from the content license (verified via Unpaywall), never from the payment, and how an out-of-corpus gate chooses to *serve* or *stop* rather than pirate.

---

## 2. Background and Related Work

**Open access and Sci-Hub.** Himmelstein et al. [1] showed that Sci-Hub provides access to the large majority of scholarly literature, demonstrating both the demand for frictionless access and the failure of the paywall model to serve readers. Piwowar et al. [2] quantified the prevalence and citation impact of legally open-access articles, establishing that a substantial corpus of papers can be used lawfully without circumvention. OBOL builds on the legal corpus the latter describes and positions itself against the piracy the former measures: it seeks the access Sci-Hub provides while restoring the author compensation Sci-Hub omits.

**The micropayment problem.** Szabo [3] argued that micropayments fail less because of raw fees and more because of "mental transaction costs" — the cognitive overhead of deciding whether each tiny payment is worth it. The corollary is that micropayments only become viable when the decision and the settlement are both removed from the human and made automatic. Nakamoto [4] provided the disintermediation precedent: a protocol that moves value without a trusted intermediary charging a toll. OBOL inherits both lessons — payments are decided by an agent under a budget (no human in the per-payment loop) and settle on a stablecoin rail with sub-cent fees.

**Retrieval-augmented generation.** OBOL's answer stage is a retrieval-augmented generation (RAG) pipeline in the sense of Lewis et al. [5]: an answer is grounded in retrieved documents rather than in parametric memory alone. Retrieval itself uses BM25, the probabilistic relevance framework of Robertson and Zaragoza [6], chosen for being deterministic and inspectable. Unlike standard RAG, OBOL attaches an economic consequence to grounding: each grounded span triggers a payment to the document's author.

**Author identity.** Mapping a cited paper to a payable author requires persistent identity. OBOL resolves authors through ORCID [8] and the open scholarly index OpenAlex [7], which together connect a work to its authors and, ultimately, to a wallet an author can claim by proving ORCID ownership.

**Legal open-access discovery.** For papers outside the seeded corpus, OBOL queries Unpaywall [9] to determine whether a legal open or author-archived version exists before serving anything. This makes legality a precondition of the loop, not a consequence of the payment.

**The payment rail.** Settlement uses x402 [11], an open payments protocol built over HTTP 402 "Payment Required" — a status code reserved but historically unused in RFC 9110, HTTP Semantics (§15.5.3). The underlying authorization standard is EIP-3009, "Transfer With Authorization" [10], which allows signed off-chain payment authorizations to be batched and settled on-chain. Settlement runs on Circle's Arc [13], an announced Layer-1 for stablecoin finance (announced Aug 2025; public testnet Oct 28 2025; mainnet beta planned 2026), via Circle Gateway. Generation uses the Anthropic Citations API [12], which guarantees at the API level that every cited span is a literal substring of its source document.

---

## 3. System Overview

OBOL is a linear loop with no agent framework. The control flow is explicit, readable code, and the only place a language model holds discretion is one allocation decision. The five stages are **retrieve → DECIDE → ask → guard → pay**:

1. **Researcher asks a question.**
2. **Retrieve.** Deterministic BM25 [6] retrieval runs over a corpus of open-access papers and returns roughly eight candidate papers. A relevance gate sits here: off-topic questions, which merely scatter common terms across unrelated papers, are answered honestly with "the corpus doesn't cover this" — zero tokens spent, zero money moved.
3. **Decide** (`agent/decide.ts`). This is the agentic core. Given a hard per-query budget and the price of citing each author, the language model reasons about relevance, redundancy, and cost-benefit, and chooses which candidate papers are worth *paying* to cite and which to discard. It is not obliged to spend the whole budget, and routinely does not. Only the papers it funds proceed to the expensive generation call.
4. **Ask.** The grounded answer is generated through the Anthropic Citations API [12] in a single call per query. The Citations API guarantees, at the API level, that every cited span is a literal substring of its source document — citations are not hallucinated.
5. **Guard** (`agent/verify.ts`). Deterministic local code independently re-verifies that each cited span really is a substring of the paper — either an exact match or a high-coverage partial that is explicitly flagged as such. Only spans that survive this check are allowed to trigger a payment.
6. **Pay.** For each paper whose surviving spans support the answer, OBOL issues a nanopayment to the author's wallet via x402 [11] / Circle Gateway, leaving an on-chain receipt on the Arc testnet explorer. The destination (`payTo`) is the author's own wallet, resolved dynamically.

### 3.1 Agent mode: closing the loop

The same x402 rail runs in reverse to fund OBOL itself, turning the system into a closed economic loop that settles entirely machine-to-machine:

1. An external client agent hits OBOL's query endpoint and receives **HTTP 402 Payment Required** — the toll, denominated in USDC.
2. The client signs an EIP-3009 [10] authorization and pays the toll to OBOL's treasury, on-chain, via Circle Gateway.
3. Only then does OBOL run the loop, paying each cited author out of the same rail.
4. The client receives the answer together with a full money-flow breakdown from the same call.

The whole value chain — agent → OBOL → authors — settles in stablecoin, machine-to-machine, with no human in the path.

---

## 4. The Agentic Core

Most of OBOL is deterministic by deliberate choice. The governing principle is:

> **The LLM reasons and prioritizes; deterministic code enforces, verifies, and pays. Everything verifiable is code.**

The single agentic moment is allocation, in `decide.ts`. Under a per-query budget the model cannot exceed, and knowing the price of citing each candidate author, the model decides which of the ~8 retrieved papers are worth paying to cite. This is genuine reasoning over a cost-benefit tradeoff: the model weighs whether a marginal paper adds enough relevance, net of redundancy with papers already selected, to justify its citation cost. It can — and frequently does — leave budget unspent.

The clean division of labor is what makes this safe to delegate to a model:

| Responsibility | Decided by | Frequency | Cost |
|---|---|---|---|
| Allocation: which candidates are worth paying to cite under budget | **LLM agent** (`decide.ts`) — the agentic moment | 1 per query | LLM call |
| Budget enforcement: the cap the LLM cannot exceed (`enforceBudget`) | Deterministic code | Always | Free |
| Drafting the grounded answer + which spans to cite | LLM (Claude + Citations API) | 1 per query | LLM call |
| Retrieval (BM25), substring guard, attestation signing, payment, anchoring | Deterministic code | Always | Free |

The agent does not get to move money on trust. Before any payment, **the agent signs its decision** — a wallet attestation (`attest`) committed *before* any money moves. Each subsequent payment carries the signed attestation of the citation that justified it. The decision is therefore on the record, cryptographically bound to the agent's wallet, ahead of settlement. The model proposes; the code disposes; and what the model proposed is signed and auditable.

---

## 5. Verifiable Attribution — and the Honest Limit

OBOL's correctness claim rests on two independent layers around citation.

First, generation uses the **Anthropic Citations API** [12], which guarantees at the API level that every cited span is a literal substring of the source document. The model cannot fabricate a quotation that does not appear in the paper.

Second, OBOL does not take that guarantee on faith. The **substring guard** (`agent/verify.ts`) is deterministic local code that re-checks every cited span against the paper text — an exact substring match, or a high-coverage partial that is flagged as partial. Only spans that pass trigger payment. The two layers are independent: even if the generation layer were wrong, the guard would catch a span that is not actually present.

This is why cheaper context never bought us hallucinated citations (Section 7): the guard is identical regardless of which model produced the answer or how much context it saw. The guard held at 100% in every configuration we ran.

**The honest limit.** OBOL proves verifiable *attribution* — that the answer is anchored to literal spans of a specific paper. It does **not** prove verified *necessity* — that the paper was strictly indispensable to the answer. The model might have known the cited fact independently and merely surfaced a matching span from the paper we paid for. We do not claim to have ruled this out. OBOL is therefore **trust-minimized, not trustless**, and we treat naming this limit as part of the design rather than a caveat to be buried. An attribution-faithful payment is a large and useful step; it is not a proof of counterfactual dependence, and we do not pretend it is.

---

## 6. Legality: License-Based, Not Sci-Hub

OBOL's legality comes **100% from the license, never from the payment**. Payment is an ethical layer placed on top of legal access — it is never a permission to access something the license does not already allow. This is the precise line that separates OBOL from Sci-Hub [1].

Concretely, OBOL:

- uses **only** open-access content (CC0, CC-BY, CC-BY-SA) [2] or the legally author-archived version of a paper, verified via Unpaywall [9];
- never hosts, caches, or unlocks paywalled papers;
- never scrapes publisher sites, never uses institutional credentials or proxies, and never circumvents DRM;
- **stops honestly** when no legal version of a requested paper exists.

### 6.1 The out-of-corpus legal gate

When a researcher asks about a paper outside the seeded corpus, identified by DOI, a second guard (`agent/unpaywall.ts`) decides *serve* or *stop*. If Unpaywall [9] reports an open license or an author-archived copy, OBOL fetches that legal version, answers over it, and pays the **author** — never the publisher. If the paper is paywalled with no legal version available, OBOL **stops**. It does not pirate. The decision to serve is gated on legality first; the payment to the author follows only when access was already lawful.

---

## 7. Cost Engineering: Five Levers

Running an LLM over full papers for every query is expensive, and an unprofitable agent is not an agent that survives contact with real economics. OBOL has five cost levers, listed in order of impact.

**Lever 0 — the agentic one.** The per-query budget caps *context*, not merely spend. Because only the funded subset of the eight candidates reaches the expensive `ask` call, the same allocation decision that bounds the author payout *also* bounds the context cost. Cost control falls out of agency for free — the budget decision does double duty.

**Lever 1 — passage selection (the big one)** (`selectPassages`, `web/server/loop.ts`). Instead of sending whole papers, OBOL sends each funded paper's HEAD (title, abstract, introduction) plus the WINDOWS with the most query-term overlap, capped at a character budget. Because the Citations API cites literal substrings of exactly what is sent, the substring guard is unaffected. This cut input tokens from 80.6k to 14.1k (−82%) and inference cost by 78% (Sonnet, counting both the decide and answer calls), with the guard still at 9/9.

**Lever 2 — model selection.** Opus 4.8, Sonnet 4.6, and Haiku 4.5 are selectable per query in both UI and API. Because the guard is identical regardless of model, this is a pure cost/quality dial with zero correctness risk. Haiku on chunked context ($0.0189) is roughly 17× cheaper than the naive Sonnet-whole-papers baseline ($0.3255).

**Lever 3 — prompt caching.** `cache_control` is applied to document blocks; `computeUsage` prices fresh input at 1×, cache writes at 1.25×, and cache reads at 0.1×. Honest note: this is situational. Identical repeated questions are already short-circuited by an in-memory cache (to $0), and cross-query cache hits only occur when two different questions fund the same papers within the five-minute window. It is implemented correctly but is **not** the dominant lever.

**Lever 4 — the relevance gate.** Off-topic questions never reach the LLM at all: zero tokens, zero spend, zero payments. Free refusals.

---

## 8. Evaluation

**Experimental setup.** We evaluate the cost-engineering levers on a single fixed query — *"Why do LLM agents fail on long-horizon tasks?"* — run end-to-end on the Arc testnet. We compare three configurations: (i) Sonnet 4.6 over whole papers (the naive baseline), (ii) Sonnet 4.6 with passage selection, and (iii) Haiku 4.5 with passage selection. Inference cost counts **both** LLM calls per query — the `decide` (allocation) call and the `ask` (answer) call — not the answer call alone. Citation verification is measured by the deterministic substring guard (Section 5), reported as verified-over-total cited spans. All runs execute the full loop, including real author nanopayments on the Arc testnet.

**Results.**

| Config | Input tokens | Inference cost | Citations verified | vs baseline |
|---|---|---|---|---|
| Sonnet 4.6 · whole papers (baseline) | 80,571 | $0.3255 | 9/9 | — |
| Sonnet 4.6 · passage selection | 14,128 | $0.0711 | 9/9 | −78% |
| Haiku 4.5 · passage selection | 12,202 | $0.0189 | 6/6 | −94% |

**Discussion.** Passage selection cut input tokens from 80,571 to 14,128 (−82%) and inference cost by 78% while citation verification stayed at 9/9 — the guard caught nothing because nothing was lost: sending HEAD plus high-overlap windows preserved exactly the substrings the model went on to cite. Switching to Haiku on the same chunked context drops inference cost a further step to $0.0189 — roughly 17× cheaper than the baseline — at 6/6 verified citations. Across all three configurations the substring guard held at 100%: **cheaper context did not buy hallucinated citations**, which is precisely the property the model/context dial was designed to preserve, since the guard is identical regardless of which model produced the answer or how much context it saw.

**This is a single-query, single-run demonstration, not a controlled benchmark.** We evaluate one question, one run per configuration, on a 150-paper corpus on testnet. The numbers demonstrate the *direction and magnitude* of the cost levers and the *invariance* of the guard; they are not a statistically controlled measurement over a query distribution, and we make no such claim. A proper benchmark over many queries, with variance reported, is future work.

---

## 9. Economics of the Closed Loop

Agent mode forces OBOL to confront its real unit economics, because money flows in as well as out. Per query, the flow is: the client agent pays a toll → OBOL pays the cited authors → OBOL keeps the remainder, minus its off-chain inference cost.

A point of honesty about that off-chain cost: **author payouts are real and on-chain** (Circle Gateway on Arc), but **inference is settled off-chain** with the model provider. You cannot pay Anthropic in USDC on Arc — we state this plainly rather than pretend the whole stack settles on one rail.

The break-even toll is therefore **inference cost + author payouts**:

- **Haiku:** $0.0189 inference + ~$0.002 author payouts ≈ **$0.021**. The demo's **$0.03 toll is profitable**, with a margin of about **+$0.01 per query**.
- **Sonnet:** $0.0711 inference + ~$0.003 author payouts ≈ **$0.074**, which needs a toll of about $0.08. At the $0.03 demo toll, **Sonnet runs at a loss — by design**.

The demo defaults to **Haiku at a $0.03 toll**, so it is margin-positive. Trading up to Sonnet or Opus turns the margin negative: that is the cost/quality dial made explicit in dollars. The value of closing the loop is precisely that it surfaced these real unit economics instead of letting them hide in a slide.

---

## 10. Implementation & Status

**Stack.** The agent is TypeScript with no agent framework — a linear loop. Generation uses Claude via the Anthropic Citations API [12], one call per query. Author identity is resolved through ORCID [8] + OpenAlex [7], mapping each author to a wallet (an author claims a wallet by proving ORCID ownership). Payments are forked from `circlefin/arc-nanopayments`: off-chain EIP-3009 [10] authorizations are batched and settled by Circle Gateway, so a citation costs less in gas than the payment itself carries. The frontend is React + Vite — a split screen with the answer and its inline citations on the left and a live authors' ledger on the right, with explorer links and a most-cited leaderboard. The corpus is 150 open-access papers seeded with 893 testnet author wallets so the loop runs end-to-end today.

**Circle / Arc.** Arc is Circle's stablecoin-native L1 [13] — an announced Layer-1 for stablecoin finance (announced Aug 2025; public testnet Oct 28 2025; mainnet beta planned 2026). Everything in this paper runs on Arc **testnet**; the USDC moved has no real economic value. Tools used: Nanopayments, Circle Gateway, x402 [11], USDC, and EIP-3009 [10]. Arc testnet parameters — chain ID `5042002`, RPC `https://rpc.testnet.arc.network`, USDC ERC-20 at `0x3600000000000000000000000000000000000000`, Gateway Wallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`, explorer `https://testnet.arcscan.app`.

**Done.** Corpus and ORCID metadata; deterministic retrieval, Citations-API generation, and the substring guard; the split-screen UI; the payment rail working end-to-end on Arc testnet (EIP-3009 → Circle Gateway verify+settle, real agent→author nanopayments); every verified citation paying its author on-chain over the 150-paper corpus; the out-of-corpus Unpaywall gate; the agent-mode closed loop; and per-query model selection.

**Not yet done.** The ORCID claim flow, where real authors bind their own wallets, and a live deploy.

---

## 11. Discussion / Vision: Bitcoin for Researchers

The north star is best stated by analogy. Bitcoin [4] removed the bank as intermediary — a protocol replaced the institution that charged a toll to move value, and, just as importantly, it removed the need to *ask permission* to transact. OBOL applies the same shape to science: a protocol replaces the **publisher** as the entity that decides who accesses a work, who gets paid, and what the work is worth.

The interesting consequence is that **reputation becomes endogenous**. Each verified citation in OBOL *is* a payment. The sum of payments flowing to an author is therefore a direct measure of how much their work was actually used — an on-chain record stating "your knowledge was used and someone paid for it." This is not an h-index, which is inflatable with self-citation; it is a record of paid use. A most-cited leaderboard already exists in the UI as the first concrete form of this.

The stronger leap is **agentic research**: when agents not only consult papers but produce results that other agents in turn cite and pay for, reputation becomes a graph of citations-with-money flowing among agents and authors alike. The unit of scientific value would stop being the paper-in-a-journal and become the **cited-and-paid contribution**, peer-to-peer, with no publisher in the middle.

We are deliberate about not overclaiming. Bitcoin did not replace banks overnight; what it did immediately was remove the *need to ask permission*. By analogy, OBOL removes the need to ask the journal for permission — it does not, and we do not claim it does, "kill Elsevier." The hard, slow part is onboarding real authors, and that is future work, not a result.

---

## 12. Threats to Validity / Limitations

We restate the limitations explicitly, because they are part of OBOL's identity rather than footnotes to it.

- **Attribution, not necessity.** OBOL proves the answer is anchored to literal spans of a paper, not that the paper was strictly indispensable. The model might have known the cited fact independently and merely surfaced a matching span. The system is trust-minimized, not trustless (Section 5).
- **Off-chain inference.** Author payouts settle on-chain, but inference is paid off-chain to the model provider; you cannot pay Anthropic in USDC on Arc, so the full stack does not settle on a single rail (Section 9).
- **Single-query evaluation, not a benchmark.** The reported numbers come from one fixed query, one run per configuration, on testnet. They demonstrate the direction and magnitude of the cost levers and the invariance of the guard, but they are not a controlled benchmark over a query distribution (Section 8).
- **Author onboarding is unsolved and is the hard part.** The corpus runs on 893 seeded testnet wallets. The ORCID claim flow, by which real authors bind and control their own wallets, is not yet built, and a live deploy is pending (Section 10). Driving real adoption is expected to come first from the agent's own payments closing the loop, not from author onboarding (future work).
- **Cost/quality is a real tradeoff with a sign.** At the demo toll, Haiku is profitable and Sonnet/Opus run at a loss. Higher answer quality currently costs margin (Sections 7 and 9).
- **Caching is situational.** Prompt caching is implemented correctly but is not a dominant cost lever (Section 7).
- **Testnet only — no real economic value yet.** Everything runs on Arc testnet (mainnet beta planned 2026); the USDC moved carries no real value.
- **Corpus size.** The corpus is 150 open-access papers; broadening it is future work.

---

## 13. Conclusion

OBOL attacks the *cause* of Sci-Hub rather than its method: instead of breaking the paywall lock, it restores the missing incentive behind it by paying authors directly, on-chain, in sub-cent USDC whenever an AI uses their paper. The contribution is a disciplined design — a linear retrieve → decide → ask → guard → pay loop in which the sole agentic moment is a budgeted, signed allocation decision and every verifiable step is deterministic code — together with an honestly bounded correctness claim (verifiable attribution, not verified necessity) and a measured, if single-query, demonstration that cost can fall 78–94% without the substring guard ever admitting a hallucinated citation. The system runs end-to-end today on Arc testnet, with real machine-to-machine settlement and no real economic value, and the hard remaining work — real author onboarding via the ORCID claim flow, a live deploy, a broader corpus, and a proper multi-query benchmark — is named rather than hidden. The north star is not a better journal: it is a world where the unit of scientific value is the cited-and-paid contribution, settled peer-to-peer.

---

## References

[1] Himmelstein, D. S., Romero, A. R., Levernier, J. G., Munro, T. A., McLaughlin, S. R., Greshake Tzovaras, B., & Greene, C. S. (2018). Sci-Hub provides access to nearly all scholarly literature. *eLife*, 7, e32822. https://doi.org/10.7554/eLife.32822

[2] Piwowar, H., Priem, J., Larivière, V., Alperin, J. P., Matthias, L., Norlander, B., Farley, A., West, J., & Haustein, S. (2018). The state of OA: a large-scale analysis of the prevalence and impact of Open Access articles. *PeerJ*, 6, e4375. https://doi.org/10.7717/peerj.4375

[3] Szabo, N. (c. 1999). Micropayments and Mental Transaction Costs. *2nd Berlin Internet Economics Workshop*. https://nakamotoinstitute.org/library/micropayments-and-mental-transaction-costs/

[4] Nakamoto, S. (2008). Bitcoin: A Peer-to-Peer Electronic Cash System. https://bitcoin.org/bitcoin.pdf

[5] Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., Küttler, H., Lewis, M., Yih, W., Rocktäschel, T., Riedel, S., & Kiela, D. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. *Advances in Neural Information Processing Systems*, 33, 9459–9474. arXiv:2005.11401.

[6] Robertson, S., & Zaragoza, H. (2009). The Probabilistic Relevance Framework: BM25 and Beyond. *Foundations and Trends in Information Retrieval*, 3(4), 333–389. https://doi.org/10.1561/1500000019

[7] Priem, J., Piwowar, H., & Orr, R. (2022). OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts. arXiv:2205.01833.

[8] ORCID — Open Researcher and Contributor ID. https://orcid.org/

[9] Unpaywall, operated by OurResearch. https://unpaywall.org/

[10] Kim, P. J., Britz, K., & Knott, D. (2020). ERC-3009: Transfer With Authorization. *Ethereum Improvement Proposal*. https://eips.ethereum.org/EIPS/eip-3009

[11] Coinbase (2025). x402: an open payments protocol over HTTP 402. https://github.com/coinbase/x402. (HTTP 402 "Payment Required" is reserved in RFC 9110, HTTP Semantics, §15.5.3.)

[12] Anthropic (2025). Citations (Claude API feature). https://platform.claude.com/docs/en/build-with-claude/citations

[13] Circle (2025). Arc — an open Layer-1 blockchain purpose-built for stablecoin finance. Announced Aug 2025; public testnet Oct 28 2025; mainnet beta planned 2026. https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance

---

*OBOL — Lepton Agents Hackathon (Canteen × Circle), on Arc testnet. License: Apache-2.0.*
