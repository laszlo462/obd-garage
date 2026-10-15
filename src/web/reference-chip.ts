import type { DriveLogDetail } from "./api-types.ts";
import { shortDate } from "./format.ts";

/** The Reference chip's text in the Drive Log viewer's header. */
export function referenceChipText(
  referenceReport: DriveLogDetail["referenceReport"],
  opts: { unassigned: boolean },
): string {
  if (opts.unassigned) return "Assign to a Vehicle…";
  if (referenceReport.id !== null)
    return `Reference: ${shortDate(referenceReport.recordedAt)} report`;
  return "Reference: None";
}
