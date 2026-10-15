import { describe, expect, it } from "vitest";
import { channelFormat } from "./channel-format.ts";
import { freezeLines } from "./freeze-lines.ts";
import type { ChartPanelModel } from "./series.ts";

const series = (key: string, index: number): ChartPanelModel["series"][number] => ({
  key,
  label: key,
  unit: "",
  values: [],
  format: channelFormat([]),
  index,
});
const panel = (...s: ChartPanelModel["series"]): ChartPanelModel => ({
  title: "Panel",
  unit: "",
  series: s,
});

describe("freezeLines", () => {
  it("draws the freeze-frame value of each series that has one, in that series' colour", () => {
    const frame = [
      { key: "rpm", value: 1346 },
      { key: "speed", value: 54.68 },
    ];
    expect(freezeLines(panel(series("speed", 0), series("rpm", 2)), frame)).toEqual([
      { value: 54.68, colorIndex: 0 },
      { value: 1346, colorIndex: 2 },
    ]);
  });

  it("skips the series the freeze frame has no value for, and draws nothing without any", () => {
    const p = panel(series("speed", 0), series("rpm", 2));
    expect(freezeLines(p, [{ key: "rpm", value: 1346 }])).toEqual([{ value: 1346, colorIndex: 2 }]);
    expect(freezeLines(p, [{ key: "load", value: 40 }])).toEqual([]);
    expect(freezeLines(p, [])).toEqual([]);
  });
});
