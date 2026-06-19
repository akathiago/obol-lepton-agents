// scripts/annotate-licenses.ts
//
// Walks the existing corpus and writes the REAL license into each paper's
// front-matter, read from arXiv's OAI-PMH feed (the Atom API that built the
// corpus doesn't carry it). After this runs, "open-access" is a measured fact,
// not a claim: the summary prints exactly how many of the corpus are CC.
//
// Idempotent + resumable: papers already annotated are skipped unless --force,
// so a run interrupted mid-way just continues. Rate-limited to arXiv's 3s floor.
//
// Run:  npx tsx scripts/annotate-licenses.ts [--limit N] [--force]

import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fetchLicense, type LicenseTier } from "../agent/license.ts";

const PAPERS_DIR = "corpus/papers";
const DELAY_MS = 3000; // arXiv rate limit
const FORCE = process.argv.includes("--force");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Splits a markdown file into its front-matter block and the rest. */
function splitFrontMatter(content: string): { fm: string; rest: string } | null {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  return { fm: m[1], rest: content.slice(m[0].length) };
}

/** Inserts/replaces the license lines right after the arxiv_id line. */
function withLicense(fm: string, id: string, tier: LicenseTier, url: string): string {
  const cleaned = fm
    .split("\n")
    .filter((l) => !/^(license|license_tier|redistributable|license_url):/.test(l));

  const lines = [
    `license: "${id}"`,
    `license_tier: "${tier}"`,
    `redistributable: ${tier === "open"}`,
    `license_url: "${url}"`,
  ];

  const out: string[] = [];
  let inserted = false;
  for (const l of cleaned) {
    out.push(l);
    if (!inserted && /^arxiv_id:/.test(l)) {
      out.push(...lines);
      inserted = true;
    }
  }
  if (!inserted) out.push(...lines); // no arxiv_id line — append at end
  return out.join("\n");
}

async function main() {
  const files = (await readdir(PAPERS_DIR)).filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} papers. Annotating licenses via OAI-PMH...\n`);

  const counts: Record<LicenseTier, number> = { open: 0, restricted: 0, default: 0, unknown: 0 };
  const byId: Record<string, number> = {};
  let processed = 0;
  let skipped = 0;

  for (const file of files) {
    if (processed >= LIMIT) break;
    const full = path.join(PAPERS_DIR, file);
    // git clone on Windows may rewrite LF→CRLF; normalize so the front-matter
    // regex and line-splitting are line-ending agnostic.
    const content = (await readFile(full, "utf8")).replace(/\r\n/g, "\n");
    const parts = splitFrontMatter(content);
    if (!parts) {
      console.warn(`-- ${file}: no front-matter, skipping`);
      continue;
    }

    if (!FORCE && /^license:/m.test(parts.fm)) {
      skipped++;
      continue; // already annotated — resume
    }

    const idMatch = parts.fm.match(/arxiv_id:\s*"?([^"\n]+)"?/);
    const arxivId = idMatch?.[1]?.trim();
    if (!arxivId) {
      console.warn(`-- ${file}: no arxiv_id, skipping`);
      continue;
    }

    await sleep(DELAY_MS);
    const lic = await fetchLicense(arxivId);
    counts[lic.tier]++;
    byId[lic.id] = (byId[lic.id] ?? 0) + 1;

    const newFm = withLicense(parts.fm, lic.id, lic.tier, lic.url);
    await writeFile(full, `---\n${newFm}\n---\n${parts.rest}`, "utf8");

    processed++;
    const flag = lic.redistributable ? "OPEN " : "     ";
    console.log(`[${processed}] ${flag} ${lic.id.padEnd(14)} ${arxivId}`);
  }

  const openPct = processed ? Math.round((counts.open / processed) * 100) : 0;
  console.log("\n──────── LICENSE SUMMARY ────────");
  console.log(`Annotated this run:   ${processed}  (skipped ${skipped} already done)`);
  console.log(`  open (CC0/BY/SA):   ${counts.open}   ← OBOL serves + pays these`);
  console.log(`  restricted (NC/ND): ${counts.restricted}`);
  console.log(`  arXiv default:      ${counts.default}`);
  console.log(`  unknown:            ${counts.unknown}`);
  console.log(`\nOpen-access share (this run): ${openPct}%`);
  console.log("By license id:", byId);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
