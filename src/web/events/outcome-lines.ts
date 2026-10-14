import type { DriveLogDetail } from "../api-types.ts";

type Outcome = DriveLogDetail["ruleOutcomes"][number];

const line = (o: Outcome): string[] => {
  const name = o.packName ? `${o.packName}: ${o.name}` : o.name;
  if (o.status === "not-applicable") {
    // The server sends a display label for each missing Channel; the key is only a fallback.
    const missing = (o.missingLabels ?? o.missing).join(", ");
    return [`${name}: not applicable, ${o.reason ?? `no ${missing} in this log`}`];
  }
  if (o.status === "skipped") return [`${name}: skipped, no Reference Report`];
  return [];
};

/** The muted lines that end the Events list: one for every rule that did not run. */
export function outcomeLines(
  outcomes: readonly Outcome[],
  opts: { unassigned: boolean },
): string[] {
  const lines = outcomes.flatMap(line);
  // The server runs no packs on an Unassigned log, so it has no pack outcome to name.
  if (opts.unassigned) lines.push("Rule Packs: not run, Unassigned logs get no Rule Packs");
  return lines;
}
