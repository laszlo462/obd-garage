/** The rows shown so far plus the next page, without any id the rows already have. */
export function appendPage<T extends { id: number }>(rows: readonly T[], page: readonly T[]): T[] {
  const seen = new Set(rows.map((r) => r.id));
  const added: T[] = [];
  for (const row of page) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    added.push(row);
  }
  return [...rows, ...added];
}
