import type uPlot from "uplot";

/**
 * The uPlot `draw` hook body: a dashed 1.2 px horizontal line across the plot at each freeze-frame value, in
 * the series' colour. The geometry is `freezeLines`; this only paints it, and is checked in the browser, not
 * in unit tests.
 */
export function drawFreezeLines(u: uPlot, lines: readonly { value: number; color: string }[]) {
  const ratio = window.devicePixelRatio || 1;
  const { left, top, width, height } = u.bbox;
  const ctx = u.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  ctx.lineWidth = 1.2 * ratio;
  ctx.setLineDash([5 * ratio, 4 * ratio]);
  for (const line of lines) {
    const y = u.valToPos(line.value, "y", true);
    ctx.strokeStyle = line.color;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();
  }
  ctx.restore();
}
