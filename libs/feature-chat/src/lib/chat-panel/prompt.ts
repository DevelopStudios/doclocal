import type { RagResult } from '@doclocal/data-rag';

/** The reply when the document doesn't answer the question; the prompt asks the model for it too. */
export const NOT_FOUND = "I couldn't find that in the document.";

/** A prompt answering `question` from the retrieved excerpts (callers skip the model when there are none). */
export function buildPrompt(results: RagResult[], question: string): string {
  const context = results.map((r, i) => `[${i + 1}] ${r.chunk.text}`).join('\n\n');
  // Two findings from testing Qwen2.5-3B: a literal example like "[2]" gets copied onto every
  // sentence, and an absolute "reply with exactly ... and nothing else" makes it refuse even when
  // the top excerpt answers the question. Citation numbers are also checked afterwards (repairCitations).
  return `You are a document assistant. Answer the question using ONLY the numbered excerpts below.

Excerpts:
${context}

Question: ${question}

Rules:
- Write in plain prose, not a list.
- End every sentence that uses an excerpt with that excerpt's number in square brackets, like [n]. Never collect sources at the end.
- Only if none of the excerpts relate to the question, say "${NOT_FOUND}"

Answer:`;
}
