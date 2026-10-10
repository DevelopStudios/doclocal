/** A filename split for middle truncation: the head may be clipped, the tail may not. */
export interface TruncatedName {
  head: string;
  tail: string;
}

/**
 * Split a filename so CSS can put the ellipsis in the middle.
 *
 * End truncation cuts the extension off, and wrapping breaks a name mid-word
 * ("DocLocal-Technical- / Brief.pdf"). So the head is rendered in a box that clips with
 * an ellipsis and the tail in one that cannot shrink: the browser drops exactly as many
 * middle characters as it must, and `.pdf` always survives.
 *
 * Short names come back whole -- there is nothing to gain by splitting a name that fits.
 */
export function middleTruncate(name: string, tailLength = 8): TruncatedName {
  if (name.length <= 16) return { head: name, tail: '' };

  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot) : '';
  // The tail always carries the extension plus a couple of characters of the stem, so it
  // reads as "…something.pdf" rather than as a bare suffix.
  const tail = Math.max(tailLength, extension.length + 2);
  const cut = Math.max(1, name.length - tail);

  return { head: name.slice(0, cut), tail: name.slice(cut) };
}
