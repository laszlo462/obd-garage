import { useMemo, useState } from "preact/hooks";
import { channelFormat } from "./channel-format.ts";
import { clockAt } from "./clock.ts";
import type { ChannelData } from "./series.ts";
import { tableWindow } from "./table-window.ts";

/** Rows shown around the cursor: 5 on each side of it. */
const WINDOW = 11;

/**
 * The raw rows around the cursor, collapsed until Show. The cursor row is marked and highlighted. `keys` are the
 * columns after the time, in order; each Channel's values are written with its own fixed format.
 */
export function DataTable(props: {
  t: readonly number[];
  channels: Readonly<Record<string, ChannelData>>;
  keys: readonly string[];
  row: number;
  /** Seconds past midnight of the log's first moment. */
  startSec: number;
}) {
  const [open, setOpen] = useState(false);
  const { t, channels, keys, row, startSec } = props;
  const formats = useMemo(
    () => new Map(Object.entries(channels).map(([key, c]) => [key, channelFormat(c.values)])),
    [channels],
  );
  const { start, end } = tableWindow(row, t.length, WINDOW);
  return (
    <section class="data-table" aria-label="Data table">
      <div class="data-table-head">
        <h3 class="section-label">Data table</h3>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div class="data-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Time</th>
                {keys.map((key) => (
                  <th key={key} scope="col">
                    {channels[key]?.label ?? key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: end - start }, (_, n) => start + n).map((i) => (
                <tr key={i} aria-current={i === row ? "true" : undefined}>
                  <td>{clockAt(startSec, t[i] ?? 0)}</td>
                  {keys.map((key) => (
                    <td key={key}>{formats.get(key)?.format(channels[key]?.values[i] ?? null)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
