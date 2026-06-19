// agent/license.ts
//
// The legal spine of OBOL's arXiv path. The arXiv *Atom* API (used by
// build-corpus) does NOT carry a license — so a corpus built from it can't
// honestly claim "open-access". The license lives in arXiv's OAI-PMH feed,
// under a single <license> tag, and that's what this module reads.
//
// We classify each paper into a tier:
//   - "open"       CC0 / CC-BY / CC-BY-SA  → redistributable, derivatives OK. OBOL serves + pays.
//   - "restricted" CC-BY-NC* / CC-BY-ND*   → conditions apply; NOT served by the strict gate.
//   - "default"    arXiv's non-exclusive distribution license → NO redistribution.
//   - "unknown"    no tag / fetch failed   → treated as not-open (fail closed).
//
// The rule is the README's, made true in code: legality comes 100% from the
// license. Only "open" papers can trigger a payment.

const OAI_ENDPOINT = "https://oaipmh.arxiv.org/oai";
const USER_AGENT = "Obol/0.1 (open-access license check; Lepton hackathon)";
const TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;

export type LicenseTier = "open" | "restricted" | "default" | "unknown";

export interface LicenseInfo {
  /** The raw license URL from arXiv, or "" when none is published. */
  url: string;
  /** Short human id, e.g. "CC-BY-4.0", "arXiv-default", "none". */
  id: string;
  tier: LicenseTier;
  /** True only for the "open" tier — the single gate the rest of OBOL checks. */
  redistributable: boolean;
}

/** Maps a CC / arXiv license URL to a short id + tier. Order matters: NC/ND first. */
function classifyUrl(rawUrl: string): { id: string; tier: LicenseTier } {
  const url = rawUrl.toLowerCase();

  if (url.includes("/publicdomain/zero")) return { id: "CC0-1.0", tier: "open" };

  // Restricted CC variants — must be checked before the bare by/by-sa match.
  if (url.includes("/licenses/by-nc-sa")) return { id: "CC-BY-NC-SA", tier: "restricted" };
  if (url.includes("/licenses/by-nc-nd")) return { id: "CC-BY-NC-ND", tier: "restricted" };
  if (url.includes("/licenses/by-nc")) return { id: "CC-BY-NC", tier: "restricted" };
  if (url.includes("/licenses/by-nd")) return { id: "CC-BY-ND", tier: "restricted" };

  if (url.includes("/licenses/by-sa")) return { id: "CC-BY-SA", tier: "open" };
  if (url.includes("/licenses/by")) return { id: "CC-BY", tier: "open" };

  // arXiv's own perpetual, non-exclusive license to distribute — NOT redistribution.
  if (url.includes("arxiv.org/licenses/nonexclusive-distrib")) {
    return { id: "arXiv-default", tier: "default" };
  }

  return { id: rawUrl ? "other" : "none", tier: rawUrl ? "restricted" : "default" };
}

export function classifyLicense(rawUrl: string): LicenseInfo {
  const { id, tier } = classifyUrl(rawUrl);
  return { url: rawUrl, id, tier, redistributable: tier === "open" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extracts the first <license> value from an OAI-PMH record. "" when absent. */
function parseLicense(xml: string): string {
  const m = xml.match(/<license>\s*([^<]+?)\s*<\/license>/i);
  return m ? m[1].trim() : "";
}

/**
 * Fetches the published license for an arXiv id via OAI-PMH and classifies it.
 * Fails closed: any network/parse problem returns the "unknown" tier (not open),
 * so a fetch hiccup can never green-light a payment.
 *
 * arXiv OAI-PMH throttles with 503 + Retry-After; we honor it up to MAX_RETRIES.
 */
export async function fetchLicense(arxivId: string): Promise<LicenseInfo> {
  const identifier = `oai:arXiv.org:${arxivId}`;
  const url = `${OAI_ENDPOINT}?verb=GetRecord&identifier=${encodeURIComponent(identifier)}&metadataPrefix=arXiv`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
        signal: ctrl.signal,
      });

      if (res.status === 503) {
        const wait = Number(res.headers.get("retry-after") ?? "5");
        await sleep(Math.max(1, wait) * 1000);
        continue;
      }
      if (!res.ok) return classifyLicense(""); // unknown → not open

      const xml = await res.text();
      return classifyLicense(parseLicense(xml));
    } catch {
      // timeout / network — small backoff then retry
      await sleep(2000);
    } finally {
      clearTimeout(timer);
    }
  }
  return classifyLicense(""); // exhausted retries → fail closed
}
