import type { ExportSummary } from "./api-types.ts";
import { count } from "./format.ts";

/** "1 Drive Log · 0 Reports, +1 Reference Report outside the range". */
export function summaryLine(summary: ExportSummary): string {
  const base = `${count(summary.driveLogs, "Drive Log")} · ${count(summary.reports, "Report")}`;
  return summary.referenceOnly > 0
    ? `${base}, +${count(summary.referenceOnly, "Reference Report")} outside the range`
    : base;
}

/** A ticked Drive Log: the id the export posts and the name shown when it drops out. */
export type ExportLog = { id: number; filename: string };

/** Names the logs in `before` that `now` no longer holds, or null when none is gone. */
export function goneNote(before: ExportLog[], now: ExportLog[]): string | null {
  const here = new Set(now.map((l) => l.id));
  const gone = before.filter((l) => !here.has(l.id));
  return gone.length === 0
    ? null
    : `No longer Unassigned (deleted or assigned meanwhile), taken out of the export: ${gone.map((l) => l.filename).join(", ")}`;
}

/**
 * The message a refused export left in the hidden download frame, or null when the frame holds
 * nothing. A refusal is a JSON `{ error }` body. The body is untrusted: read as text only.
 */
export function frameError(doc: Document | null): string | null {
  const text = (doc?.body?.textContent ?? "").trim();
  if (text === "") return null;
  try {
    const error = (JSON.parse(text) as { error?: unknown } | null)?.error;
    if (typeof error === "string") return error;
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return "The export failed.";
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
