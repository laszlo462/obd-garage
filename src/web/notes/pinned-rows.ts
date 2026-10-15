import { nearestRow } from "../chart/nearest-row.ts";

/** The Notes pinned at each row of a Drive Log, by row index. */
export function pinnedRows<N extends { snappedTimeSec: number | null }>(
  notes: readonly N[],
  t: readonly number[],
): Map<number, N[]> {
  const rows = new Map<number, N[]>();
  for (const n of notes) {
    if (n.snappedTimeSec === null) continue;
    const row = nearestRow(t, n.snappedTimeSec);
    rows.set(row, [...(rows.get(row) ?? []), n]);
  }
  return rows;
}
