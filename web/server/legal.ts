// web/server/legal.ts
//
// The OUT-OF-CORPUS flow: answer a question about a paper that is NOT in OBOL's
// open-access corpus, addressed by DOI — but only ever through a LEGAL copy.
//
//   1. legal guard (unpaywall.ts): serve | stop, with the reason.
//   2. stop  -> emit the honest refusal and end. No fetch, no answer, no payment.
//   3. serve -> ingest the legal copy (ingest.ts), then run the SAME Citations
//      API + substring guard + per-author payment the in-corpus loop uses.
//
// runLegalAskStream() is an async generator emitting ndjson events:
//   { type: "gate", verdict }                 -> the legal decision (always first)
//   { type: "text", text }                    -> streamed answer (serve + ingested)
//   { type: "note", text }                    -> honest aside (e.g. PDF-only)
//   { type: "done", ...result, verdict, ... } -> final structured result
//   { type: "payment", payment }              -> one settlement per cited author

import { lookupUnpaywall, legalGate } from "../../agent/unpaywall";
import { ingestLegalPaper } from "../../agent/ingest";
import { payForCitations } from "../../agent/pay";
import { buildResult, getClient, MODEL, DOC_CAP, ANSWER_SYSTEM, type SentDoc } from "./loop";

const DEFAULT_QUESTION = "What does this paper contribute, and what are its main findings?";

export async function* runLegalAskStream(doi: string, question?: string): AsyncGenerator<any> {
  const q = (question ?? "").trim() || DEFAULT_QUESTION;

  // 1. The legal guard.
  const rec = await lookupUnpaywall(doi);
  const verdict = legalGate(doi, rec);
  yield { type: "gate", verdict };

  // 2. Stop honestly — no fetch, no answer, no payment.
  if (verdict.decision === "stop") {
    yield { type: "done", question: q, verdict, stopped: true, ingested: false, segments: [], cited: [], sources: [], stats: { found: 0, verified: 0, partial: 0, dropped: 0 }, noMatch: false, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, cached: false } };
    return;
  }

  // 3a. Serve, but the only legal copy isn't ingestable text (PDF-only).
  const paper = await ingestLegalPaper(rec!, verdict);
  if (!paper) {
    yield { type: "note", text: "Legal open version located, but it's a PDF — this demo ingests HTML/text sources, so it stops short of answering. The gate verdict (legal to use) still stands." };
    yield { type: "done", question: q, verdict, stopped: false, ingested: false, segments: [], cited: [], sources: [], stats: { found: 0, verified: 0, partial: 0, dropped: 0 }, noMatch: false, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, cached: false } };
    return;
  }

  // 3b. Serve + ingested: answer over the single legal document, then pay.
  const sent: SentDoc[] = [{ id: paper.id, score: 1, title: paper.title, text: paper.text.slice(0, DOC_CAP), authors: paper.authors }];

  const documents = sent.map((d) => ({
    type: "document",
    title: d.title,
    source: { type: "text", media_type: "text/plain", data: d.text },
    citations: { enabled: true },
  }));

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: ANSWER_SYSTEM,
    messages: [{ role: "user", content: [...documents, { type: "text", text: q }] }],
  } as any);

  let acc = "";
  for await (const event of stream as any) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      acc += event.delta.text;
      yield { type: "text", text: acc };
    }
  }

  const final = await stream.finalMessage();
  const out = buildResult(q, final, sent);
  yield { type: "done", ...out, verdict, stopped: false, ingested: true, sourceUrl: paper.sourceUrl };

  // Real nanopayments to each cited author, streamed into the same ledger.
  if (out.cited.length > 0) {
    const results = await payForCitations(out.cited);
    let i = 0;
    for (const r of results) {
      yield {
        type: "payment",
        payment: {
          id: `pay-legal-${Date.now()}-${i++}`,
          author: r.author,
          paperId: r.paperId,
          paperTitle: r.paperTitle ?? "",
          amount: r.amount,
          txHash: r.ref ?? "",
          timestamp: Date.now(),
          orcid: r.orcid,
          wallet: r.wallet,
          pending: r.pending ?? !r.ok,
        },
      };
    }
  }
}
