import type { Range } from "../chart/range.ts";

export type OverlayShape = {
  kind: "span" | "point";
  category: string;
  /** Time units, as the chart's x scale. */
  x0: number;
  x1: number;
};

/**
 * The Events in view as the chart draws them. Events wholly outside `range` are dropped, a span that
 * crosses an edge is clipped to it, and a point exactly on an edge stays.
 */
export function overlayShapes(
  events: readonly {
    kind: string;
    category: string;
    startSec: number | null;
    endSec: number | null;
  }[],
  range: Range,
): OverlayShape[] {
  return events.flatMap((e) => {
    if (e.startSec === null || e.endSec === null) return [];
    if (e.startSec > range.max || e.endSec < range.min) return [];
    return [
      {
        kind: e.kind as OverlayShape["kind"],
        category: e.category,
        x0: Math.max(e.startSec, range.min),
        x1: Math.min(e.endSec, range.max),
      },
    ];
  });
}
