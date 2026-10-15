import uPlot from "uplot";
import { overlayShapes } from "./overlay-shapes.ts";
import { overlayPattern } from "./overlay-style.ts";

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A tile of 45 degree lines in `color`, to fill a Rule Pack span with. */
function hatch(ctx: CanvasRenderingContext2D, color: string, ratio: number): CanvasPattern | null {
  const size = Math.round(6 * ratio);
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const t = tile.getContext("2d");
  if (!t) return null;
  t.strokeStyle = color;
  t.lineWidth = ratio;
  t.beginPath();
  t.moveTo(0, size);
  t.lineTo(size, 0);
  t.stroke();
  return ctx.createPattern(tile, "repeat");
}

/**
 * The uPlot `drawClear` hook body: paint the Events in view under the series. A generic span is a
 * `--ev-generic` fill, a generic point a dashed `--accent` line, a Rule Pack span a `--ev-pack` hatch with a
 * thin outline. The colour tokens are read on every draw, so a scheme change shows at the next one. The
 * geometry is `overlayShapes`; this only paints it, and is checked in the browser, not in unit tests.
 */
export function drawOverlays(
  u: uPlot,
  events: readonly {
    kind: string;
    category: string;
    startSec: number | null;
    endSec: number | null;
  }[],
) {
  const min = u.scales.x?.min;
  const max = u.scales.x?.max;
  if (min === undefined || min === null || max === undefined || max === null) return;
  const ctx = u.ctx;
  const ratio = uPlot.pxRatio;
  const { left, top, width, height } = u.bbox;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  for (const shape of overlayShapes(events, { min, max })) {
    const x0 = u.valToPos(shape.x0, "x", true);
    const x1 = u.valToPos(shape.x1, "x", true);
    const pattern = overlayPattern(shape);
    if (pattern === "dashed-line") {
      ctx.strokeStyle = token("--accent");
      ctx.lineWidth = 1.2 * ratio;
      ctx.setLineDash([4 * ratio, 3 * ratio]);
      ctx.beginPath();
      ctx.moveTo(x0, top);
      ctx.lineTo(x0, top + height);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (pattern === "outline") {
      const color = token("--ev-look");
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = color;
      ctx.fillRect(x0, top, x1 - x0, height);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * ratio;
      ctx.strokeRect(x0, top, x1 - x0, height);
    } else if (pattern === "fill") {
      ctx.fillStyle = token("--ev-generic");
      ctx.fillRect(x0, top, x1 - x0, height);
    } else {
      const color = token("--ev-pack");
      ctx.fillStyle = hatch(ctx, color, ratio) ?? color;
      ctx.fillRect(x0, top, x1 - x0, height);
      ctx.strokeStyle = color;
      ctx.lineWidth = ratio;
      ctx.strokeRect(x0, top, x1 - x0, height);
    }
  }
  ctx.restore();
}
