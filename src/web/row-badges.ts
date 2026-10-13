import { count } from "./format.ts";

export type BadgeTone = "neutral" | "accent" | "bad" | "warn" | "ok";
export type Badge = { text: string; tone: BadgeTone };

/** What the badges of an upload row read. The server's Recent rows satisfy it as they are. */
export type BadgeRow =
  | {
      kind: "report";
      noteCount: number;
      mil: "on" | "off" | "unknown";
      storedCodes: string[];
      pendingCodes: string[];
      incompleteMonitors: number;
      totalMonitors: number;
    }
  | { kind: "drive-log"; noteCount: number; eventCount: number; skippedRows: number };

/** Badge text and tone for an upload row, in the kinds and colours of DESIGN.md Lists and badges. */
export function rowBadges(row: BadgeRow): Badge[] {
  const notes: Badge[] = row.noteCount
    ? [{ text: count(row.noteCount, "note"), tone: "accent" }]
    : [];
  if (row.kind === "drive-log") {
    return [
      ...(row.eventCount
        ? [{ text: count(row.eventCount, "event"), tone: "neutral" as const }]
        : []),
      ...notes,
      ...(row.skippedRows
        ? [
            {
              text: `${row.skippedRows} ${row.skippedRows === 1 ? "row" : "rows"} skipped`,
              tone: "warn" as const,
            },
          ]
        : []),
    ];
  }
  const mil: Badge[] =
    row.mil === "on"
      ? [{ text: "MIL ON", tone: "bad" }]
      : row.mil === "off"
        ? [{ text: "MIL OFF", tone: "ok" }]
        : [];
  const monitors: Badge[] = row.incompleteMonitors
    ? [
        {
          text: `${row.incompleteMonitors} monitors incomplete`.replace(/^1 monitors/, "1 monitor"),
          tone: "neutral",
        },
      ]
    : row.totalMonitors
      ? [{ text: "monitors ready", tone: "ok" }]
      : [];
  return [
    ...mil,
    ...row.storedCodes.map((code): Badge => ({ text: code, tone: "bad" })),
    ...row.pendingCodes.map((code): Badge => ({ text: `${code} pending`, tone: "warn" })),
    ...monitors,
    ...notes,
  ];
}
