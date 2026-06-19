// agent/arxiv.ts
//
// Live arXiv retrieval, license-gated. This is what turns OBOL from "150 static
// papers" into "ask about any open paper on arXiv": when the local corpus doesn't
// cover a question, the loop searches arXiv live, keeps ONLY the open-access (CC)
// hits, fetches their text, and answers + pays over them — exactly like a corpus
// paper, but sourced on demand.
//
// The legality is enforced here, in code, before any text is served:
//   search → license check (OAI-PMH) → keep tier "open" → fetch full text → ingest
// A restricted / arXiv-default / unknown paper is dropped. It never reaches the
// answer call, so it can never trigger a payment.
//
// Author wallets are DERIVED (deriveWallet): an arbitrary arXiv author isn't in the
// seeded registry, so we mint a stable, receive-only payout address from their
// identity. Same author → same wallet, no stored key. Payouts to unclaimed authors
// land as escrow the author can later claim (ORCID flow).

import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { fetchLicense, type LicenseInfo } from "./license.ts";
import { deriveWallet } from "./ingest.ts";

const API_ENDPOINT = "http://export.arxiv.org/api/query";
const USER_AGENT = "Obol/0.1 (live open-access retrieval; Lepton hackathon)";
const TIMEOUT_MS = 25000;
const API_DELAY_MS = 3000; // arXiv API rate floor

export interface LivePaper {
  id: string; // arXiv id, e.g. "2310.06770"
  title: string;
  text: string; // full text as markdown
  authors: { name: string; orcid?: string; wallet: string }[];
  license: LicenseInfo;
  sourceUrl: string;
}

interface ArxivMeta {
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  htmlUrl: string;
  absUrl: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

async function httpGet(url: string): Promise<{ ok: boolean; status: number; contentType: string; body: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: ctrl.signal });
    const contentType = res.headers.get("content-type") ?? "";
    const body = res.ok ? await res.text() : "";
    return { ok: res.ok, status: res.status, contentType, body };
  } catch {
    return { ok: false, status: 0, contentType: "", body: "" };
  } finally {
    clearTimeout(timer);
  }
}

/** Turns a natural-language question into an arXiv `all:` query of its salient terms. */
export function questionToQuery(question: string): string {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
    .slice(0, 12);
  const phrase = terms.join(" ") || question.slice(0, 80);
  return `all:${phrase}`;
}

// ──────── 1. search ────────
export async function searchArxiv(question: string, max: number): Promise<ArxivMeta[]> {
  const params = new URLSearchParams({
    search_query: questionToQuery(question),
    start: "0",
    max_results: String(max),
    sortBy: "relevance",
    sortOrder: "descending",
  });
  const { ok, status, body } = await httpGet(`${API_ENDPOINT}?${params.toString()}`);
  if (!ok) throw new Error(`arXiv API responded ${status}`);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => ["entry", "author", "link"].includes(name),
  });
  const feed = parser.parse(body);
  const entries = feed?.feed?.entry ?? [];
  return entries.map((entry: any): ArxivMeta => {
    const rawId: string = entry.id ?? "";
    const arxivId = rawId.split("/abs/")[1]?.replace(/v\d+$/, "") ?? rawId;
    const authors: string[] = (entry.author ?? [])
      .map((a: any) => a?.name)
      .filter((n: any): n is string => typeof n === "string");
    return {
      arxivId,
      title: clean(entry.title),
      abstract: clean(entry.summary),
      authors,
      htmlUrl: `https://arxiv.org/html/${arxivId}`,
      absUrl: rawId || `https://arxiv.org/abs/${arxivId}`,
    };
  });
}

// ──────── 2. full text (HTML → markdown) ────────
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, img").remove();
  $(".ltx_page_header, .ltx_page_footer, .ar5iv-footer").remove();
  $("math annotation, math annotation-xml").remove();
  const article = $("article").first();
  const inner = (article.length ? article.html() : $("body").html()) ?? "";
  return turndown.turndown(inner).replace(/\n{3,}/g, "\n\n").trim();
}

async function tryHtml(url: string): Promise<string | null> {
  const { ok, contentType, body } = await httpGet(url);
  if (!ok || !contentType.includes("text/html") || body.length === 0) return null;
  const md = htmlToMarkdown(body);
  return md.length > 400 ? md : null; // guard against paywall stubs / empty renders
}

/** arXiv native HTML, then ar5iv fallback for older papers. null → no usable text. */
async function fetchFullText(meta: ArxivMeta): Promise<{ text: string; sourceUrl: string } | null> {
  const native = await tryHtml(meta.htmlUrl);
  if (native) return { text: native, sourceUrl: meta.htmlUrl };
  await sleep(API_DELAY_MS);
  const ar5ivUrl = `https://ar5iv.labs.arxiv.org/html/${meta.arxivId}`;
  const fallback = await tryHtml(ar5ivUrl);
  return fallback ? { text: fallback, sourceUrl: ar5ivUrl } : null;
}

function ingestAuthors(meta: ArxivMeta): LivePaper["authors"] {
  const authors = meta.authors
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, wallet: deriveWallet(name) }));
  return authors.length ? authors : [{ name: "Unknown author", wallet: deriveWallet(meta.arxivId) }];
}

// ──────── 3. orchestration: search → license-gate → ingest ────────
export interface IngestOptions {
  /** How many open papers we want to collect (default 3). */
  want?: number;
  /** How many search hits to scan at most before giving up (default 10). */
  scan?: number;
  /** arXiv ids already in the local corpus — skipped to avoid double-serving. */
  exclude?: Set<string>;
  /** Optional progress callback (id, status) for live UI. */
  onProgress?: (id: string, status: "open" | "restricted" | "no-text") => void;
}

/**
 * Searches arXiv for a question and returns up to `want` OPEN-ACCESS papers with
 * full text ingested and author wallets derived. Restricted / default / unknown
 * licenses, and papers without reachable HTML text, are dropped. Sequential and
 * rate-limited — this is a live network call; the loop surfaces it as "searching
 * arXiv live".
 */
export async function ingestOpenAccess(question: string, opts: IngestOptions = {}): Promise<LivePaper[]> {
  const want = opts.want ?? 3;
  const scan = opts.scan ?? 10;
  const exclude = opts.exclude ?? new Set<string>();

  const hits = await searchArxiv(question, scan);
  const collected: LivePaper[] = [];

  for (const meta of hits) {
    if (collected.length >= want) break;
    if (exclude.has(meta.arxivId)) continue;

    // License gate FIRST — cheaper than fetching text, and the legal precondition.
    const license = await fetchLicense(meta.arxivId);
    if (!license.redistributable) {
      opts.onProgress?.(meta.arxivId, "restricted");
      continue;
    }

    await sleep(API_DELAY_MS);
    const full = await fetchFullText(meta);
    if (!full) {
      opts.onProgress?.(meta.arxivId, "no-text");
      continue;
    }

    opts.onProgress?.(meta.arxivId, "open");
    collected.push({
      id: meta.arxivId,
      title: meta.title,
      text: full.text,
      authors: ingestAuthors(meta),
      license,
      sourceUrl: full.sourceUrl,
    });

    if (collected.length < want) await sleep(API_DELAY_MS);
  }

  return collected;
}
