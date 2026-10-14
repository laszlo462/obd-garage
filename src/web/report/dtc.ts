import type { Dtc, MonitorState } from "../../core/report.ts";

export type BadgeTone = "bad" | "warn" | "ok" | "neutral";

export type Badge = { label: string; tone: BadgeTone };

const isHistorical = (s: string) => /historical/i.test(s);

/** The status chip rules: current, confirmed and permanent are bad (unless historical), pending is warn. */
function statusTone(s: string): BadgeTone {
  if (/current|confirmed|permanent/i.test(s)) return isHistorical(s) ? "neutral" : "bad";
  return /pending/i.test(s) ? "warn" : "neutral";
}

/** One badge per status the Report printed. Confirmed reads as "Stored", as on the status strip. */
export function dtcBadges(d: Dtc): Badge[] {
  return d.statuses.map((s) => ({
    label: /^confirmed$/i.test(s) ? "Stored" : s,
    tone: statusTone(s),
  }));
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
