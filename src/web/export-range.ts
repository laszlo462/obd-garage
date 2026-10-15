import type { ExportSummary } from "./api-types.ts";
import { count } from "./format.ts";

/** "1 Drive Log · 0 Reports, +1 Reference Report outside the range". */
export function summaryLine(summary: ExportSummary): string {
  const base = `${count(summary.driveLogs, "Drive Log")} · ${count(summary.reports, "Report")}`;
  return summary.referenceOnly > 0
    ? `${base}, +${count(summary.referenceOnly, "Reference Report")} outside the range`
    : base;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date's local calendar day as YYYY-MM-DD. */
const dayOf = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The Last 30 days preset: the device's local date and the 29 days before it. */
export function lastThirtyDays(today: Date): { from: string; to: string } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  return { from: dayOf(start), to: dayOf(today) };
}
