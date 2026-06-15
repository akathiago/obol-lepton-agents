// Prueba el endpoint /api/ask consumiendo el stream ndjson.
// Correr con: node scripts/test-stream.mjs

async function go(q) {
  const res = await fetch("http://localhost:5173/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: q }),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let textEvents = 0;
  let lastLen = 0;
  let done = null;
  for (;;) {
    const { value, done: d } = await reader.read();
    if (d) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line);
      if (ev.type === "text") {
        textEvents++;
        lastLen = ev.text.length;
      } else if (ev.type === "done") done = ev;
    }
  }
  console.log(`Q: ${q}`);
  console.log(
    `   text-events=${textEvents} (final ${lastLen} chars)  noMatch=${done?.noMatch}  ` +
      `verified=${done?.stats?.verified}/${done?.stats?.found} partial=${done?.stats?.partial}  ` +
      `sources=${done?.sources?.length}  cost=$${done?.usage?.costUsd}`,
  );
}

await go("Why do LLM agents fail on long-horizon tasks?");
await go("What is the best recipe for sourdough bread?");
