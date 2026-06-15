// payments/seller.mts
//
// MINIMAL x402 seller — no Next, no Supabase. A payment-protected HTTP endpoint
// that represents "charging for a citation to the author's wallet".
//
// It's the distilled version of `lib/x402.ts` from the circlefin/arc-nanopayments sample:
//   - no signature   -> 402 with the payment requirements (PAYMENT-REQUIRED, base64)
//   - with signature -> facilitator.verify() + facilitator.settle() via Circle Gateway
//                   and returns the settlement tx in the PAYMENT-RESPONSE header.
//
// The payTo is DYNAMIC: for now a single SELLER_ADDRESS (the test author);
// once this is integrated into the agent, payTo = wallet of the cited author at runtime.

import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import http from "node:http";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const NETWORK = "eip155:5042002";
const USDC = "0x3600000000000000000000000000000000000000";
const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const ENDPOINT = "/pay-author";

const facilitator = new BatchFacilitatorClient();

function buildRequirements(price: string, payTo: `0x${string}`) {
  const amount = Math.round(parseFloat(price.replace("$", "")) * 1_000_000); // USDC 6 dec
  return {
    scheme: "exact" as const,
    network: NETWORK,
    asset: USDC,
    amount: amount.toString(),
    payTo,
    maxTimeoutSeconds: 345600,
    extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET },
  };
}

export function startSeller(opts?: { port?: number; price?: string; payTo?: `0x${string}` }): Promise<http.Server> {
  const port = opts?.port ?? 4021;
  const price = opts?.price ?? process.env.PRICE ?? "$0.001";
  const payTo = (opts?.payTo ?? (process.env.SELLER_ADDRESS as `0x${string}`));
  if (!payTo) throw new Error("Missing SELLER_ADDRESS (the wallet of the author being paid) in .env");

  const requirements = buildRequirements(price, payTo);

  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith(ENDPOINT)) {
      res.writeHead(404).end();
      return;
    }

    const sig = req.headers["payment-signature"] as string | undefined;

    // No payment -> 402 with the Gateway batching requirements.
    if (!sig) {
      const paymentRequired = {
        x402Version: 2,
        resource: { url: ENDPOINT, description: `Citation toll (${price} USDC)`, mimeType: "application/json" },
        accepts: [requirements],
      };
      res.writeHead(402, {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequired)).toString("base64"),
      });
      res.end("{}");
      return;
    }

    // With payment -> verify and settle via Circle Gateway.
    try {
      const payload = JSON.parse(Buffer.from(sig, "base64").toString("utf8"));

      const v = await facilitator.verify(payload, requirements);
      if (!v.isValid) {
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
      console.log(`[seller] payment settled -> ${price} USDC from ${payer} to ${payTo} | tx: ${s.transaction ?? "(batched)"}`);

      const respHeader = Buffer.from(
        JSON.stringify({ success: true, transaction: s.transaction, network: requirements.network, payer }),
      ).toString("base64");

      res.writeHead(200, { "Content-Type": "application/json", "PAYMENT-RESPONSE": respHeader });
      res.end(JSON.stringify({ ok: true, paidTo: payTo, transaction: s.transaction ?? null }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[seller] x402 at http://localhost:${port}${ENDPOINT}  (payTo=${payTo}, price=${price})`);
      resolve(server);
    });
  });
}
