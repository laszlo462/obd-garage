import { channel } from "./channels.ts";
import type { EventDraft, Params, Rule } from "./rules.ts";

/**
 * Generic span rules over how the vehicle is being driven: idle, cruise and DPF regeneration.
 * Thresholds are the defaults from the rule-engine decision, tuned on the fixtures; a Vehicle
 * Profile may override each through `params`. Speeds are in km/h, converted by the unit table.
 */
export const DRIVE_RULE_DEFAULTS = {
  "core.idle": { minRpm: 400, maxSpeedKmh: 2, minDurationS: 30 },
  "core.cruise": {
    minSpeedKmh: 40,
    /** Every sample within this fraction of the span mean. */
    tolerance: 0.05,
    minDurationS: 60,
  },
} as const;

type RuleId = keyof typeof DRIVE_RULE_DEFAULTS;

/**
 * A rule's parameters: `params[ruleId]` is an object of overrides. A non-object entry, or a field of the
 * wrong type, falls back to the default.
 */
function paramsFor<R extends RuleId>(
  params: Params,
  id: R,
): { [K in keyof (typeof DRIVE_RULE_DEFAULTS)[R]]: number } {
  const defaults = DRIVE_RULE_DEFAULTS[id];
  const entry = params[id];
  const own = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const [k, d] of Object.entries(defaults)) {
    const v = own[k];
    out[k] = typeof v === "number" && Number.isFinite(v) ? v : d;
  }
  return out as { [K in keyof (typeof DRIVE_RULE_DEFAULTS)[R]]: number };
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const at = (t: readonly number[], i: number) => t[i] ?? Number.NaN;

/** Index ranges [first, last] of consecutive samples where `test` holds. */
function runs(length: number, test: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= length; i++) {
    const on = i < length && test(i);
    if (on && start < 0) start = i;
    else if (!on && start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  }
  return out;
}

/** Idle: engine running (rpm above the floor) and the vehicle stopped (speed below the ceiling). */
export const idle: Rule = {
  id: "core.idle",
  name: "Idle",
  needs: ["rpm", "speed"],
  run(log, ctx) {
    const rpm = channel(log.channels, "rpm", "rpm");
    if (!rpm.ok) return { notApplicable: rpm.reason };
    const speed = channel(log.channels, "speed", "km/h");
    if (!speed.ok) return { notApplicable: speed.reason };
    const {
      minRpm,
      maxSpeedKmh: maxSpeed,
      minDurationS: minDuration,
    } = paramsFor(ctx.params, "core.idle");
    const events: EventDraft[] = [];
    const stopped = runs(
      log.t.length,
      (i) => (rpm.values[i] ?? Number.NaN) > minRpm && (speed.values[i] ?? Number.NaN) < maxSpeed,
    );
    for (const [a, b] of stopped) {
      const t0 = at(log.t, a);
      const t1 = at(log.t, b);
      if (t1 - t0 < minDuration) continue;
      events.push({
        kind: "span",
        t0,
        t1,
        title: "Idle",
        text: `Engine running above ${fmt(minRpm)} rpm with the vehicle stopped for ${fmt(t1 - t0)} s.`,
      });
    }
    return events;
  },
};

/** Cruise: speed at or above the floor and within a tolerance of the span's own mean. */
export const cruise: Rule = {
  id: "core.cruise",
  name: "Cruise",
  needs: ["speed"],
  run(log, ctx) {
    const speed = channel(log.channels, "speed", "km/h");
    if (!speed.ok) return { notApplicable: speed.reason };
    const {
      minSpeedKmh: floor,
      tolerance: tol,
      minDurationS: minDuration,
    } = paramsFor(ctx.params, "core.cruise");
    const v = speed.values;
    const events: EventDraft[] = [];
    const n = Math.min(v.length, log.t.length);
    let i = 0;
    while (i < n) {
      if (!((v[i] ?? Number.NaN) >= floor)) {
        i++;
        continue;
      }
      // Grow the window while every sample stays within the tolerance of the running mean.
      let sum = 0;
      let lo = Number.POSITIVE_INFINITY;
      let hi = Number.NEGATIVE_INFINITY;
      let end = i - 1;
      for (let j = i; j < n; j++) {
        const x = v[j] ?? Number.NaN;
        if (!(x >= floor)) break;
        const nSum = sum + x;
        const nLo = Math.min(lo, x);
        const nHi = Math.max(hi, x);
        const mean = nSum / (j - i + 1);
        if (nLo < mean * (1 - tol) || nHi > mean * (1 + tol)) break;
        sum = nSum;
        lo = nLo;
        hi = nHi;
        end = j;
      }
      const t0 = at(log.t, i);
      const t1 = at(log.t, end);
      if (end >= i && t1 - t0 >= minDuration) {
        events.push({
          kind: "span",
          t0,
          t1,
          title: "Cruise",
          text: `Steady ${fmt(sum / (end - i + 1))} km/h (within ${fmt(tol * 100)} %) for ${fmt(t1 - t0)} s.`,
        });
        i = end + 1;
      } else {
        i++;
      }
    }
    return events;
  },
};

/** Regen: DPF regeneration status is 1. The status is an enumeration, so its unit does not matter. */
export const regen: Rule = {
  id: "core.regen",
  name: "Regen",
  needs: ["dpfRegen"],
  run(log) {
    const status = log.channels.get("dpfRegen")?.values ?? [];
    return runs(Math.min(status.length, log.t.length), (i) => status[i] === 1).map(([a, b]) => {
      const t0 = at(log.t, a);
      const t1 = at(log.t, b);
      return {
        kind: "span",
        t0,
        t1,
        title: "DPF regeneration",
        text: `DPF regeneration active for ${fmt(t1 - t0)} s.`,
      };
    });
  },
};
