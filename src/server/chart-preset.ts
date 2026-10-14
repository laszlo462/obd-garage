import type { ChartPanel } from "../profiles/types.ts";

/** How many Channels the fallback charts when none of the preset's series is in the log. */
const FALLBACK_PANELS = 3;

/**
 * The panels to draw for one Drive Log. Series the log lacks are dropped, and so are panels left with none.
 * When nothing is left, the first 3 visible Channels in log order are charted, one panel each.
 */
export function resolveChartPreset(
  preset: readonly ChartPanel[],
  channels: Readonly<Record<string, { label: string; unit?: string }>>,
  hidden: readonly string[],
): ChartPanel[] {
  const panels = preset
    .map((panel) => ({ ...panel, series: panel.series.filter((s) => s.key in channels) }))
    .filter((panel) => panel.series.length > 0);
  if (panels.length > 0) return panels;
  return Object.entries(channels)
    .filter(([key]) => !hidden.includes(key))
    .slice(0, FALLBACK_PANELS)
    .map(([key, ch]) => ({
      title: ch.label,
      unit: ch.unit ?? "",
      series: [{ key, label: ch.label }],
    }));
}
