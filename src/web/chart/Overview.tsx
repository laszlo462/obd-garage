import { useEffect, useRef } from "preact/hooks";
import uPlot from "uplot";
import type { Range } from "./range.ts";

/** The overview strip's height in CSS pixels (DESIGN.md Drive Log viewer). */
const STRIP_HEIGHT = 34;
const FALLBACK_WIDTH = 360;

/**
 * The whole drive as a muted area, with the zoom window outlined in `--accent`. Touching or dragging on it
 * centres the window there, for coarse moves.
 */
export function Overview(props: {
  t: readonly number[];
  values: readonly (number | null)[];
  /** Counts colour-scheme changes; a new value redraws with the tokens now in force. */
  scheme: number;
  range: Range;
  whole: Range;
  onRange(range: Range): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.querySelector(".u-wrap")?.remove();
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
    const u = new uPlot(
      {
        width: el.clientWidth || FALLBACK_WIDTH,
        height: STRIP_HEIGHT,
        legend: { show: false },
        cursor: { show: false },
        select: { show: false, left: 0, top: 0, width: 0, height: 0 },
        padding: [2, 0, 0, 0],
        scales: { x: { time: false, min: props.whole.min, max: props.whole.max } },
        axes: [{ show: false }, { show: false }],
        series: [{}, { stroke: muted, fill: muted, width: 1, points: { show: false } }],
      },
      [props.t as number[], props.values as (number | null)[]],
      el,
    );
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (el.clientWidth > 0) u.setSize({ width: el.clientWidth, height: STRIP_HEIGHT });
          });
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      u.destroy();
    };
  }, [props.t, props.values, props.scheme, props.whole.min, props.whole.max]);

  // Touching or dragging the strip centres the window there, keeping its width.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const centreAt = (clientX: number) => {
      const { range, whole, onRange } = live.current;
      const box = el.getBoundingClientRect();
      if (box.width <= 0) return;
      const at = whole.min + ((clientX - box.left) / box.width) * (whole.max - whole.min);
      const half = (range.max - range.min) / 2;
      onRange({ min: at - half, max: at + half });
    };
    const down = (e: MouseEvent) => {
      if (e.button !== 0) return;
      centreAt(e.clientX);
      const move = (ev: MouseEvent) => centreAt(ev.clientX);
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    };
    const touch = (e: TouchEvent) => {
      centreAt(e.touches[0]?.clientX ?? 0);
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener("mousedown", down);
    el.addEventListener("touchstart", touch, { passive: false });
    el.addEventListener("touchmove", touch, { passive: false });
    return () => {
      el.removeEventListener("mousedown", down);
      el.removeEventListener("touchstart", touch);
      el.removeEventListener("touchmove", touch);
    };
  }, []);

  const total = props.whole.max - props.whole.min || 1;
  return (
    <div class="chart-overview" ref={host}>
      <div
        class="chart-window"
        role="img"
        aria-label="Zoom window"
        style={{
          left: `${((props.range.min - props.whole.min) / total) * 100}%`,
          width: `${((props.range.max - props.range.min) / total) * 100}%`,
        }}
      />
    </div>
  );
}
