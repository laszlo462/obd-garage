import { useEffect, useRef } from "preact/hooks";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { drawOverlays } from "../events/draw-overlays.ts";
import { createGestureTracker, type Intent, type TouchPoint } from "./gesture-tracker.ts";
import { nearestRow } from "./nearest-row.ts";
import { AXIS_HEIGHT, panelOptions } from "./panel-options.ts";
import type { Range } from "./range.ts";
import type { ChartPanelModel } from "./series.ts";

/** Plot heights in CSS pixels (DESIGN.md Drive Log viewer). */
const PANEL_HEIGHT = { phone: 104, desktop: 130 };
/** Width to draw at before the container has been measured. */
const FALLBACK_WIDTH = 360;

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * The stacked panels of a Drive Log: one uPlot per panel, all showing `range`, all with the cursor on
 * `cursorRow`. uPlot's own mouse handling is off; our handlers on each overlay turn mouse input into
 * `onCursorRow` and `onRange` and the viewer owns the state.
 */
export function DriveChart(props: {
  t: readonly number[];
  panels: readonly ChartPanelModel[];
  colors: readonly string[];
  /** Counts colour-scheme changes; a new value redraws with the tokens now in force. */
  scheme: number;
  startSec: number;
  desktop: boolean;
  range: Range;
  /** Events to paint behind the series. */
  events: readonly {
    kind: string;
    category: string;
    startSec: number | null;
    endSec: number | null;
  }[];
  cursorRow: number;
  onCursorRow(row: number): void;
  /** A new range to show, or `null` for the whole drive. */
  onRange(range: Range | null): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const charts = useRef<uPlot[]>([]);
  const live = useRef(props);
  live.current = props;

  // Build the panels again when the data, colours or panel height change.
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    host.replaceChildren();
    const { t, panels, colors, startSec, desktop } = props;
    const ink = token("--ink");
    const surface = token("--surface");
    const muted = token("--muted");
    const line = token("--line");
    const font = `10px ${token("--font-mono") || "monospace"}`;
    const width = host.clientWidth || FALLBACK_WIDTH;
    const built = panels.map((panel, i) => {
      const last = i === panels.length - 1;
      const holder = document.createElement("div");
      holder.className = "chart-panel";
      const label = document.createElement("div");
      label.className = "chart-label";
      const tick = document.createElement("i");
      tick.className = "chart-tick";
      tick.style.background = colors[panel.series[0]?.index ?? 0] ?? ink;
      label.append(tick, `${panel.title} (${panel.unit})`);
      holder.append(label);
      host.append(holder);
      const options = panelOptions({
        width,
        height: (desktop ? PANEL_HEIGHT.desktop : PANEL_HEIGHT.phone) + (last ? AXIS_HEIGHT : 0),
        showTimeAxis: last,
        startSec,
        series: panel.series.map((s) => ({ label: s.label, color: colors[s.index] ?? ink })),
        range: props.range,
        ink,
        surface,
        muted,
        line,
        font,
      });
      // Under the series, in every panel; the Events are read at draw time.
      options.hooks = {
        ...options.hooks,
        drawClear: [(u) => drawOverlays(u, live.current.events)],
      };
      return new uPlot(
        options,
        [t as number[], ...panel.series.map((s) => s.values as (number | null)[])],
        holder,
      );
    });
    charts.current = built;
    for (const u of built) {
      attachMouse(u, built, live);
      attachTouch(u, live);
    }
    const resize = () => {
      const w = host.clientWidth;
      if (w > 0) for (const u of built) u.setSize({ width: w, height: u.height });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(host);
    return () => {
      observer?.disconnect();
      for (const u of built) u.destroy();
      charts.current = [];
    };
  }, [props.t, props.panels, props.colors, props.scheme, props.desktop, props.startSec]);

  // Show the range.
  useEffect(() => {
    for (const u of charts.current) u.setScale("x", { min: props.range.min, max: props.range.max });
  }, [props.range.min, props.range.max]);

  // Show the cursor on the cursor row, or hide it when that row is out of view.
  useEffect(() => {
    const { t, cursorRow, range } = props;
    for (const u of charts.current) {
      // Not `u.valToPos`: a chart just built has no x scale until its first commit.
      const width = u.bbox.width / uPlot.pxRatio;
      const left = (((t[cursorRow] ?? 0) - range.min) / (range.max - range.min || 1)) * width;
      u.setCursor({ left: left >= 0 && left <= width ? left : -10, top: 0 }, false);
    }
  });

  return <div class="chart-stack" ref={root} />;
}

/** A drag shorter than this many pixels is a click. */
const BRUSH_MIN = 4;

/**
 * Wire mouse input on a panel's overlay: a move places the cursor, a drag brush-zooms to the dragged
 * range, a click places the cursor, and a double-click shows the whole drive.
 */
function attachMouse(
  u: uPlot,
  all: readonly uPlot[],
  live: { current: Parameters<typeof DriveChart>[0] },
) {
  const over = u.over;
  const timeAt = (clientX: number) => {
    const rect = over.getBoundingClientRect();
    const { min, max } = live.current.range;
    return min + ((clientX - rect.left) / rect.width) * (max - min);
  };
  const placeCursor = (clientX: number) =>
    live.current.onCursorRow(nearestRow(live.current.t, timeAt(clientX)));
  /** Draw (or with no arguments clear) the brush rectangle on every panel. */
  const brush = (x0?: number, x1?: number) => {
    const left = over.getBoundingClientRect().left;
    for (const p of all)
      p.setSelect(
        x0 === undefined || x1 === undefined
          ? { left: 0, top: 0, width: 0, height: 0 }
          : {
              left: Math.min(x0, x1) - left,
              top: 0,
              width: Math.abs(x1 - x0),
              height: p.bbox.height / uPlot.pxRatio,
            },
        false,
      );
  };

  over.addEventListener("mousemove", (e) => {
    if (e.buttons === 0) placeCursor(e.clientX);
  });
  over.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const move = (ev: MouseEvent) => brush(x0, ev.clientX);
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      brush();
      if (Math.abs(ev.clientX - x0) < BRUSH_MIN) return placeCursor(x0);
      const a = timeAt(x0);
      const b = timeAt(ev.clientX);
      live.current.onRange({ min: Math.min(a, b), max: Math.max(a, b) });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
  over.addEventListener("dblclick", () => live.current.onRange(null));
}

/**
 * Wire touch input on a panel's overlay to the gesture tracker (the tested core of our uPlot plugin) and act
 * on its intents. Nothing here decides what a gesture means.
 */
function attachTouch(u: uPlot, live: { current: Parameters<typeof DriveChart>[0] }) {
  const over = u.over;
  const box = () => over.getBoundingClientRect();
  const tracker = createGestureTracker(() => ({
    width: box().width,
    min: live.current.range.min,
    max: live.current.range.max,
  }));
  const local = (touches: TouchList): TouchPoint[] => {
    const { left, top } = box();
    return Array.from(touches, (t) => ({ x: t.clientX - left, y: t.clientY - top }));
  };
  const apply = (intent: Intent, e: TouchEvent) => {
    const { range, t, onCursorRow, onRange } = live.current;
    const timeAt = (x: number) => range.min + (x / box().width) * (range.max - range.min);
    if (intent.type === "tap" || intent.type === "scrub")
      onCursorRow(nearestRow(t, timeAt(intent.x)));
    else if (intent.type === "pinch" || intent.type === "pan")
      onRange({ min: intent.min, max: intent.max });
    // A claimed gesture must not also scroll or zoom the page.
    if (intent.type !== "none" && e.cancelable) e.preventDefault();
  };
  const options = { passive: false };
  over.addEventListener(
    "touchstart",
    (e) => {
      apply(tracker.start(local(e.touches)), e);
      if (e.touches.length > 1 && e.cancelable) e.preventDefault();
    },
    options,
  );
  over.addEventListener("touchmove", (e) => apply(tracker.move(local(e.touches)), e), options);
  over.addEventListener(
    "touchend",
    (e) => {
      apply(tracker.end(local(e.touches)), e);
      // No emulated mouse events after a touch: they would move the cursor a second time.
      if (e.cancelable) e.preventDefault();
    },
    options,
  );
  over.addEventListener("touchcancel", () => tracker.cancel());
  over.addEventListener("contextmenu", (e) => e.preventDefault());
}
