import type { DriveLogDetail } from "../api-types.ts";
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

/** The panels of the server's resolved preset with their data, and the colour index of every series. */
export function chartPanels(detail: DriveLogDetail): ChartPanelModel[] {
  let index = 0;
  return detail.chartPreset.map((panel) => ({
    title: panel.title,
    unit: panel.unit,
    series: panel.series.map((s) => {
      const channel = detail.channels.channels[s.key];
      const values = channel?.values ?? [];
      return {
        key: s.key,
        label: s.label,
        unit: panel.unit || channel?.unit || "",
        values,
        format: channelFormat(values),
        index: index++,
      };
    }),
  }));
}
