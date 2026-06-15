// scripts/enrich-orcid.ts
//
// Enriches corpus/authors.json with each author's real ORCID, using OpenAlex.
// It does NOT rebuild the corpus: the text still comes from arXiv. OpenAlex only
// contributes the IDENTITY layer (ORCID + OpenAlex id), which is what later maps to a wallet.
//
// Match by DOI: arXiv assigns each paper the DOI 10.48550/arXiv.{id}.
// Name matching: first exact (normalized); if that fails, a FUZZY fallback by
// unique last name (catches initials, middle names, etc.) without false positives:
// it only matches if the last name is unique on both sides.
// Run with:  npx tsx scripts/enrich-orcid.ts

import { readFile, writeFile } from "node:fs/promises";

const MAILTO = "obolo-hackathon@example.com";
const DELAY_MS = 130;

interface Author {
  name: string;
  orcid: string;
  wallet: string;
  openalex_id?: string;
}
type AuthorsFile = Record<string, { title: string; authors: Author[] }>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Normalizes names for comparison (no accents, lowercase, collapsed spaces). */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const lastName = (s: string) => {
  const parts = normalize(s).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
};

interface OaInfo {
  orcid: string | null;
  id: string | null;
}

const data = JSON.parse(await readFile("corpus/authors.json", "utf8")) as AuthorsFile;
const ids = Object.keys(data);

let papersMatched = 0;
let papersMissing = 0;
let orcidsFound = 0;
let fuzzyFound = 0;

for (let i = 0; i < ids.length; i++) {
  const arxivId = ids[i];
  const paper = data[arxivId];
  const doi = `10.48550/arxiv.${arxivId.toLowerCase()}`;
  const url = `https://api.openalex.org/works/doi:${doi}?mailto=${MAILTO}`;

  process.stdout.write(`${i + 1}/${ids.length} ${arxivId} `);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      papersMissing++;
      console.log(res.status === 404 ? "— not in OpenAlex" : `— HTTP ${res.status}`);
      await sleep(DELAY_MS);
      continue;
    }

    const work = (await res.json()) as {
      authorships?: { author?: { display_name?: string; orcid?: string | null; id?: string | null } }[];
    };
    papersMatched++;

    // Indexes on the OpenAlex side: by full name and by last name.
    const oaByName = new Map<string, OaInfo>();
    const oaByLast = new Map<string, OaInfo[]>();
    for (const a of work.authorships ?? []) {
      const nm = normalize(a.author?.display_name ?? "");
      if (!nm) continue;
      const info: OaInfo = { orcid: a.author?.orcid ?? null, id: a.author?.id ?? null };
      oaByName.set(nm, info);
      const ln = nm.split(" ").pop() ?? "";
      if (ln) {
        const arr = oaByLast.get(ln) ?? [];
        arr.push(info);
        oaByLast.set(ln, arr);
      }
    }

    // How many times each last name appears in OUR list (to require uniqueness).
    const ourLastCount = new Map<string, number>();
    for (const author of paper.authors) {
      const ln = lastName(author.name);
      ourLastCount.set(ln, (ourLastCount.get(ln) ?? 0) + 1);
    }

    let foundHere = 0;
    for (const author of paper.authors) {
      const nm = normalize(author.name);
      let hit = oaByName.get(nm);
      let fuzzy = false;

      if (!hit) {
        // fuzzy fallback: last name unique on both sides
        const ln = nm.split(" ").pop() ?? "";
        const cands = oaByLast.get(ln) ?? [];
        if (cands.length === 1 && (ourLastCount.get(ln) ?? 0) === 1) {
          hit = cands[0];
          fuzzy = true;
        }
      }

      if (hit?.orcid) {
        author.orcid = hit.orcid;
        orcidsFound++;
        foundHere++;
        if (fuzzy) fuzzyFound++;
      }
      if (hit?.id) author.openalex_id = hit.id;
    }

    console.log(`ok · ${foundHere}/${paper.authors.length} with ORCID`);
  } catch (err) {
    papersMissing++;
    console.log(`— error: ${(err as Error).message}`);
  }

  await sleep(DELAY_MS);
}

const authorsTotal = Object.values(data).reduce((n, p) => n + p.authors.length, 0);

await writeFile("corpus/authors.json", JSON.stringify(data, null, 2), "utf8");

console.log("\n──────── SUMMARY ────────");
console.log(`Papers in OpenAlex:   ${papersMatched}/${ids.length}`);
console.log(`Papers not indexed:   ${papersMissing}`);
console.log(`Total authors:        ${authorsTotal}`);
console.log(
  `ORCIDs found:         ${orcidsFound}  (${((100 * orcidsFound) / authorsTotal).toFixed(1)}%)  ${fuzzyFound} via fuzzy match`,
);
console.log("authors.json updated.");
