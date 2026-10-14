import { describe, expect, it } from "vitest";
import type { ChartPanel } from "../profiles/types.ts";
import { resolveChartPreset } from "./chart-preset.ts";

const ch = (label: string, unit?: string) => ({ label, ...(unit ? { unit } : {}) });

const preset: ChartPanel[] = [
  { title: "Vehicle speed", unit: "mph", series: [{ key: "speed", label: "Speed" }] },
  {
    title: "EGR position",
    unit: "%",
    series: [
      { key: "egrCommanded", label: "Commanded" },
      { key: "egrActual", label: "Actual" },
    ],
  },
  { title: "Mass air flow", unit: "lb/min", series: [{ key: "maf", label: "MAF" }] },
];

describe("resolveChartPreset", () => {
  it("keeps the panels whose series the log has", () => {
    const channels = { speed: ch("Vehicle speed"), maf: ch("MAF") };
    expect(resolveChartPreset(preset, channels, []).map((p) => p.title)).toEqual([
      "Vehicle speed",
      "Mass air flow",
    ]);
  });

  it("drops the series the log lacks and keeps the rest of the panel", () => {
    const channels = { egrActual: ch("EGR actual") };
    expect(resolveChartPreset(preset, channels, [])).toEqual([
      { title: "EGR position", unit: "%", series: [{ key: "egrActual", label: "Actual" }] },
    ]);
  });

  it("charts the first 3 visible Channels in log order when nothing in the preset is left", () => {
    const channels = {
      "extra.a": ch("A", "x"),
      "extra.hidden": ch("Hidden"),
      "extra.b": ch("B"),
      "extra.c": ch("C"),
      "extra.d": ch("D"),
    };
    expect(resolveChartPreset(preset, channels, ["extra.hidden"])).toEqual([
      { title: "A", unit: "x", series: [{ key: "extra.a", label: "A" }] },
      { title: "B", unit: "", series: [{ key: "extra.b", label: "B" }] },
      { title: "C", unit: "", series: [{ key: "extra.c", label: "C" }] },
    ]);
  });

  it("returns nothing for a log without Channels", () => {
    expect(resolveChartPreset(preset, {}, [])).toEqual([]);
  });
});
