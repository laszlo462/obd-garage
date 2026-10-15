// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { frameError, goneNote, lastThirtyDays, summaryLine } from "./export-range.ts";
import { exportSummary } from "./test-support.ts";

describe("lastThirtyDays", () => {
  it("runs from the local date and the 29 days before it", () => {
    expect(lastThirtyDays(new Date(2026, 9, 14, 23, 30))).toEqual({
      from: "2026-09-15",
      to: "2026-10-14",
    });
  });

  it("counts whole calendar days across a year end and a month with 31 days", () => {
    expect(lastThirtyDays(new Date(2027, 0, 5, 0, 10))).toEqual({
      from: "2026-12-07",
      to: "2027-01-05",
    });
    expect(lastThirtyDays(new Date(2026, 10, 2, 12))).toEqual({
      from: "2026-10-04",
      to: "2026-11-02",
    });
  });
});

describe("summaryLine", () => {
  it("counts the Drive Logs and Reports, then the Reference Reports outside the range", () => {
    expect(summaryLine(exportSummary({ driveLogs: 1, reports: 0, referenceOnly: 1 }))).toBe(
      "1 Drive Log · 0 Reports, +1 Reference Report outside the range",
    );
    expect(summaryLine(exportSummary({ driveLogs: 12, reports: 2, referenceOnly: 3 }))).toBe(
      "12 Drive Logs · 2 Reports, +3 Reference Reports outside the range",
    );
  });

  it("leaves the plus part out when no Reference Report lies outside the range", () => {
    expect(summaryLine(exportSummary({ driveLogs: 2, reports: 1, referenceOnly: 0 }))).toBe(
      "2 Drive Logs · 1 Report",
    );
  });
});

/** A document as a browser builds it for a JSON answer: the text sits in a <pre> in the body. */
const frameDoc = (body: string) => {
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = "<pre></pre>";
  (doc.body.firstElementChild as Element).textContent = body;
  return doc;
};

describe("goneNote", () => {
  const log = (id: number, filename: string) => ({ id, filename });

  it("names the logs that are in before but no longer in now", () => {
    const before = [log(1, "a.csv"), log(2, "b.csv"), log(3, "c.csv")];
    expect(goneNote(before, [log(2, "b.csv")])).toBe(
      "No longer Unassigned (deleted or assigned meanwhile), taken out of the export: a.csv, c.csv",
    );
  });

  it("gives null when every log in before is still in now", () => {
    expect(goneNote([log(1, "a.csv")], [log(1, "a.csv"), log(2, "b.csv")])).toBeNull();
    expect(goneNote([], [])).toBeNull();
  });
});

describe("frameError", () => {
  it("gives the error text of a JSON body", () => {
    expect(frameError(frameDoc('{"error":"Drive Log 3 not found"}'))).toBe("Drive Log 3 not found");
  });

  it("gives null for no document and for an empty one, the frame's first load", () => {
    expect(frameError(null)).toBeNull();
    expect(frameError(document.implementation.createHTMLDocument(""))).toBeNull();
    expect(frameError(frameDoc("  \n"))).toBeNull();
  });

  it("gives a generic message for any other body", () => {
    expect(frameError(frameDoc("Bad gateway"))).toBe("The export failed.");
    expect(frameError(frameDoc('{"message":"nope"}'))).toBe("The export failed.");
    expect(frameError(frameDoc('{"error":42}'))).toBe("The export failed.");
    expect(frameError(frameDoc("null"))).toBe("The export failed.");
  });
});
