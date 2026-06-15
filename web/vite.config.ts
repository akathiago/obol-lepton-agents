import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { runAskStream } from "./server/loop";

// Endpoint /api/ask: corre el loop real del lado del servidor (la API key nunca
// llega al browser) y STREAMEA la respuesta como ndjson (un evento JSON por linea).
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
          const { question } = JSON.parse(body || "{}");
          if (!question || typeof question !== "string") {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "missing question" }));
            return;
          }

          res.setHeader("content-type", "application/x-ndjson");
          res.setHeader("cache-control", "no-cache");
          for await (const ev of runAskStream(question)) {
            res.write(JSON.stringify(ev) + "\n");
          }
          res.end();
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
