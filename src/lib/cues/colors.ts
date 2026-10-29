// Colour helpers for the cue engine.
//
// v1 writes the literal R/G/B a cue carries straight into the Rekordbox
// POSITION_MARK (the Red/Green/Blue attributes are literal 0-255 values that
// real rekordbox 5/6/7 exports use). Snapping each colour to the nearest swatch
// in Rekordbox's named palette is a Phase 1.1 refinement — the exact palette and
// whether Markers2 stores displayed vs. stored RGB are PHASE 0 validation items
// (plan §2 "Colour mapping"), so we keep raw RGB faithful for now and expose the
// mapping primitives here for when the real export is measured.

import { Rgb } from './types';

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return (h(r) + h(g) + h(b)).toUpperCase();
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace(/^#|^0x/i, ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function dist2(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Nearest colour in a palette by squared RGB distance. Returns the input
 *  unchanged when the palette is empty. */
export function nearestInPalette(c: Rgb, palette: Rgb[]): Rgb {
  if (!palette.length) return c;
  let best = palette[0], bestD = dist2(c, palette[0]);
  for (let i = 1; i < palette.length; i++) {
    const d = dist2(c, palette[i]);
    if (d < bestD) { best = palette[i]; bestD = d; }
  }
  return best;
}

/**
 * Serato's legacy `Serato Markers_` stores a hot-cue colour in its *stored*
 * form; Serato displays it darker, by subtracting 0x666666 (clamped at 0). The
 * modern `Serato Markers2` block already holds the displayed colour, so this is
 * only needed on the legacy-only path. See plan §2 "Colour mapping".
 */
export function seratoStoredToDisplayed({ r, g, b }: Rgb): Rgb {
  return { r: Math.max(0, r - 0x66), g: Math.max(0, g - 0x66), b: Math.max(0, b - 0x66) };
}
