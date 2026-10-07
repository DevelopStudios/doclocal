/**
 * Turns the LaTeX the model copies out of a maths-heavy document into readable prose.
 *
 * Answers are plain prose read straight off the screen, so there is no maths renderer to hand the
 * notation to: whatever arrives is printed into a `<span>`. Ask an arXiv paper about multi-head
 * attention and the model mirrors the source's notation, so the reader gets a literal
 * `MultiHead\((Q,K,V)=\text{Concat}(head_1,\dots,head_h)W^O\)`.
 *
 * The notation itself carries meaning, so this unwraps rather than deletes: delimiters and wrapper
 * commands go, the symbols inside stay. Only `\(…\)` and `\[…\]` count as maths — `$…$` is left
 * alone because a bare `$` is far more often a price than a formula.
 */

/** `\text{model}` → `model`. Wrappers only: these contribute nothing once the maths is plain text. */
const WRAPPER = /\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|operatorname)\s*\{([^{}]*)\}/g;

/** `\,` `\;` `\!` `\quad` and friends: typesetting-only spacing, meaningless in prose. */
const SPACING = /\\[,;:!]|\\q?quad\b|\\ /g;

const ELLIPSIS = /\\(?:dots|ldots|cdots|hdots)\b/g;

/** A delimiter still mid-stream (`\`, `\(`, `\(d_k`) — hidden until it closes, so it can't flash. */
const PARTIAL = /\s*\\(?:$|[([][^]*$)/;

/**
 * `_{i=1}` → `_i=1`. Models also emit sub- and superscripts bare, with no `\(…\)` around them —
 * `(∑_{i=1}^{h} head_i)` came back from the Attention paper that way. Only `_{` and `^{` are
 * touched: a brace on its own is left alone, since set notation and code in an answer use it.
 */
const SCRIPT = /([_^])\{([^{}]*)\}/g;

function unwrap(body: string): string {
    let out = body;
    // Nested wrappers resolve from the inside out: `\mathbf{\text{x}}` needs two passes.
    for (let depth = 0; depth < 4 && WRAPPER.test(out); depth++) {
        WRAPPER.lastIndex = 0;
        out = out.replace(WRAPPER, '$1');
    }
    WRAPPER.lastIndex = 0;
    return out
        .replace(ELLIPSIS, '…')
        .replace(SPACING, '')
        // `d_{model}` → `d_model`: braces are grouping syntax, not something to read.
        .replace(/\{([^{}]*)\}/g, '$1')
        // Same for an index's brackets — and they have to go, or `a_[1]` would reach the citation
        // scanner in parts.ts and render as a source chip pointing at excerpt 1.
        .replace(/\[(\d+)\]/g, '$1')
        .trim();
}

/** `_{a_{b}}` nests, so flatten from the inside out until nothing changes. */
function flattenScripts(text: string): string {
    let out = text;
    for (let depth = 0; depth < 4; depth++) {
        const next = out.replace(SCRIPT, '$1$2');
        if (next === out) break;
        out = next;
    }
    return out;
}

export function stripMath(content: string): string {
    const unwrapped = content.replace(
        /\\\(([^]*?)\\\)|\\\[([^]*?)\\\]/g,
        (_match, inline: string | undefined, display: string | undefined) =>
            unwrap(inline ?? display ?? ''),
    );
    // Across the whole answer, not just the formulas: models emit scripts bare just as often.
    const flattened = flattenScripts(unwrapped);
    // Only after the closed pairs are gone, so a `\(` inside a finished formula isn't read as partial.
    return flattened.replace(PARTIAL, '');
}
