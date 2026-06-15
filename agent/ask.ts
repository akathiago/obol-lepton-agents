// agent/ask.ts
//
// Le pregunta a Claude usando la Citations API. Le pasamos los papers del corpus
// como documentos con citas habilitadas; Claude responde y, a nivel de API, ancla
// cada afirmacion a un span literal del paper fuente. No generamos las citas a
// mano: la Citations API garantiza que `cited_text` es texto real del documento.
//
// Devuelve la respuesta en prosa + las citas SIN verificar. El guard (verify.ts)
// las re-chequea despues.

import Anthropic from "@anthropic-ai/sdk";
import type { Citation, Corpus } from "./verify";

const client = new Anthropic(); // toma ANTHROPIC_API_KEY del entorno
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

export interface Answer {
  question: string;
  text: string; // la respuesta en prosa
  citations: Citation[]; // los spans citados, todavia sin verificar
}

export async function ask(question: string, corpus: Corpus): Promise<Answer> {
  // El orden de los papers fija el indice que la Citations API usa por documento.
  const paperIds = Object.keys(corpus);

  const documents = paperIds.map((paperId) => ({
    type: "document" as const,
    title: paperId,
    source: {
      type: "text" as const,
      media_type: "text/plain" as const,
      data: corpus[paperId],
    },
    citations: { enabled: true },
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [...documents, { type: "text" as const, text: question }],
      },
    ],
  });

  // Recorremos los bloques de texto: juntamos la prosa y extraemos cada cita.
  let text = "";
  const citations: Citation[] = [];

  for (const block of response.content) {
    if (block.type !== "text") continue;
    text += block.text;

    for (const cita of block.citations ?? []) {
      // Cada cita apunta a un documento por indice; lo mapeamos al paperId.
      const paperId = paperIds[cita.document_index];
      citations.push({ paperId, citedText: cita.cited_text });
    }
  }

  return { question, text, citations };
}
