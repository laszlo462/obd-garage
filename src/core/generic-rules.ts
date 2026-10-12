import { type ChannelKey, channel } from "./channels.ts";
import type { EventDraft, Rule } from "./rules.ts";

/** Rules that run on every Drive Log, Unassigned ones included. */
const START_RPM = 400;

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Engine start: rpm goes from 0 to above 400 inside the log. One point Event; silent otherwise. */
export const engineStart: Rule = {
  id: "core.engine-start",
  needs: ["rpm"],
  run(log) {
    const rpm = channel(log.channels, "rpm", "rpm");
    if (!rpm.ok) return { notApplicable: rpm.reason };
    let sawZero = false;
    for (const [i, v] of rpm.values.entries()) {
      if (v === 0) sawZero = true;
      else if (sawZero && v > START_RPM) {
        const t = log.t[i] ?? Number.NaN;
        return [
          {
            kind: "point",
            t0: t,
            t1: t,
            title: "Engine start",
            text: `Engine RPM rose from 0 to ${fmt(v)} rpm.`,
          },
        ];
      }
    }
    return [];
  },
};

const PEAK_CHANNELS: readonly { key: ChannelKey; unit: string; title: string; label: string }[] = [
  { key: "rpm", unit: "rpm", title: "Peak engine speed", label: "Engine RPM" },
  { key: "speed", unit: "km/h", title: "Peak vehicle speed", label: "Vehicle speed" },
  {
    key: "ect",
    unit: "°C",
    title: "Peak coolant temperature",
    label: "Engine coolant temperature",
  },
];

/**
 * Peaks: one point Event at the maximum of rpm, speed and ECT, and of nothing else. Runs for whichever of
 * the three are logged with a convertible unit; not applicable when none is. The first sample wins a tie.
 */
export const peaks: Rule = {
  id: "core.peaks",
  needs: [],
  needsAny: PEAK_CHANNELS.map((c) => c.key),
  run(log) {
    const events: EventDraft[] = [];
    const problems: string[] = [];
    for (const c of PEAK_CHANNELS) {
      const col = channel(log.channels, c.key, c.unit);
      if (!col.ok) {
        problems.push(col.reason);
        continue;
      }
      let best = -1;
      for (const [i, v] of col.values.entries()) {
        if (
          Number.isFinite(v) &&
          (best < 0 || v > (col.values[best] ?? Number.NEGATIVE_INFINITY))
        ) {
          best = i;
        }
      }
      if (best < 0) continue;
      const t = log.t[best] ?? Number.NaN;
      events.push({
        kind: "point",
        t0: t,
        t1: t,
        title: c.title,
        text: `${c.label} peaked at ${fmt(col.values[best] ?? Number.NaN)} ${c.unit}.`,
      });
    }
    const usable = PEAK_CHANNELS.length - problems.length;
    if (usable === 0) return { notApplicable: problems.join("; ") };
    return events;
  },
};

/** The generic Rules, in the order they run. */
export const GENERIC_RULES: readonly Rule[] = [engineStart, peaks];
