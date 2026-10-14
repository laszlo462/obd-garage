const START = /T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/;

/** Seconds since midnight of a naive local start time, read as text so no time zone applies. 0 without one. */
export function startSecondOfDay(startTime: string): number {
  const m = START.exec(startTime);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

const two = (n: number) => String(n).padStart(2, "0");

/** "17:44:36" (or "17:44") for `elapsed` seconds after a log that started at `startSec` seconds past midnight. */
export function clockAt(startSec: number, elapsed: number, withSeconds = true): string {
  const day = ((Math.floor(startSec + elapsed) % 86400) + 86400) % 86400;
  const h = Math.floor(day / 3600);
  const m = Math.floor((day % 3600) / 60);
  return withSeconds ? `${two(h)}:${two(m)}:${two(day % 60)}` : `${two(h)}:${two(m)}`;
}

/**
 * Axis labels for ticks at `splits` seconds into the log: wall-clock times, with seconds on spans under 5
 * minutes. A tick whose label repeats the one before it (a span too short for distinct times) is left blank.
 */
export function tickLabels(startSec: number, splits: readonly number[], span: number): string[] {
  let previous = "";
  return splits.map((v) => {
    const label = clockAt(startSec, v, span < 300);
    const shown = label === previous ? "" : label;
    previous = label;
    return shown;
  });
}

/** "+22:32", or "+1:05:09" past an hour. */
export function elapsedAt(elapsed: number): string {
  const whole = Math.max(0, Math.floor(elapsed));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h > 0 ? `+${h}:${two(m)}:${two(s)}` : `+${m}:${two(s)}`;
}
