// agent/ingest.ts
//
// Out-of-corpus ingestion. Once the legal guard (unpaywall.ts) says "serve",
// this fetches the LEGAL copy of the paper and turns it into the same shape the
// in-corpus loop uses, so OBOL can answer over it and pay its authors — exactly
// like any arXiv paper, but sourced live and only ever from a legal location.
//
// Honesty constraints, by construction:
//   - it only ever fetches the URL the gate already cleared as legal;
//   - it ingests TEXT (HTML rendered to markdown). If the only legal copy is a
//     PDF, this returns null — the demo does not parse PDFs, and we'd rather say
//     so than fabricate text. The gate verdict still stands.
//
// Author wallets: an out-of-corpus author isn't in the seeded registry, so we
// DERIVE a stable, receive-only address from their identity (ORCID, else name).
// Same identity -> same wallet, every time, with no stored key.

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { LegalVerdict, UnpaywallRecord } from "./unpaywall";

const TIMEOUT_MS = 20000;
const USER_AGENT = "Obol/0.1 (legal OA ingestion; Lepton hackathon)";

export interface IngestedAuthor {
  name: string;
  orcid?: string;
  wallet: string;
}

export interface IngestedPaper {
  id: string; // the DOI
  title: string;
  text: string; // legal full text, as markdown
  authors: IngestedAuthor[];
  sourceUrl: string; // the legal location we actually read
}

/** Stable, receive-only payout address derived from an author identity. */
export function deriveWallet(identity: string): string {
  const pk = keccak256(toHex(`obol:author:${identity.trim().toLowerCase()}`));
  return privateKeyToAccount(pk).address;
}

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, img, svg, form, button").remove();
  const article = $("article, main, .article-text, #artText, .fulltext-view").first();
  const inner = (article.length ? article.html() : $("body").html()) ?? "";
  return turndown.turndown(inner).replace(/\n{3,}/g, "\n\n").trim();
}

/** GET with UA + timeout. Returns the body only when it's HTML. */
async function getHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: ctrl.signal });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.includes("text/html")) return null;
    const body = await res.text();
    return body.length > 0 ? body : null;
  } catch {
    return null; // timeout / network / non-text
  } finally {
    clearTimeout(timer);
  }
}

/** Authors from the Unpaywall record, each mapped to a derived payout wallet. */
function authorsFrom(rec: UnpaywallRecord): IngestedAuthor[] {
  const zs = rec.z_authors ?? [];
  const authors = zs
    .map((z) => {
      // Either a single raw name, or given + family — whichever the record carries.
      const name = (z.raw_author_name?.trim() || [z.given, z.family].filter(Boolean).join(" ").trim());
      if (!name) return null;
      const orcid = (z.ORCID ?? "").trim() || undefined;
      return { name, orcid, wallet: deriveWallet(orcid || name) };
    })
    .filter(Boolean) as IngestedAuthor[];
  return authors.length ? authors : [{ name: "Unknown author", wallet: deriveWallet(rec.doi) }];
}

/**
 * Fetches and ingests the legal copy a "serve" verdict points to. Tries the
 * landing page first (usually HTML), then the raw URL. Returns null if no legal
 * HTML full text is reachable (e.g. PDF-only) — the caller reports that honestly.
 */
export async function ingestLegalPaper(
  rec: UnpaywallRecord,
  verdict: LegalVerdict,
): Promise<IngestedPaper | null> {
  if (verdict.decision !== "serve" || !verdict.legal) return null;

  // Prefer an HTML landing page over a direct PDF link.
  const candidates = [verdict.legal.landingUrl, verdict.legal.url].filter(Boolean) as string[];
  let html: string | null = null;
  let sourceUrl = "";
  for (const url of candidates) {
    html = await getHtml(url);
    if (html) {
      sourceUrl = url;
      break;
    }
  }
  if (!html) return null;

  const text = htmlToMarkdown(html);
  if (text.length < 400) return null; // a stub / paywall interstitial, not full text

  return {
    id: rec.doi,
    title: rec.title || rec.doi,
    text,
    authors: authorsFrom(rec),
    sourceUrl,
  };
}
