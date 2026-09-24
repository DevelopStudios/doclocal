export interface Box { left: number; top: number; right: number; bottom: number; width: number; }

export interface PreviewPlacement {
  /** Viewport coordinates for a `position: fixed` preview. */
  left: number;
  /** The chip's top edge minus a gap when `above` (the preview is shifted up by its own height), else below the chip. */
  top: number;
  width: number;
  above: boolean;
}

const MAX_WIDTH = 320;
const MARGIN = 8;
const GAP = 6;
/** Rough height of a preview card; with less room than this above the chip, open below it. */
const ROOM_ABOVE = 140;

/** Where to show a citation preview so it stays inside the chat column instead of overflowing it. */
export function placePreview(chip: Box, column: Box): PreviewPlacement {
  const width = Math.min(MAX_WIDTH, column.width - 2 * MARGIN);
  const left = Math.max(column.left + MARGIN, Math.min(chip.left, column.right - MARGIN - width));
  const above = chip.top - column.top >= ROOM_ABOVE;
  return { left, top: above ? chip.top - GAP : chip.bottom + GAP, width, above };
}
