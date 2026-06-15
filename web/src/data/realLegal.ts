// REAL out-of-corpus source: calls /api/legal-ask, which streams the legal flow
// (Unpaywall gate -> ingest legal copy -> Citations API + guard -> pay). The
// ndjson stream carries:
//   { type: "gate" }    -> the legal verdict (serve | stop) — surfaced immediately
//   { type: "text" }    -> partial answer (live, only when served + ingested)
//   { type: "note" }    -> honest aside (e.g. the legal copy is a PDF)
//   { type: "done" }    -> the structured LegalAskResult (verdict included)
//   { type: "payment" } -> one real settlement per cited author (into the ledger)

import type { LegalAskResult, LegalVerdict } from "./types";
import { emitRealPayment } from "./realPayments";

export interface LegalHandlers {
  onText?: (full: string) => void;
  onGate?: (v: LegalVerdict) => void;
  onNote?: (text: string) => void;
}

export function realLegalAsk(doi: string, question: string, h: LegalHandlers = {}): Promise<LegalAskResult> {
  return new Promise<LegalAskResult>((resolve, reject) => {
    (async () => {
      const res = await fetch("/api/legal-ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doi, question }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let resolved = false;

      for (;;) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);

          if (ev.type === "gate") {
            h.onGate?.(ev.verdict);
          } else if (ev.type === "text") {
            h.onText?.(ev.text);
          } else if (ev.type === "note") {
            h.onNote?.(ev.text);
          } else if (ev.type === "done") {
            const { cited, ...result } = ev;
            void cited;
            resolved = true;
            resolve(result as LegalAskResult);
          } else if (ev.type === "payment") {
            emitRealPayment(ev.payment);
          } else if (ev.type === "error") {
            if (!resolved) throw new Error(ev.error);
            else console.error("legal payment-phase error:", ev.error);
          }
        }
      }

      if (!resolved) throw new Error("the stream ended without a result");
    })().catch((e) => reject(e));
  });
}
