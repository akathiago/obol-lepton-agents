// scripts/cost-check.ts
//
// Mide el costo REAL por pregunta: cuenta los tokens de input (los 4 papers que
// van a Claude) con count_tokens (gratis) y calcula el costo segun el modelo.
// Correr con:  npx tsx scripts/cost-check.ts ["tu pregunta"]

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

dotenv.config(); // .env de la raiz

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const TOP_K = 4;
const DOC_CAP = 40000;
const OUT_MAX = 1024; // max_tokens de la respuesta

// precios USD por 1M de tokens
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

// ── corpus (igual que el server) ──
const authors = JSON.parse(fs.readFileSync("corpus/authors.json", "utf8")) as Record<
  string,
  { title: string }
>;
const corpus: Record<string, { title: string; text: string }> = {};
for (const f of fs.readdirSync("corpus/papers")) {
  if (!f.endsWith(".md")) continue;
  const id = f.replace(/\.md$/, "");
  const raw = fs.readFileSync(path.join("corpus/papers", f), "utf8");
  corpus[id] = {
    title: authors[id]?.title ?? id,
    text: raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trimStart(),
  };
}

const STOP = new Set(
  "the a an of to in on for and or is are be by with from as at that this it its their your you we our how why what when which do does".split(
    " ",
  ),
);
const tok = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));

function retrieve(q: string, k: number): string[] {
  const qt = [...new Set(tok(q))];
  return Object.entries(corpus)
    .map(([id, p]) => {
      const T = p.title.toLowerCase();
      const B = p.text.toLowerCase();
      let s = 0;
      for (const t of qt) {
        if (T.includes(t)) s += 5;
        const o = B.split(t).length - 1;
        if (o > 0) s += Math.min(o, 4) + 1;
      }
      return { id, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.id);
}

const question = process.argv.slice(2).join(" ") || "Why do LLM agents fail on long-horizon tasks?";
const ids = retrieve(question, TOP_K);
const documents = ids.map((id) => ({
  type: "document",
  title: corpus[id].title,
  source: { type: "text", media_type: "text/plain", data: corpus[id].text.slice(0, DOC_CAP) },
  citations: { enabled: true },
}));

const client = new Anthropic();
const r = await client.messages.countTokens({
  model: MODEL,
  messages: [{ role: "user", content: [...documents, { type: "text", text: question }] }],
} as any);

const p = PRICES[MODEL] ?? { in: 3, out: 15 };
const inCost = (r.input_tokens * p.in) / 1e6;
const outCost = (OUT_MAX * p.out) / 1e6;

console.log(`Pregunta:           "${question}"`);
console.log(`Modelo:             ${MODEL}  ($${p.in}/$${p.out} por 1M)`);
console.log(`Papers enviados:    ${ids.join(", ")}`);
console.log(`Tokens de input:    ${r.input_tokens.toLocaleString()}  (exacto)`);
console.log(`  costo input:      $${inCost.toFixed(4)}`);
console.log(`  costo output:     $${outCost.toFixed(4)}  (techo, ${OUT_MAX} tok)`);
console.log(`──────────────────────────────`);
console.log(`COSTO POR PREGUNTA: ~$${(inCost + outCost).toFixed(4)}  (techo)`);
