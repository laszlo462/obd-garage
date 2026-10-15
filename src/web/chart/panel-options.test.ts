// @vitest-environment happy-dom
import type uPlot from "uplot";
import { describe, expect, it } from "vitest";
import { panelOptions } from "./panel-options.ts";

const spec = (over: Partial<Parameters<typeof panelOptions>[0]> = {}) => ({
  width: 360,
  height: 104,
  showTimeAxis: false,
  startSec: 0,
  series: [
    { label: "Speed", color: "rgb(1, 1, 1)" },
    { label: "RPM", color: "rgb(2, 2, 2)" },
  ],
  range: { min: 0, max: 100 },
  ink: "rgb(10, 10, 10)",
  surface: "rgb(250, 250, 250)",
  muted: "rgb(120, 120, 120)",
  line: "rgb(200, 200, 200)",
  font: "10px monospace",
  ...over,
});

const none = {} as uPlot;
const yRange = (o: uPlot.Options, min: number, max: number) => {
  const range = o.scales?.y?.range as (
    u: uPlot,
    a: number,
    b: number,
    k: string,
  ) => [number, number];
  return range(none, min, max, "y");
};

describe("panelOptions: cursor dots", () => {
  it("draws a 9px dot in each series colour, ringed in --surface", () => {
    const points = panelOptions(spec()).cursor?.points as {
      size: number;
      width: number;
      stroke: (u: uPlot, i: number) => string;
      fill: (u: uPlot, i: number) => string;
    };
    expect(points.size).toBe(9);
    expect(points.width).toBeGreaterThan(0);
    expect(points.stroke(none, 1)).toBe("rgb(250, 250, 250)");
    expect(points.fill(none, 1)).toBe("rgb(1, 1, 1)");
    expect(points.fill(none, 2)).toBe("rgb(2, 2, 2)");
  });
});

describe("panelOptions: room for labels", () => {
  it("leaves a row above the plot for the panel label and some room below for the bottom tick", () => {
    const [top, , bottom] = panelOptions(spec()).padding as number[];
    expect(top).toBeGreaterThanOrEqual(16);
    expect(bottom).toBeGreaterThanOrEqual(6);
  });
});

describe("panelOptions: few rows", () => {
  it("lets uPlot draw a point when there are too few rows to draw a line", () => {
    const series = panelOptions(spec()).series;
    for (const s of series.slice(1)) expect(s.points?.show).not.toBe(false);
  });

  it("gives a single value a scale around it, not 0 to 100", () => {
    const [lo, hi] = yRange(panelOptions(spec()), 73.4, 73.4);
    expect(lo).toBeLessThan(73.4);
    expect(hi).toBeGreaterThan(73.4);
    expect(hi - lo).toBeLessThan(50);
  });

  it("gives a single zero a scale around it", () => {
    const [lo, hi] = yRange(panelOptions(spec()), 0, 0);
    expect(lo).toBeLessThan(0);
    expect(hi).toBeGreaterThan(0);
  });

  it("keeps ordinary data inside its scale", () => {
    const [lo, hi] = yRange(panelOptions(spec()), 20, 80);
    expect(lo).toBeLessThanOrEqual(20);
    expect(hi).toBeGreaterThanOrEqual(80);
  });
});

describe("panelOptions: y ticks", () => {
  const splits = (min: number, max: number) => {
    const axis = panelOptions(spec()).axes?.[1];
    const fn = axis?.splits as (u: uPlot, i: number, min: number, max: number) => number[];
    return fn(none, 1, min, max);
  };

  it("asks for its own ticks, at least two inside the scale, however the data falls", () => {
    for (const [min, max] of [
      [740, 2060],
      [0.5, 0.7],
      [-3, 3],
      [1990, 2010],
      [66.06, 80.74],
    ] as const) {
      const ticks = splits(min, max);
      expect(ticks.length, `${min}..${max}`).toBeGreaterThanOrEqual(2);
      expect(ticks.length, `${min}..${max}`).toBeLessThanOrEqual(6);
      for (const t of ticks) {
        expect(t).toBeGreaterThanOrEqual(min);
        expect(t).toBeLessThanOrEqual(max);
      }
    }
  });

  it("puts them on round numbers", () => {
    expect(splits(740, 2060)).toEqual([1000, 1500, 2000]);
  });
});
