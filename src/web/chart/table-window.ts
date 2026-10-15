/**
 * The rows of the data table: `size` rows centred on `row`, slid back inside `0..total` at either end.
 * `end` is exclusive. A log shorter than `size` shows every row.
 */
export function tableWindow(
  row: number,
  total: number,
  size: number,
): { start: number; end: number } {
  const start = Math.max(0, Math.min(row - Math.floor(size / 2), total - size));
  return { start, end: Math.min(total, start + size) };
}
