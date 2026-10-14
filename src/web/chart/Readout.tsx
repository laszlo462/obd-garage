import { clockAt, elapsedAt } from "./clock.ts";
import type { ChartSeries } from "./series.ts";

/**
 * The readout above the chart: the cursor row's time on the left, one fixed slot per charted Channel on the
 * right. Every string has a fixed width (see `channelFormat`), so nothing moves as the cursor does.
 */
export function Readout(props: {
  series: readonly ChartSeries[];
  colors: readonly string[];
  row: number;
  /** Elapsed seconds of the cursor row. */
  elapsed: number;
  /** Seconds past midnight of the log's first moment. */
  startSec: number;
}) {
  const { series, colors, row, elapsed, startSec } = props;
  return (
    <section class="readout" aria-label="Readout">
      <div class="readout-time">
        <span class="readout-clock">{clockAt(startSec, elapsed)}</span>
        <span class="readout-elapsed">{elapsedAt(elapsed)}</span>
        <span class="readout-flag" />
      </div>
      <ul class="readout-slots">
        {series.map((s) => (
          <li key={s.key} class="readout-slot" aria-label={s.label}>
            <i class="readout-dot" style={{ background: colors[s.index] }} />
            <span class="readout-value">{s.format.format(s.values[row] ?? null)}</span>
            <span class="readout-unit">{s.unit}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
