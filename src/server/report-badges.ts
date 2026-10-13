import type { ParsedReport } from "../core/report.ts";
import type { Db } from "./db.ts";

/** What a Report row and the status strip show about one Report. */
export type ReportBadges = {
  mil: "on" | "off" | "unknown";
  storedCodes: string[];
  pendingCodes: string[];
  permanentCodes: string[];
  incompleteMonitors: number;
  /** Every ECU monitor test, "not applicable" ones included (owner's call on #55). */
  totalMonitors: number;
};

const hasStatus = (statuses: string[], word: string) =>
  statuses.some((s) => s.toLowerCase().includes(word));

export function reportBadges(parsed: ParsedReport): ReportBadges {
  const codes = (word: string) => [
    ...new Set((parsed.dtcs ?? []).filter((d) => hasStatus(d.statuses, word)).map((d) => d.code)),
  ];
  const tests = (parsed.monitors ?? []).flatMap((e) => e.tests);
  return {
    mil: parsed.overview?.mil ?? "unknown",
    storedCodes: codes("confirmed"),
    pendingCodes: codes("pending"),
    permanentCodes: codes("permanent"),
    incompleteMonitors: tests.filter((t) => t.state === "incomplete").length,
    totalMonitors: tests.length,
  };
}

const NO_BADGES: ReportBadges = {
  mil: "unknown",
  storedCodes: [],
  pendingCodes: [],
  permanentCodes: [],
  incompleteMonitors: 0,
  totalMonitors: 0,
};

/** The badges of a stored Report, read without the Channels blob or Events. */
export function storedReportBadges(db: Db, uploadId: number): ReportBadges {
  const parsed = db.getParsedReport(uploadId) as ParsedReport | null;
  return parsed ? reportBadges(parsed) : NO_BADGES;
}
