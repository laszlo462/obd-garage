import { channel } from "../../core/channels.ts";
import type { EventDraft, Rule, RulePack } from "../../core/rules.ts";
import { P0401_PACK_ID } from "../../profiles/six-seven.ts";

// DOBDSM1202 p. 39: the P0401 low-flow test is entered at 600-2,500 rpm, ECT 70-100 C, EGR valve 40-60 %.
// Thresholds are in the units the source cites. Ported from `windowRuns()` in
// reference/viewers/viewer_template.html and the thresholds in reference/viewers/build_viewer.js.
const RPM = { min: 600, max: 2500 };
const ECT_C = { min: 70, max: 100 };
const VALVE_PCT = { min: 40, max: 60 };

const within = (v: number, r: { min: number; max: number }) => v >= r.min && v <= r.max;

const TEXT =
  "The P0401 low-flow test is entered at 600-2,500 rpm, engine coolant 70-100 °C and an EGR valve " +
  "position of 40-60 % (DOBDSM1202 p. 39). The source does not say which valve scale it means; this " +
  "rule reads the SAE scale, to which the 6.7 Profile rescales the pre-October decode of the actual " +
  "EGR position. On a log with a mixed decode the valve is read as logged, so treat this span with care.";

/**
 * The entry window: one span per run of consecutive samples with rpm, ECT and the actual EGR valve all
 * inside it. A run ends at the first sample outside it, or at the last row of the log. The valve is read
 * as the Profile left it, so a mixed-decode log is tested on its raw values.
 */
export const entryWindow: Rule = {
  id: `${P0401_PACK_ID}.entry-window`,
  needs: ["rpm", "ect", "egrActual"],
  run(log) {
    const rpm = channel(log.channels, "rpm", "rpm");
    const ect = channel(log.channels, "ect", "°C");
    // Not via `needs` alone: called directly, the rule still names what is missing.
    const valve = log.channels.has("egrActual")
      ? channel(log.channels, "egrActual", "%")
      : ({ ok: false, reason: "no Actual EGR A in this log" } as const);
    if (!rpm.ok) return { notApplicable: rpm.reason };
    if (!ect.ok) return { notApplicable: ect.reason };
    if (!valve.ok) return { notApplicable: valve.reason };

    const events: EventDraft[] = [];
    let start: number | null = null;
    const last = log.t.length - 1;
    for (let i = 0; i <= last; i++) {
      const inside =
        within(rpm.values[i] ?? Number.NaN, RPM) &&
        within(ect.values[i] ?? Number.NaN, ECT_C) &&
        within(valve.values[i] ?? Number.NaN, VALVE_PCT);
      if (inside && start === null) start = i;
      if ((!inside || i === last) && start !== null) {
        events.push({
          kind: "span",
          t0: log.t[start] ?? Number.NaN,
          t1: log.t[i] ?? Number.NaN,
          title: "P0401 entry window",
          text: TEXT,
        });
        start = null;
      }
    }
    return events;
  },
};

/** The "6.7 P0401" Rule Pack. Its version is the app version. */
export const P0401_PACK: RulePack = {
  id: P0401_PACK_ID,
  name: "6.7 P0401",
  rules: [entryWindow],
};
