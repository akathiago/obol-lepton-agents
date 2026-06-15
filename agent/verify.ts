// agent/verify.ts
//
// EL GUARD. La pieza central de Obolo. 100% logica local, cero cadena.
//
// Recibe las citas que devolvio ask.ts (cada una con el span que Claude dice haber
// citado) y se queda SOLO con las que aparecen textualmente en el paper original.
// Por cada cita que sobrevive a este filtro, mas adelante se dispara un nanopago.
//
// Es robusto frente al ruido tipico de los PDFs / parseos:
//   - normaliza comillas, guiones y espacios raros antes de comparar
//   - une palabras cortadas por salto de linea (inter-\nface -> interface)
//   - colapsa saltos de linea y espacios multiples
// Y maneja CITAS PARCIALES: si no hay match exacto, mide que fraccion del span si
// aparece textualmente y, opt-in, deja pasar las de cobertura alta — etiquetadas
// como "partial" con su numero, para no aflojar la honestidad por default.
//
// Honestidad sobre el limite: esto prueba ATRIBUCION VERIFICABLE (la respuesta
// esta anclada a un span literal del paper), NO que el paper fuera imprescindible.

/** Una cita tal como la produce ask.ts. */
export interface Citation {
  paperId: string; // que paper afirma citar
  citedText: string; // el span que Claude cito
}

export type MatchStatus = "exact" | "partial" | "unverified";

/** El resultado detallado de verificar un span contra su paper. */
export interface SpanResult {
  status: MatchStatus;
  coverage: number; // 1 = exacto; fraccion del span que matcheo en el caso parcial
  matched: string; // el fragmento (normalizado) que efectivamente se encontro
}

/** Una cita que paso el guard. Lleva como matcheo y con que confianza. */
export interface VerifiedCitation extends Citation {
  verified: true;
  status: "exact" | "partial";
  coverage: number;
  matchedText: string;
}

/** El corpus: un diccionario que mapea cada paperId a su texto completo. */
export type Corpus = Record<string, string>;

export interface VerifyOptions {
  /** Si es true, deja pasar tambien citas parciales de cobertura alta. Default: false. */
  acceptPartial?: boolean;
}

// Umbrales para aceptar una cita PARCIAL (solo si acceptPartial = true).
const PARTIAL_MIN_COVERAGE = 0.8; // al menos el 80% del span tiene que matchear...
const PARTIAL_MIN_CHARS = 24; // ...y el tramo matcheado tiene que ser sustancial.

/**
 * Normaliza texto para comparar sin que el ruido del PDF cause falsos negativos.
 * No cambia el sentido: solo unifica formato. Se aplica igual a ambos lados.
 */
export function normalizeText(s: string): string {
  return (
    s
      .normalize("NFKC")
      // comillas y guiones que los PDFs deforman -> ASCII
      .replace(/[‘’ʼ′]/g, "'") // ' ' modifier-apostrophe prime
      .replace(/[“”″]/g, '"') // " " double-prime
      .replace(/[‐-―−]/g, "-") // varios guiones + signo menos
      .replace(/…/g, "...") // puntos suspensivos
      // une palabras cortadas por salto de linea: inter-\nface -> interface
      .replace(/-\s*\n\s*/g, "")
      // guion blando y caracteres de ancho cero
      .replace(/[­​-‍﻿]/g, "")
      // colapsa TODO espacio (saltos de linea, tabs, NBSP, multiples) a uno solo
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

/**
 * Tramo mas largo de palabras CONSECUTIVAS del span que es substring del paper.
 * Sirve para medir cuanto de una cita parcial es realmente textual.
 */
function longestMatchingRun(span: string, paper: string): { run: string; coverage: number } {
  const words = span.split(" ").filter(Boolean);
  let best = "";

  for (let i = 0; i < words.length; i++) {
    let run = "";
    for (let j = i; j < words.length; j++) {
      const candidate = run ? `${run} ${words[j]}` : words[j];
      if (paper.includes(candidate)) run = candidate;
      else break; // en cuanto deja de matchear, cortamos este arranque
    }
    if (run.length > best.length) best = run;
  }

  return { run: best, coverage: span.length ? best.length / span.length : 0 };
}

/**
 * Verifica un span contra su paper. Devuelve el detalle del matcheo:
 *  - "exact":   el span aparece textual (tras normalizar)
 *  - "partial": no exacto, pero un tramo contiguo cubre >= 80% del span
 *  - "unverified": ni siquiera eso -> probable alucinacion
 */
export function verifySpan(cita: Citation, corpus: Corpus): SpanResult {
  const paperRaw = corpus[cita.paperId];
  if (paperRaw === undefined) return { status: "unverified", coverage: 0, matched: "" };

  const span = normalizeText(cita.citedText);
  if (span === "") return { status: "unverified", coverage: 0, matched: "" };

  const paper = normalizeText(paperRaw);

  if (paper.includes(span)) {
    return { status: "exact", coverage: 1, matched: span };
  }

  const { run, coverage } = longestMatchingRun(span, paper);
  if (coverage >= PARTIAL_MIN_COVERAGE && run.length >= PARTIAL_MIN_CHARS) {
    return { status: "partial", coverage, matched: run };
  }

  return { status: "unverified", coverage, matched: run };
}

/**
 * Boolean estricto: true solo si el span es literal (exacto tras normalizar).
 * Es la puerta por default — la que usa el loop — y la mas defendible.
 */
export function isLiteralSpan(cita: Citation, corpus: Corpus): boolean {
  return verifySpan(cita, corpus).status === "exact";
}

/**
 * Devuelve solo las citas verificadas. Por default, estricto (solo exactas).
 * Con { acceptPartial: true } tambien pasan las parciales de cobertura alta,
 * marcadas con status "partial" y su `coverage` para que el resto del loop
 * (o la UI) pueda mostrarlas distinto.
 */
export function verifyCitations(
  citations: Citation[],
  corpus: Corpus,
  opts: VerifyOptions = {},
): VerifiedCitation[] {
  const acceptPartial = opts.acceptPartial ?? false;
  const out: VerifiedCitation[] = [];

  for (const cita of citations) {
    const r = verifySpan(cita, corpus);
    if (r.status === "exact" || (acceptPartial && r.status === "partial")) {
      out.push({
        ...cita,
        verified: true,
        status: r.status,
        coverage: Math.round(r.coverage * 100) / 100,
        matchedText: r.matched,
      });
    }
  }

  return out;
}
