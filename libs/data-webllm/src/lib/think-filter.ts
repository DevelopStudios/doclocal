const OPEN = '<think>';
const CLOSE = '</think>';

/**
 * Streaming filter that keeps `<think>` reasoning out of the rendered answer.
 *
 * Qwen3/Qwen3.5 are hybrid reasoning models: even with thinking disabled they still
 * emit an empty `<think></think>` pair. A per-token `replace` misses it, because a tag
 * is routinely split across two streamed tokens (`'<'` then `'think>'`), so this holds
 * back any trailing text that could still turn out to be the start of a tag and emits
 * everything else immediately — the answer has to stream, not arrive in one block.
 */
export interface ThinkFilter {
  /** Feed one streamed chunk; returns the text safe to render now. */
  push(chunk: string): string;
  /** Call once the stream ends; returns any text that was still held back. */
  flush(): string;
}

/** Length of the longest suffix of `text` that is a partial (not complete) `tag`. */
function partialTagTail(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let k = max; k > 0; k--) {
    if (text.endsWith(tag.slice(0, k))) return k;
  }
  return 0;
}

export function createThinkFilter(): ThinkFilter {
  let carry = '';
  let inside = false;

  return {
    push(chunk: string): string {
      carry += chunk;
      let out = '';

      for (;;) {
        if (inside) {
          const end = carry.indexOf(CLOSE);
          if (end !== -1) {
            carry = carry.slice(end + CLOSE.length);
            inside = false;
            continue;
          }
          // Discard reasoning, but keep a tail that may be a split closing tag.
          carry = carry.slice(carry.length - partialTagTail(carry, CLOSE));
          return out;
        }

        // A stray closing tag with no opener is still reasoning scaffolding, not answer.
        const stray = carry.indexOf(CLOSE);
        const start = carry.indexOf(OPEN);
        if (stray !== -1 && (start === -1 || stray < start)) {
          out += carry.slice(0, stray);
          carry = carry.slice(stray + CLOSE.length);
          continue;
        }
        if (start !== -1) {
          out += carry.slice(0, start);
          carry = carry.slice(start + OPEN.length);
          inside = true;
          continue;
        }
        const held = Math.max(partialTagTail(carry, OPEN), partialTagTail(carry, CLOSE));
        out += carry.slice(0, carry.length - held);
        carry = carry.slice(carry.length - held);
        return out;
      }
    },

    flush(): string {
      // An unterminated `<think>` block is reasoning the model never closed: drop it.
      const out = inside ? '' : carry;
      carry = '';
      inside = false;
      return out;
    },
  };
}
