import type uPlot from "uplot";
import { tickLabels } from "./clock.ts";
import type { Range } from "./range.ts";

/** The time axis under the last panel. */
export const AXIS_HEIGHT = 22;
const Y_AXIS_WIDTH = 44;
/** Room above the plot for the panel's label, and below it for the bottom tick label. */
const PAD_TOP = 18;
const PAD_BOTTOM = 8;
/** Share of the data's span left above and below it, so lines and tick labels keep clear of the edges. */
const HEADROOM = 0.05;

export type PanelSpec = {
  width: number;
  height: number;
  /** True for the last panel, which carries the wall-clock axis. */
  showTimeAxis: boolean;
  /** Seconds past midnight of the log's first moment. */
  startSec: number;
  series: { label: string; color: string }[];
  range: Range;
  /** Colours read from the tokens now in force. */
  ink: string;
  surface: string;
  muted: string;
  line: string;
  font: string;
};

/** The y range for the data in view; a single value gets a span around it instead of uPlot's 0 to 100. */
function yRange(_u: uPlot, min: number, max: number): [number, number] {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * HEADROOM;
  return [min - pad, max + pad];
}

/**
 * Round y ticks, at least two and at most about five inside `min..max`. uPlot's own pick can leave a
 * short panel with a single tick; a step no bigger than half the span always fits two multiples.
 */
function yTicks(_u: uPlot, _axis: number, min: number, max: number): number[] {
  const half = (max - min) / 2;
  const mag = 10 ** Math.floor(Math.log10(half));
  const step = [10, 5, 2.5, 2, 1].map((m) => m * mag).find((s) => s <= half * (1 + 1e-9)) ?? mag;
  const ticks: number[] = [];
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max * (1 + 1e-12) + 1e-12; k++)
    ticks.push(Number((k * step).toPrecision(12)));
  return ticks;
}

/**
 * The uPlot options for one stacked panel. uPlot's own mouse handling is off (our handlers on the overlay
 * replace it); the cursor is a solid 1.2 px `--ink` line with a 9 px dot in the series colour ringed in
 * `--surface`.
 */
export function panelOptions(spec: PanelSpec): uPlot.Options {
  const { series, ink, surface, muted, line, font, startSec } = spec;
  return {
    width: spec.width,
    height: spec.height,
    legend: { show: false },
    padding: [PAD_TOP, 8, PAD_BOTTOM, 0],
    scales: {
      x: { time: false, min: spec.range.min, max: spec.range.max },
      y: { range: yRange },
    },
    cursor: {
      x: true,
      y: false,
      drag: { x: false, y: false, setScale: false },
      points: {
        size: 9,
        width: 2,
        stroke: () => surface,
        fill: (_u, seriesIdx) => series[seriesIdx - 1]?.color ?? ink,
      },
      bind: {
        mousedown: () => null,
        mouseup: () => null,
        click: () => null,
        dblclick: () => null,
        mousemove: () => null,
        mouseleave: () => null,
        mouseenter: () => null,
      },
    },
    select: { show: true, left: 0, top: 0, width: 0, height: 0 },
    hooks: {
      ready: [
        (u) => {
          const cursor = u.root.querySelector<HTMLElement>(".u-cursor-x");
          if (!cursor) return;
          cursor.style.borderRight = `1.2px solid ${ink}`;
          cursor.style.borderBottom = "0";
        },
      ],
    },
    axes: [
      {
        show: spec.showTimeAxis,
        stroke: muted,
        font,
        size: AXIS_HEIGHT,
        grid: { stroke: line, width: 1 },
        ticks: { show: false },
        values: (u, splits) => {
          const span = (u.scales.x?.max ?? 0) - (u.scales.x?.min ?? 0);
          return tickLabels(startSec, splits, span);
        },
      },
      {
        stroke: muted,
        font,
        size: Y_AXIS_WIDTH,
        splits: yTicks,
        grid: { stroke: line, width: 1 },
        ticks: { show: false },
      },
    ],
    series: [
      {},
      ...series.map((s) => ({ label: s.label, stroke: s.color, width: 1.5, spanGaps: false })),
    ],
  };
}
