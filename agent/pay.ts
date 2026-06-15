// agent/pay.ts
//
// STEP 1 — pay verified citations to their authors over the x402 / Circle Gateway rail.
//
// Server-side only (it holds the payer key; the browser never sees it). Reuses the
// dynamic seller (payTo = each author's wallet) and a singleton GatewayClient.
//
// payForCitations() is best-effort and NON-throwing per item: a failed or unfunded
// payment comes back as `pending` (escrow) instead of breaking the request — the
// "authors' ledger" then shows money that's waiting for the author, which is exactly
// the escrow-claimable story.

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Server } from "node:http";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { startSeller } from "../payments/seller.mts";

// Resolve .env relative to this module (repo root), not the cwd — under the Vite
// dev server the cwd is web/, so a cwd-relative path would miss it.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(REPO_ROOT, ".env") });

const PORT = Number(process.env.SELLER_PORT ?? 4021);
const SELLER_URL = `http://localhost:${PORT}/pay-author`;
const PRICE = process.env.CITATION_PRICE ?? "$0.001";
const PRICE_USDC = parseFloat(PRICE.replace("$", ""));
const DEPOSIT = process.env.GATEWAY_DEPOSIT ?? "0.5";
const REDEPOSIT_THRESHOLD = 100_000n; // 0.1 USDC in atomic units

export interface CitationToPay {
  paperId: string;
  author: string;
  paperTitle?: string;
  orcid?: string;
  wallet?: string;
}

export interface PaymentResult extends CitationToPay {
  amount: number;
  ok: boolean;
  ref?: string; // Circle Gateway settlement reference (batched; not an Arc tx hash)
  pending?: boolean; // true when it couldn't settle and is treated as escrow
  error?: string;
}

let gateway: GatewayClient | null = null;
let sellerStarted: Promise<Server> | null = null;

function getGateway(): GatewayClient | null {
  const payerKey = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!payerKey) return null;
  if (!gateway) gateway = new GatewayClient({ chain: "arcTestnet", privateKey: payerKey });
  return gateway;
}

async function ensureSeller(): Promise<void> {
  if (!sellerStarted) sellerStarted = startSeller({ port: PORT });
  await sellerStarted;
}

async function ensureFunds(gw: GatewayClient): Promise<void> {
  const bal = await gw.getBalances();
  if (bal.gateway.available < REDEPOSIT_THRESHOLD) {
    if (bal.wallet.balance === 0n) {
      throw new Error("payer wallet has no USDC — fund it at faucet.circle.com (Arc testnet)");
    }
    await gw.deposit(DEPOSIT);
  }
}

const pendingAll = (cited: CitationToPay[], error: string): PaymentResult[] =>
  cited.map((c) => ({ ...c, amount: PRICE_USDC, ok: false, pending: true, error }));

/**
 * Pays each cited author — one nanopayment per citation, dynamic payTo = author wallet.
 * Returns a result per citation (ok + settlement ref, or pending + reason).
 */
export async function payForCitations(cited: CitationToPay[]): Promise<PaymentResult[]> {
  if (cited.length === 0) return [];

  const gw = getGateway();
  if (!gw) return pendingAll(cited, "no PAYER_PRIVATE_KEY configured");

  await ensureSeller();
  try {
    await ensureFunds(gw);
  } catch (e) {
    return pendingAll(cited, (e as Error).message);
  }

  const out: PaymentResult[] = [];
  for (const c of cited) {
    if (!c.wallet) {
      out.push({ ...c, amount: PRICE_USDC, ok: false, pending: true, error: "author has no wallet yet" });
      continue;
    }
    try {
      const r = await gw.pay(`${SELLER_URL}?to=${c.wallet}`, { method: "GET" });
      out.push({ ...c, amount: parseFloat(r.formattedAmount), ok: true, ref: r.transaction });
    } catch (e) {
      out.push({ ...c, amount: PRICE_USDC, ok: false, pending: true, error: (e as Error).message });
    }
  }
  return out;
}
