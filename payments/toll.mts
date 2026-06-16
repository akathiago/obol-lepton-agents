// payments/toll.mts
//
// x402 TOLL SERVER — the inflow side of OBOL's economic loop. Where seller.mts
// charges a citation toll OUT to an author, this charges a QUERY toll IN from an
// external client agent: the agent pays OBOL per question (payTo = OBOL treasury),
// and only once that payment settles does OBOL run the loop and answer.
//
// Same Circle Gateway batching rail as seller.mts (verify -> settle), but:
//   - POST endpoint that carries { question, model } in the body,
//   - on settlement it calls onPaid(...) and returns ITS result as the response body,
//     so the agent gets the answer back from the very call it paid with (gw.pay().data).
//
// This closes the circle: agent -> OBOL (treasury) -> authors. The author payouts
// fired inside onPaid use OBOL's own wallet (PAYER), funded by these tolls.

import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import http from "node:http";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// .env relative to this module (repo root), robust to the cwd.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(REPO_ROOT, ".env") });

// Mirror of seller.mts's Arc/Gateway constants (kept local so the proven author
// seller stays untouched; these are network constants, not per-run config).
const NETWORK = "eip155:5042002";
const USDC = "0x3600000000000000000000000000000000000000";
const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const ENDPOINT = "/agent-query";

const facilitator = new BatchFacilitatorClient();

function buildRequirements(price: string, payTo: `0x${string}`) {
  const amount = Math.round(parseFloat(price.replace("$", "")) * 1_000_000); // USDC 6 dec
  return {
    scheme: "exact" as const,
    network: NETWORK,
    asset: USDC,
    amount: amount.toString(),
    payTo,
    // Match seller.mts: Circle's facilitator requires the authorization to still be
    // valid for >= 7 days at verification time; we sign 8 days to clear that + latency.
    maxTimeoutSeconds: 691200,
    extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET },
  };
}

/** What onPaid receives once the query toll has settled. */
export interface PaidQuery {
  question: string;
  model?: string;
  payer: string; // the client agent that paid
}

export interface TollServerOpts {
  port?: number;
  /** The toll the client agent pays OBOL per query, e.g. "$0.01". */
  price?: string;
  /** Where the toll lands (OBOL treasury). Defaults to OBOL_TREASURY_ADDRESS / PAYER_ADDRESS. */
  payTo?: `0x${string}`;
  /** Runs AFTER the toll settles; its return value is sent back as the response body. */
  onPaid: (q: PaidQuery) => Promise<unknown>;
}

const isAddr = (s: string | undefined | null): s is `0x${string}` =>
  !!s && /^0x[0-9a-fA-F]{40}$/.test(s);

async function readJson(req: http.IncomingMessage): Promise<any> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function startTollServer(opts: TollServerOpts): Promise<http.Server> {
  const port = opts.port ?? Number(process.env.TOLL_PORT ?? 4023);
  const price = opts.price ?? process.env.QUERY_TOLL ?? "$0.03";
  const payTo =
    opts.payTo ??
    (process.env.OBOL_TREASURY_ADDRESS as `0x${string}` | undefined) ??
    (process.env.PAYER_ADDRESS as `0x${string}` | undefined);

  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith(ENDPOINT) || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    if (!isAddr(payTo)) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no treasury: set OBOL_TREASURY_ADDRESS or PAYER_ADDRESS" }));
      return;
    }

    const body = await readJson(req); // { question, model } — sent on both the 402 and the paid round
    const requirements = buildRequirements(price, payTo);
    const sig = req.headers["payment-signature"] as string | undefined;

    // No payment -> 402 with the Gateway batching requirements (the toll).
    if (!sig) {
      const paymentRequired = {
        x402Version: 2,
        resource: { url: ENDPOINT, description: `OBOL research query (${price} USDC)`, mimeType: "application/json" },
        accepts: [requirements],
      };
      res.writeHead(402, {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequired)).toString("base64"),
      });
      res.end("{}");
      return;
    }

    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "missing question in body" }));
      return;
    }

    // With payment -> verify + settle the toll, THEN run the query.
    try {
      const payload = JSON.parse(Buffer.from(sig, "base64").toString("utf8"));

      const v = await facilitator.verify(payload, requirements);
      if (!v.isValid) {
        console.error("[toll] verify failed:", v.invalidReason);
        res.writeHead(402, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "verify failed", reason: v.invalidReason }));
        return;
      }

      const s = await facilitator.settle(payload, requirements);
      if (!s.success) {
        res.writeHead(402, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "settle failed", reason: s.errorReason }));
        return;
      }

      const payer = s.payer ?? v.payer ?? "unknown";
      console.log(`[toll] query toll settled -> ${price} USDC from ${payer} to ${payTo} | tx: ${s.transaction ?? "(batched)"}`);

      // The toll is paid: now OBOL does the work and pays the authors out of it.
      const result = await opts.onPaid({ question, model: body?.model, payer });

      const respHeader = Buffer.from(
        JSON.stringify({ success: true, transaction: s.transaction, network: requirements.network, payer }),
      ).toString("base64");

      res.writeHead(200, { "Content-Type": "application/json", "PAYMENT-RESPONSE": respHeader });
      res.end(JSON.stringify({ ok: true, tollTx: s.transaction ?? null, result }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[toll] x402 at http://localhost:${port}${ENDPOINT}  (toll=${price} -> treasury ${payTo})`);
      resolve(server);
    });
  });
}
