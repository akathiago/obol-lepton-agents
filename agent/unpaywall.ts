// agent/unpaywall.ts
//
// THE LEGAL GUARD. The sibling of verify.ts.
//
// verify.ts guards ATTRIBUTION honesty (every cited span is literal text of the
// paper). This module guards SOURCING honesty: before OBOL ever touches a paper
// that is NOT already in its open-access corpus, it asks Unpaywall whether a
// LEGAL open version exists — one the author archived, or one published under an
// open license — and refuses to proceed otherwise.
//
// The rule, identical to the README's promise: legality comes 100% from the
// LICENSE (or a legitimate author-archived repository copy), never from the
// payment. If the only thing Unpaywall can offer is a publisher's "free to read"
// link with no reuse license, OBOL treats that as NOT legal to reuse and stops.
// If nothing legal exists, OBOL stops honestly — it never pirates, never scrapes
// a paywall, never circumvents DRM.
//
//   lookupUnpaywall(doi) -> the raw record (or null if Unpaywall has no entry)
//   legalGate(record)    -> a verdict: serve | stop, with the reason and, when
//                           serve, the legal URL + how it is licensed.

const API_BASE = "https://api.unpaywall.org/v2";
// Unpaywall requires a REAL email on every request (it's a politeness/rate key,
// not auth) and rejects placeholder domains like example.com with a 422. Set
// UNPAYWALL_EMAIL in .env (gitignored) — never hardcode a personal address here,
// the repo is public. Read at call time (not module load) so a caller that runs
// dotenv.config() after importing this module still picks it up.
const getEmail = () => process.env.UNPAYWALL_EMAIL || "";
const TIMEOUT_MS = 15000;

// Licenses we accept as granting REUSE (not just reading). Matched as a prefix
// so "cc-by-4.0", "cc-by-nc", etc. all qualify. Public-domain marks included.
const OPEN_LICENSE_PREFIXES = ["cc0", "cc-by", "pd", "public-domain"];

/** One open-access location as Unpaywall reports it. */
export interface OaLocation {
  url: string | null;
  url_for_pdf: string | null;
  url_for_landing_page: string | null; // usually the HTML article page
  host_type: "publisher" | "repository" | string | null;
  license: string | null;
  version: string | null; // submittedVersion | acceptedVersion | publishedVersion
  repository_institution?: string | null;
}

/** The slice of the Unpaywall record we rely on. */
export interface UnpaywallRecord {
  doi: string;
  is_oa: boolean;
  oa_status: "gold" | "green" | "hybrid" | "bronze" | "closed" | string;
  title: string | null;
  journal_name?: string | null;
  year?: number | null;
  best_oa_location: OaLocation | null;
  oa_locations?: OaLocation[];
  // Unpaywall's author shape varies by record: Crossref-style (given/family/ORCID)
  // or OpenAlex-style (raw_author_name). We read whichever is present.
  z_authors?: { given?: string; family?: string; ORCID?: string | null; raw_author_name?: string }[];
}

export type GateDecision = "serve" | "stop";

/** The verdict the legal guard returns for a DOI. */
export interface LegalVerdict {
  doi: string;
  decision: GateDecision;
  /** Why — phrased so it can be shown verbatim in the pitch/UI. */
  reason: string;
  oaStatus: string;
  /** Present only when decision === "serve": the legal copy OBOL may use. */
  legal?: {
    url: string; // best direct link (pdf or file)
    landingUrl: string | null; // HTML article page, preferred for text ingestion
    hostType: string;
    /** "cc-by" | … | "author-archived" (green repo copy with no explicit license). */
    basis: string;
    version: string | null;
  };
}

/** True if a license string grants reuse (open license, not merely readable). */
function isOpenLicense(license: string | null | undefined): boolean {
  if (!license) return false;
  const l = license.toLowerCase();
  return OPEN_LICENSE_PREFIXES.some((p) => l.startsWith(p));
}

/** GET an Unpaywall record by DOI. Returns null if Unpaywall has no entry (404). */
export async function lookupUnpaywall(doi: string): Promise<UnpaywallRecord | null> {
  const email = getEmail();
  if (!email) {
    throw new Error("Set UNPAYWALL_EMAIL in .env to a real address — Unpaywall rejects requests without one (422).");
  }
  // DOIs go LITERAL in the path (slashes intact) — encoding them yields a 422.
  const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  const url = `${API_BASE}/${clean}?email=${encodeURIComponent(email)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Unpaywall responded ${res.status}`);
    const rec = (await res.json()) as UnpaywallRecord;
    return { ...rec, doi: clean };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * THE GATE. Given an Unpaywall record, decide whether OBOL may legally use the
 * paper. Conservative on purpose: free-to-read is NOT a reuse license.
 *
 *   stop  — no record, not OA, or only a publisher "free to read" link (bronze,
 *           no license). OBOL does not pirate and does not over-claim a license.
 *   serve — an open license (CC0/CC-BY/PD), OR a legitimate author/institution
 *           repository copy (green). That is the "author-archived legal version".
 */
export function legalGate(doi: string, rec: UnpaywallRecord | null): LegalVerdict {
  if (!rec) {
    return { doi, decision: "stop", oaStatus: "unknown", reason: "Unpaywall has no record for this DOI — OBOL cannot establish a legal source, so it stops." };
  }
  if (!rec.is_oa || !rec.best_oa_location) {
    return { doi, decision: "stop", oaStatus: rec.oa_status, reason: "No open-access version exists. OBOL never unlocks paywalls or pirates, so it stops here." };
  }

  // Prefer the location Unpaywall ranks best, but fall back to any location that
  // clears the gate (best_oa_location can be a bronze publisher link while a
  // green repository copy sits in oa_locations).
  const candidates = [rec.best_oa_location, ...(rec.oa_locations ?? [])].filter(Boolean) as OaLocation[];

  // 1) An explicit open license anywhere -> clearly legal to reuse.
  const licensed = candidates.find((loc) => isOpenLicense(loc.license));
  if (licensed) {
    return {
      doi,
      decision: "serve",
      oaStatus: rec.oa_status,
      reason: `Published under an open license (${licensed.license}) — legal to reuse. OBOL serves this version and pays the author.`,
      legal: { url: licensed.url_for_pdf || licensed.url || "", landingUrl: licensed.url_for_landing_page, hostType: licensed.host_type || "unknown", basis: licensed.license!, version: licensed.version },
    };
  }

  // 2) A repository (green) copy with no explicit license -> the author/institution
  //    archived it themselves. The README endorses this "author-archived" path.
  const archived = candidates.find((loc) => loc.host_type === "repository");
  if (archived) {
    return {
      doi,
      decision: "serve",
      oaStatus: rec.oa_status,
      reason: `Author-archived in a repository${archived.repository_institution ? ` (${archived.repository_institution})` : ""} — the legal version the author deposited. OBOL serves this and pays the author, never the publisher.`,
      legal: { url: archived.url_for_pdf || archived.url || "", landingUrl: archived.url_for_landing_page, hostType: "repository", basis: "author-archived", version: archived.version },
    };
  }

  // 3) Only a publisher "free to read" link, no license (bronze). Readable != reusable.
  return {
    doi,
    decision: "stop",
    oaStatus: rec.oa_status,
    reason: "Only a publisher 'free to read' link with no reuse license (bronze). Free to read is not free to reuse — OBOL does not over-claim a license, so it stops.",
  };
}

/** Convenience: look up + gate in one call. */
export async function legalCheck(doi: string): Promise<LegalVerdict> {
  const rec = await lookupUnpaywall(doi);
  return legalGate(doi, rec);
}
