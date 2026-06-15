// REAL source: calls the backend (/api/ask) which streams the retrieve (BM25) ->
// Citations API -> verify loop over the real corpus, and then pays each cited author
// over the x402 / Circle Gateway rail. The ndjson stream carries:
//   { type: "text" }    -> partial answer (live)
//   { type: "done" }    -> the structured result (the answer renders now)
//   { type: "payment" } -> one real settlement per cited author (drops into the ledger)
//
// We resolve the answer as soon as "done" arrives, then keep consuming the stream so
// the real payments flow into the ledger live, after the answer is on screen.

import type { AskResult } from "./types";
import { emitRealPayment } from "./realPayments";

export function realAsk(question: string, onText?: (full: string) => void): Promise<AskResult> {
  return new Promise<AskResult>((resolve, reject) => {
    (async () => {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
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

          if (ev.type === "text") {
            onText?.(ev.text);
          } else if (ev.type === "done") {
            // Render the answer immediately; payments keep streaming after this.
            const { cited, ...result } = ev;
            void cited;
            resolved = true;
            resolve(result as AskResult);
          } else if (ev.type === "payment") {
            emitRealPayment(ev.payment);
          } else if (ev.type === "error") {
            if (!resolved) throw new Error(ev.error);
            else console.error("payment-phase error:", ev.error);
          }
        }
      }

      if (!resolved) throw new Error("the stream ended without a result");
    })().catch((e) => reject(e));
  });
}
