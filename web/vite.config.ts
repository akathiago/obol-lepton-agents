import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { runAskStream } from "./server/loop";
import { runLegalAskStream } from "./server/legal";

/** Streams an async generator of events to the response as ndjson. */
async function streamNdjson(res: any, gen: AsyncGenerator<any>) {
  res.setHeader("content-type", "application/x-ndjson");
  res.setHeader("cache-control", "no-cache");
  for await (const ev of gen) res.write(JSON.stringify(ev) + "\n");
  res.end();
}

// Endpoint /api/ask: runs the real loop server-side (the API key never reaches
// the browser) and STREAMS the response as ndjson (one JSON event per line).
function oboloApi(): Plugin {
  return {
    name: "obolo-api",
    configureServer(server) {
      server.middlewares.use("/api/ask", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          let body = "";
          for await (const chunk of req) body += chunk;
          const { question, model } = JSON.parse(body || "{}");
          if (!question || typeof question !== "string") {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "missing question" }));
            return;
          }

          // `model` is optional and untrusted; runAskStream validates it against
          // its allowlist and falls back to the default, so we pass it through raw.
          await streamNdjson(res, runAskStream(question, model));
        } catch (e) {
          const message = (e as Error).message;
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: message }));
          } else {
            res.write(JSON.stringify({ type: "error", error: message }) + "\n");
            res.end();
          }
        }
      });

      // /api/legal-ask: the out-of-corpus flow — gate (Unpaywall) -> ingest legal
      // copy -> Citations API + guard -> pay. Same ndjson streaming contract.
      server.middlewares.use("/api/legal-ask", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          let body = "";
          for await (const chunk of req) body += chunk;
          const { doi, question } = JSON.parse(body || "{}");
          if (!doi || typeof doi !== "string") {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "missing doi" }));
            return;
          }
          await streamNdjson(res, runLegalAskStream(doi, question));
        } catch (e) {
          const message = (e as Error).message;
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: message }));
          } else {
            res.write(JSON.stringify({ type: "error", error: message }) + "\n");
            res.end();
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), oboloApi()],
  server: { port: 5173, open: false },
});
