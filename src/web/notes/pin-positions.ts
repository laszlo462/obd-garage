import type { Range } from "../chart/range.ts";

/**
 * Where each pinned row sits across the plot, as a fraction of the visible `range` (0 at the left edge, 1 at
 * the right). A row out of view is dropped.
 */
export function pinPositions(
  rows: readonly number[],
  t: readonly number[],
  range: Range,
): { row: number; fraction: number }[] {
  const span = range.max - range.min || 1;
  return rows
    .map((row) => ({ row, fraction: ((t[row] ?? 0) - range.min) / span }))
    .filter((p) => p.fraction >= 0 && p.fraction <= 1);
}
