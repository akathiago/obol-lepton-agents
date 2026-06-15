// scripts/probar-verify.ts
//
// Demo del guard endurecido. Mete ruido tipico de PDF en el paper y prueba:
//   A) match exacto pese a saltos de linea, espacios multiples y guion de corte
//   B) match exacto pese a comillas curvas y espacio no-rompible (NBSP)
//   C) cita PARCIAL (una palabra omitida) -> pasa solo con acceptPartial
//   D) cita ALUCINADA -> nunca pasa
// Correr con:  npx tsx scripts/probar-verify.ts

import { verifyCitations, verifySpan, type Citation, type Corpus } from "../agent/verify";

// Caracteres "sucios" construidos sin ambiguedad.
const LDQUO = String.fromCharCode(0x201c); // comilla doble curva izquierda
const RDQUO = String.fromCharCode(0x201d); // comilla doble curva derecha
const NBSP = String.fromCharCode(0x00a0); // espacio no-rompible

// El paper tal como saldria de un PDF: salto de linea a mitad de oracion,
// espacios triples, "pay-\nwalls" cortado, NBSP y comillas curvas.
const paper =
  "Open access accelerates\nscientific   progress by removing pay-\nwalls. " +
  "Authors," +
  NBSP +
  "however, rarely receive " +
  LDQUO +
  "direct compensation" +
  RDQUO +
  " for citations.";

const corpus: Corpus = { "paper-001": paper };

const citas: { label: string; cita: Citation; expect: string }[] = [
  {
    label: "A  (saltos/espacios/guion)",
    expect: "exact",
    cita: {
      paperId: "paper-001",
      citedText: "Open access accelerates scientific progress by removing paywalls.",
    },
  },
  {
    label: "B  (comillas curvas + NBSP)",
    expect: "exact",
    cita: {
      paperId: "paper-001",
      citedText: 'rarely receive "direct compensation" for citations.',
    },
  },
  {
    label: "C  (parcial: omite 'however')",
    expect: "partial",
    cita: {
      paperId: "paper-001",
      citedText: 'Authors, rarely receive "direct compensation" for citations.',
    },
  },
  {
    label: "D  (alucinada)",
    expect: "unverified",
    cita: {
      paperId: "paper-001",
      citedText: "Open access doubles researcher salaries overnight.",
    },
  },
];

console.log("PAPER (con ruido de PDF):");
console.log(JSON.stringify(paper));
console.log("");

for (const { label, cita, expect } of citas) {
  const r = verifySpan(cita, corpus);
  const ok = r.status === expect ? "ok" : "REVISAR";
  console.log(
    `${label.padEnd(30)} ${r.status.padEnd(11)} cov ${r.coverage.toFixed(2)}   [${ok}]`,
  );
}

const all = citas.map((c) => c.cita);
const strict = verifyCitations(all, corpus); // default: solo exactas
const withPartial = verifyCitations(all, corpus, { acceptPartial: true });

console.log("");
console.log(`Estricto (default):     ${strict.length} verificadas`);
console.log(`Aceptando parciales:    ${withPartial.length} verificadas`);
