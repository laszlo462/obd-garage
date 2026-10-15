import { type ChannelFormat, channelFormat } from "./channel-format.ts";

/** One drawn line: a Channel in a panel, with how its readout slot writes it. */
export type ChartSeries = {
  key: string;
  label: string;
  unit: string;
  values: readonly (number | null)[];
  format: ChannelFormat;
  /** Position in picker order across all panels; picks the colour (`--c1`…`--c6`, repeating). */
  index: number;
};

export type ChartPanelModel = { title: string; unit: string; series: ChartSeries[] };

/** A Channel of the log as the payload carries it. */
export type ChannelData = { label: string; unit?: string; values: readonly (number | null)[] };

/** One panel of a Profile's default chart preset. */
export type PresetPanel = {
  title: string;
  unit: string;
  series: readonly { key: string; label: string }[];
};

/**
 * The panels for the charted Channels. `charted` is the picker order, and a series' `index` is its place in
 * it. The preset's panels keep their charted series; a charted Channel in no preset panel gets its own panel
 * at the end; a panel left empty is dropped. A charted key the log lacks is skipped.
 */
export function pickerPanels(
  preset: readonly PresetPanel[],
  charted: readonly string[],
  channels: Readonly<Record<string, ChannelData>>,
): ChartPanelModel[] {
  const series = (key: string, label: string, unit: string): ChartSeries[] => {
    const channel = channels[key];
    const index = charted.indexOf(key);
    if (!channel || index < 0) return [];
    return [
      {
        key,
        label,
        unit: unit || channel.unit || "",
        values: channel.values,
        format: channelFormat(channel.values),
        index,
      },
    ];
  };
  const inPreset = new Set(preset.flatMap((p) => p.series.map((s) => s.key)));
  const own = charted.filter((key) => !inPreset.has(key) && channels[key]);
  return [
    ...preset.map((panel) => ({
      title: panel.title,
      unit: panel.unit,
      series: panel.series.flatMap((s) => series(s.key, s.label, panel.unit)),
    })),
    ...own.map((key) => {
      const channel = channels[key] as ChannelData;
      return {
        title: channel.label,
        unit: channel.unit ?? "",
        series: series(key, channel.label, ""),
      };
    }),
  ].filter((panel) => panel.series.length > 0);
}

/** The Channel keys of a preset in order: the charted set a Drive Log opens with. */
export function presetKeys(preset: readonly PresetPanel[]): string[] {
  return [...new Set(preset.flatMap((p) => p.series.map((s) => s.key)))];
}

/**
 * The Channels in the order the chips and the data table list them: the charted ones in picker order, then the
 * visible ones left over in log order. The Profile's `hidden` Channels appear only once charted.
 */
export function channelOrder(
  charted: readonly string[],
  channels: Readonly<Record<string, unknown>>,
  hidden: readonly string[],
): { charted: string[]; others: string[] } {
  const shown = charted.filter((key) => key in channels);
  return {
    charted: shown,
    others: Object.keys(channels).filter((key) => !shown.includes(key) && !hidden.includes(key)),
  };
}
