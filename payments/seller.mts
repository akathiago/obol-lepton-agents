// payments/seller.mts
//
// Seller x402 MÍNIMO — sin Next, sin Supabase. Un endpoint HTTP protegido por
// pago que representa "cobrar por una cita al wallet del autor".
//
// Es la versión destilada de `lib/x402.ts` del sample circlefin/arc-nanopayments:
//   - sin firma  -> 402 con las payment requirements (PAYMENT-REQUIRED, base64)
//   - con firma  -> facilitator.verify() + facilitator.settle() vía Circle Gateway
//                   y devuelve la tx de settlement en el header PAYMENT-RESPONSE.
//
// El payTo es DINÁMICO: por ahora una sola SELLER_ADDRESS (el autor de prueba);
// cuando esto se integre al agente, payTo = wallet del autor citado en runtime.

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
  if (!payTo) throw new Error("Falta SELLER_ADDRESS (el wallet del autor que cobra) en .env");

  const requirements = buildRequirements(price, payTo);

  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith(ENDPOINT)) {
      res.writeHead(404).end();
      return;
    }

    const sig = req.headers["payment-signature"] as string | undefined;

    // Sin pago -> 402 con las requirements del batching de Gateway.
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

    // Con pago -> verificar y liquidar vía Circle Gateway.
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
      console.log(`[seller] pago liquidado -> ${price} USDC de ${payer} a ${payTo} | tx: ${s.transaction ?? "(batched)"}`);

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
      console.log(`[seller] x402 en http://localhost:${port}${ENDPOINT}  (payTo=${payTo}, precio=${price})`);
      resolve(server);
    });
  });
}
