// scripts/enrich-orcid.ts
//
// Enriquece corpus/authors.json con el ORCID real de cada autor, usando OpenAlex.
// NO reconstruye el corpus: el texto sigue viniendo de arXiv. OpenAlex aporta solo
// la capa de IDENTIDAD (ORCID + id de OpenAlex), que es lo que despues mapea a wallet.
//
// Match por DOI: arXiv le asigna a cada paper el DOI 10.48550/arXiv.{id}.
// Matching de nombres: primero exacto (normalizado); si falla, fallback DIFUSO por
// apellido unico (captura iniciales, nombres del medio, etc.) sin falsos positivos:
// solo matchea si el apellido es unico de los dos lados.
// Correr con:  npx tsx scripts/enrich-orcid.ts

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

/** Normaliza nombres para comparar (sin acentos, minusculas, espacios colapsados). */
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
      console.log(res.status === 404 ? "— no esta en OpenAlex" : `— HTTP ${res.status}`);
      await sleep(DELAY_MS);
      continue;
    }

    const work = (await res.json()) as {
      authorships?: { author?: { display_name?: string; orcid?: string | null; id?: string | null } }[];
    };
    papersMatched++;

    // Indices del lado de OpenAlex: por nombre completo y por apellido.
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

    // Cuantas veces aparece cada apellido en NUESTRA lista (para exigir unicidad).
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
        // fallback difuso: apellido unico de los dos lados
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

    console.log(`ok · ${foundHere}/${paper.authors.length} con ORCID`);
  } catch (err) {
    papersMissing++;
    console.log(`— error: ${(err as Error).message}`);
  }

  await sleep(DELAY_MS);
}

const authorsTotal = Object.values(data).reduce((n, p) => n + p.authors.length, 0);

await writeFile("corpus/authors.json", JSON.stringify(data, null, 2), "utf8");

console.log("\n──────── RESUMEN ────────");
console.log(`Papers en OpenAlex:   ${papersMatched}/${ids.length}`);
console.log(`Papers no indexados:  ${papersMissing}`);
console.log(`Autores totales:      ${authorsTotal}`);
console.log(
  `ORCID encontrados:    ${orcidsFound}  (${((100 * orcidsFound) / authorsTotal).toFixed(1)}%)  ${fuzzyFound} por match difuso`,
);
console.log("authors.json actualizado.");
