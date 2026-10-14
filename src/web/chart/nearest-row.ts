/**
 * The index of the row whose time is nearest `time`, by binary search over the ascending row times `t`.
 * A time before the first row gives 0, after the last gives the last row, and a tie goes to the earlier row.
 * An empty log gives -1.
 */
export function nearestRow(t: readonly number[], time: number): number {
  if (t.length === 0) return -1;
  let lo = 0;
  let hi = t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((t[mid] as number) < time) lo = mid + 1;
    else hi = mid;
  }
  // `lo` is the first row at or after `time`; the row before it may be nearer.
  if (lo > 0 && time - (t[lo - 1] as number) <= (t[lo] as number) - time) return lo - 1;
  return lo;
}
