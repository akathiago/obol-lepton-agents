// REAL source: calls the backend (/api/ask) which streams the retrieve (BM25) ->
// Citations API -> verify loop over the real corpus. Consumes the ndjson stream: each
// "text" event updates the answer live; the "done" event carries the structured
// result (sources, guard stats, cost, noMatch).
//
// PAYMENTS are still simulated for now (next stage: pay.ts). The ledger reacts by
// firing payments for the citations the guard verified.

import type { AskResult } from "./types";
import { firePaymentsFor } from "./mockData";

export async function realAsk(
  question: string,
  onText?: (full: string) => void,
): Promise<AskResult> {
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
  let done: (AskResult & { cited: any[] }) | null = null;

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
      if (ev.type === "text") onText?.(ev.text);
      else if (ev.type === "done") done = ev;
      else if (ev.type === "error") throw new Error(ev.error);
    }
  }

  if (!done) throw new Error("the stream ended without a result");

  // The ledger reacts: payments for each verified citation (empty if there was no match).
  firePaymentsFor(done.cited);

  const { cited, ...result } = done;
  return result as AskResult;
}
