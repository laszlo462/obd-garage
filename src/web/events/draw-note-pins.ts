import type uPlot from "uplot";

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * The uPlot `draw` hook body: a solid 2 px `--note` vertical line through the plot at each pinned Note's time.
 * The pin heads are DOM buttons (see `PinHeads`); this only paints the line, and is checked in the browser,
 * not in unit tests.
 */
export function drawNotePins(u: uPlot, times: readonly number[]) {
  const ratio = window.devicePixelRatio || 1;
  const { left, top, width, height } = u.bbox;
  const ctx = u.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  ctx.strokeStyle = token("--note");
  ctx.lineWidth = 2 * ratio;
  for (const time of times) {
    const x = u.valToPos(time, "x", true);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + height);
    ctx.stroke();
  }
  ctx.restore();
}
