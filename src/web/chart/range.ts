export type Range = { min: number; max: number };

/**
 * Fits a requested range to the drive: at least `minSpan` wide (widened around its middle), never wider than
 * the drive, and slid back inside it, keeping its width, if it runs off either end.
 */
export function clampRange(range: Range, whole: Range, minSpan: number): Range {
  const total = whole.max - whole.min;
  const width = Math.min(total, Math.max(minSpan, range.max - range.min));
  const middle = (range.min + range.max) / 2;
  const min = Math.min(whole.max - width, Math.max(whole.min, middle - width / 2));
  return { min, max: min + width };
}
