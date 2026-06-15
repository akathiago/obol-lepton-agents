// scripts/build-corpus.ts
//
// Arma el corpus de papers de arXiv sobre "LLM agents". Solo descarga y parseo
// local: NADA de blockchain.
//
//   Buscar en arXiv -> metadata por paper -> bajar HTML (o fallback a abstract)
//   -> guardar markdown con front-matter -> generar authors.json
//
// Correr con:  npx tsx scripts/build-corpus.ts [limite]   (default 100)

import { writeFile, mkdir, rm } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

// ──────── Config ────────
const QUERY =
  '(all:"LLM agent" OR all:"language model agent" OR all:"autonomous agent" OR all:"agentic" OR all:"LLM-based agent" OR all:"agent benchmark")';
const LIMIT = Number(process.argv[2] ?? 100);
const DELAY_MS = 3000; // rate limit de arXiv: minimo 3s entre requests
const TIMEOUT_MS = 30000; // corta una request colgada para no frenar todo
const USER_AGENT = "Obolo/0.1 (LLM agents research corpus builder)";

const PAPERS_DIR = "corpus/papers";
const AUTHORS_FILE = "corpus/authors.json";

// ──────── Tipos ────────
interface Paper {
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  date: string;
  categories: string[];
  pdfUrl: string;
  htmlUrl: string;
}

// ──────── Helpers ────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Colapsa espacios y saltos de linea (arXiv envuelve titulos y abstracts). */
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** GET con User-Agent y timeout. */
async function httpGet(url: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const body = res.ok ? await res.text() : "";
    return { ok: res.ok, status: res.status, contentType, body };
  } finally {
    clearTimeout(timer);
  }
}

// ──────── 1. Buscar en arXiv ────────
async function searchArxiv(query: string, max: number): Promise<Paper[]> {
  const params = new URLSearchParams({
    search_query: query,
    start: "0",
    max_results: String(max),
    sortBy: "relevance",
    sortOrder: "descending",
  });
  const { ok, status, body } = await httpGet(
    `http://export.arxiv.org/api/query?${params.toString()}`,
  );
  if (!ok) throw new Error(`la API de arXiv respondio ${status}`);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => ["entry", "author", "category", "link"].includes(name),
  });
  const feed = parser.parse(body);
  const entries = feed?.feed?.entry ?? [];
  return entries.map(parseEntry);
}

function parseEntry(entry: any): Paper {
  const rawId: string = entry.id ?? ""; // http://arxiv.org/abs/2310.12345v1
  const arxivId = rawId.split("/abs/")[1]?.replace(/v\d+$/, "") ?? rawId;

  const authors: string[] = (entry.author ?? [])
    .map((a: any) => a?.name)
    .filter((n: any): n is string => typeof n === "string");

  const categories: string[] = (entry.category ?? [])
    .map((c: any) => c?.["@_term"])
    .filter((t: any): t is string => typeof t === "string");

  const links: any[] = entry.link ?? [];
  const pdf = links.find((l) => l?.["@_title"] === "pdf");

  return {
    arxivId,
    title: clean(entry.title),
    abstract: clean(entry.summary),
    authors,
    date: String(entry.published ?? "").slice(0, 10),
    categories,
    pdfUrl: pdf?.["@_href"] ?? `https://arxiv.org/pdf/${arxivId}`,
    htmlUrl: `https://arxiv.org/html/${arxivId}`,
  };
}

// ──────── 2. Texto completo (HTML -> markdown) ────────
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  // Sacar basura estructural y ruido.
  $("script, style, noscript, nav, header, footer, img").remove();
  $(".ltx_page_header, .ltx_page_footer, .ar5iv-footer").remove();
  $("math annotation, math annotation-xml").remove();
  // El cuerpo del paper esta en <article> cuando existe; si no, el <body> entero.
  const article = $("article").first();
  const inner = (article.length ? article.html() : $("body").html()) ?? "";
  return turndown
    .turndown(inner)
    .replace(/\n{3,}/g, "\n\n") // colapsar lineas en blanco de mas
    .trim();
}

/** Intenta una URL HTML y la convierte a markdown; null si no sirve. */
async function tryHtml(url: string): Promise<string | null> {
  try {
    const { ok, contentType, body } = await httpGet(url);
    if (!ok || !contentType.includes("text/html") || body.length === 0) return null;
    const md = htmlToMarkdown(body);
    return md.length > 0 ? md : null;
  } catch {
    return null; // timeout / red caida
  }
}

/**
 * Texto completo: primero el HTML nativo de arXiv; si no existe (papers viejos),
 * fallback a ar5iv (que renderiza el LaTeX como HTML). null -> solo abstract.
 */
async function fetchFullText(paper: Paper): Promise<string | null> {
  const native = await tryHtml(paper.htmlUrl);
  if (native) return native;
  await sleep(DELAY_MS); // respetamos el rate limit antes del segundo intento
  return tryHtml(`https://ar5iv.labs.arxiv.org/html/${paper.arxivId}`);
}

// ──────── 3. Guardar el paper como markdown ────────
function yamlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function frontMatter(paper: Paper, fullText: boolean): string {
  return [
    "---",
    `title: ${yamlString(paper.title)}`,
    `arxiv_id: ${yamlString(paper.arxivId)}`,
    `date: ${yamlString(paper.date)}`,
    `full_text: ${fullText}`,
    `pdf_url: ${yamlString(paper.pdfUrl)}`,
    `html_url: ${yamlString(paper.htmlUrl)}`,
    "authors:",
    ...paper.authors.map((a) => `  - ${yamlString(a)}`),
    "categories:",
    ...paper.categories.map((c) => `  - ${yamlString(c)}`),
    "---",
  ].join("\n");
}

/** Escribe el .md y devuelve true si quedo con texto completo. */
async function writePaper(paper: Paper, fullText: string | null): Promise<boolean> {
  const hasFull = fullText !== null;
  const body = hasFull
    ? fullText
    : `# ${paper.title}\n\n## Abstract\n\n${paper.abstract}`;
  const fileName = paper.arxivId.replace(/\//g, "_"); // ids viejos tienen "/"
  await writeFile(
    `${PAPERS_DIR}/${fileName}.md`,
    `${frontMatter(paper, hasFull)}\n\n${body}\n`,
    "utf8",
  );
  return hasFull;
}

// ──────── Orquestacion ────────
async function main() {
  // Buscamos PRIMERO. Si la lista falla, no tocamos el corpus existente.
  console.log(`Buscando en arXiv (limite ${LIMIT})...`);
  const papers = await searchArxiv(QUERY, LIMIT);
  console.log(`arXiv devolvio ${papers.length} papers.\n`);
  if (papers.length === 0) throw new Error("arXiv no devolvio resultados; corpus intacto");

  // Recien ahora limpiamos y reconstruimos (rebuild idempotente, sin huerfanos).
  await rm(PAPERS_DIR, { recursive: true, force: true });
  await mkdir(PAPERS_DIR, { recursive: true });

  const authorsMap: Record<
    string,
    { title: string; authors: { name: string; orcid: string; wallet: string }[] }
  > = {};
  const uniqueAuthors = new Set<string>();
  let full = 0;
  let abstractOnly = 0;
  let failed = 0;

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    const n = `${i + 1}/${papers.length}`;
    try {
      await sleep(DELAY_MS); // rate limit antes de cada request de red
      const fullText = await fetchFullText(paper);
      const hasFull = await writePaper(paper, fullText);

      if (hasFull) full++;
      else abstractOnly++;

      authorsMap[paper.arxivId] = {
        title: paper.title,
        authors: paper.authors.map((name) => ({ name, orcid: "", wallet: "" })),
      };
      paper.authors.forEach((a) => uniqueAuthors.add(a));

      console.log(`${n} descargados  ${hasFull ? "[completo]" : "[solo abstract]"}  ${paper.arxivId}`);
    } catch (err) {
      failed++;
      console.warn(`${n} ERROR  ${paper.arxivId}: ${(err as Error).message} — sigo con el siguiente`);
    }
  }

  await writeFile(AUTHORS_FILE, JSON.stringify(authorsMap, null, 2), "utf8");

  console.log("\n──────── RESUMEN ────────");
  console.log(`Papers bajados:       ${full + abstractOnly}/${papers.length}`);
  console.log(`  con texto completo: ${full}`);
  console.log(`  solo abstract:      ${abstractOnly}`);
  console.log(`Papers que fallaron:  ${failed}`);
  console.log(`Autores unicos:       ${uniqueAuthors.size}`);
  console.log(`Archivos en:          ${PAPERS_DIR}/`);
  console.log(`Mapa de autores:      ${AUTHORS_FILE}`);
}

main().catch((err) => {
  console.error("Fallo fatal:", err);
  process.exit(1);
});
