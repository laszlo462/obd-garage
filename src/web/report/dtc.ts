import type { Dtc, MonitorState, MonitorTest } from "../../core/report.ts";

export type BadgeTone = "bad" | "warn" | "ok" | "neutral";

export type Badge = { label: string; tone: BadgeTone };

const isHistorical = (s: string) => /historical/i.test(s);

/** The status chip rules: current, confirmed and permanent are bad (unless historical), pending is warn. */
function statusTone(s: string): BadgeTone {
  if (/current|confirmed|permanent/i.test(s)) return isHistorical(s) ? "neutral" : "bad";
  return /pending/i.test(s) ? "warn" : "neutral";
}

/** A status as shown: Confirmed reads as "Stored", as on the status strip. */
export const statusLabel = (s: string): string => (/^confirmed$/i.test(s) ? "Stored" : s);

/** One badge per status the Report printed. */
export function dtcBadges(d: Dtc): Badge[] {
  return d.statuses.map((s) => ({ label: statusLabel(s), tone: statusTone(s) }));
}

/** The status-change badge text, added first: "+Stored −Pending". */
export function statusChangeText(c: { added: string[]; removed: string[] }): string {
  const added = c.added.map((s) => `+${statusLabel(s)}`);
  const removed = c.removed.map((s) => `−${statusLabel(s)}`);
  return [...added, ...removed].join(" ");
}

/** How many of an ECU's tests are complete, incomplete and not supported. */
export function monitorCounts(tests: MonitorTest[]) {
  const n = (state: MonitorState) => tests.filter((t) => t.state === state).length;
  return { complete: n("complete"), incomplete: n("incomplete"), notSupported: n("na") };
}

/** The code's own colour: bad, warn when only pending, muted when only historical. */
export function dtcCodeTone(d: Dtc): "bad" | "warn" | "muted" {
  const tones = d.statuses.map(statusTone);
  if (tones.includes("bad")) return "bad";
  if (tones.includes("warn")) return "warn";
  return "muted";
}

export function monitorBadge(state: MonitorState): Badge {
  if (state === "complete") return { label: "Complete", tone: "ok" };
  if (state === "incomplete") return { label: "Incomplete", tone: "warn" };
  return { label: "Not supported", tone: "neutral" };
}
