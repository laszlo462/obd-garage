import type { ChartPanelModel } from "./series.ts";

/**
 * The horizontal lines a panel draws for the Reference Report's freeze frame: one per series that has a
 * value in it, at that value and in the series' colour (`colorIndex` is the series' picker index).
 */
export function freezeLines(
  panel: ChartPanelModel,
  freezeFrame: readonly { key: string; value: number }[],
): { value: number; colorIndex: number }[] {
  return panel.series.flatMap((s) => {
    const row = freezeFrame.find((f) => f.key === s.key);
    return row ? [{ value: row.value, colorIndex: s.index }] : [];
  });
}
