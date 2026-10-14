/** True when `t` lies within any Rule Pack span, inclusive at both edges. */
export function inPackSpan(
  events: readonly {
    kind: string;
    category: string;
    startSec: number | null;
    endSec: number | null;
  }[],
  t: number,
): boolean {
  return events.some(
    (e) =>
      e.category === "pack" &&
      e.kind === "span" &&
      e.startSec !== null &&
      e.endSec !== null &&
      t >= e.startSec &&
      t <= e.endSec,
  );
}
