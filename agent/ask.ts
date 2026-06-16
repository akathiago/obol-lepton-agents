// agent/ask.ts
//
// Asks Claude using the Citations API. We pass the corpus papers as documents
// with citations enabled; Claude responds and, at the API level, anchors each
// claim to a literal span of the source paper. We don't generate the citations
// by hand: the Citations API guarantees that `cited_text` is real text from the
// document.
//
// Returns the prose answer + the UNverified citations. The guard (verify.ts)
// re-checks them afterward.

import Anthropic from "@anthropic-ai/sdk";
import type { Citation, Corpus } from "./verify";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

export interface Answer {
  question: string;
  text: string; // the prose answer
  citations: Citation[]; // the cited spans, not yet verified
}

export async function ask(question: string, corpus: Corpus): Promise<Answer> {
  // The order of the papers fixes the index the Citations API uses per document.
  const paperIds = Object.keys(corpus);

  const documents = paperIds.map((paperId, idx) => ({
    type: "document" as const,
    title: paperId,
    source: {
      type: "text" as const,
      media_type: "text/plain" as const,
      data: corpus[paperId],
    },
    citations: { enabled: true },
    // Cache breakpoint on the last document: re-asking over the same corpus within
    // the cache window reads the documents back at 0.1× instead of full input price.
    ...(idx === paperIds.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
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

  // Walk the text blocks: collect the prose and extract each citation.
  let text = "";
  const citations: Citation[] = [];

  for (const block of response.content) {
    if (block.type !== "text") continue;
    text += block.text;

    for (const cita of block.citations ?? []) {
      // Each citation points to a document by index; we map it to the paperId.
      const paperId = paperIds[cita.document_index];
      citations.push({ paperId, citedText: cita.cited_text });
    }
  }

  return { question, text, citations };
}
