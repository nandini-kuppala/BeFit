import type { Nutrients, Portion } from '../api/types';

/**
 * Client-side mirror of the server's portion maths, for live previews only.
 * What gets saved is always recomputed server-side from `portion.key`, so a
 * preview can never disagree with the log for long.
 */

const MASS_OR_VOLUME = new Set(['g', 'ml']);

export function isMeasured(portion: Portion | undefined): boolean {
  return !!portion && MASS_OR_VOLUME.has(portion.key);
}

/** What the quantity field starts at for a unit: 100 g, or 1 of anything else. */
export function defaultQuantity(portion: Portion | undefined): number {
  return isMeasured(portion) ? 100 : 1;
}

/** Stepper increment: 10 g / 10 ml, half a unit for everything else. */
export function stepFor(portion: Portion | undefined): number {
  return isMeasured(portion) ? 10 : 0.5;
}

export function minFor(portion: Portion | undefined): number {
  return isMeasured(portion) ? 1 : 0.25;
}

export function gramsFor(portion: Portion | undefined, quantity: number): number {
  return (portion?.grams ?? 100) * quantity;
}

export function scale(per100g: Nutrients, grams: number): Nutrients {
  const factor = grams / 100;
  const out = {} as Nutrients;
  for (const key of Object.keys(per100g) as (keyof Nutrients)[]) {
    out[key] = per100g[key] * factor;
  }
  return out;
}

/** "1", "1.5", "½", "¼" — fractions as people write them. */
export function formatQuantity(value: number): string {
  const whole = Math.floor(value);
  const frac = Math.round((value - whole) * 100) / 100;
  const glyph = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : null;
  if (glyph) return whole ? `${whole}${glyph}` : glyph;
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** "2 idli", "1½ katori", "150 g". */
export function describePortion(quantity: number, portion: Portion | undefined): string {
  const unit = (portion?.label ?? '1 serving').replace(/^1\s+/, '');
  return `${formatQuantity(quantity)} ${unit}`;
}

/** Parse what was typed into the quantity field, accepting "1/2" and "½". */
export function parseQuantity(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!cleaned) return null;
  const glyphs: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
  if (glyphs[cleaned] !== undefined) return glyphs[cleaned];
  const mixed = cleaned.match(/^(\d+)\s*([¼½¾])$/);
  if (mixed) return Number(mixed[1]) + glyphs[mixed[2]];
  const fraction = cleaned.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : null;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function findPortion(portions: Portion[], key: string | null | undefined): Portion | undefined {
  if (!key) return portions[0];
  return portions.find((p) => p.key === key) ?? portions[0];
}
