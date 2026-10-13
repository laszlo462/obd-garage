// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { UploadRow } from "./UploadRow.tsx";

afterEach(cleanup);

const log = {
  kind: "drive-log" as const,
  id: 7,
  recordedAt: "2026-10-04T17:22:05",
  durationSec: 2460,
  noteCount: 2,
  eventCount: 3,
  skippedRows: 12,
};
const report = {
  kind: "report" as const,
  id: 9,
  recordedAt: "2026-10-02T21:32:14",
  durationSec: null,
  noteCount: 0,
  mil: "on" as const,
  storedCodes: ["P0401"],
  pendingCodes: [],
  incompleteMonitors: 0,
  totalMonitors: 10,
};

describe("UploadRow", () => {
  it("is one link to the Drive Log viewer, with LOG, the time, the duration and badges", () => {
    render(<UploadRow row={log} />);
    const row = screen.getByRole("link");
    expect(row.getAttribute("href")).toBe("/drive-logs/7");
    expect(row.textContent).toContain("LOG");
    expect(row.textContent).toContain("04 Oct 17:22");
    expect(row.textContent).toContain("41 min");
    for (const text of ["3 events", "2 notes", "12 rows skipped"])
      expect(screen.getByText(text)).toBeTruthy();
  });

  it("is one link to the Report viewer, with REPORT and the MIL state on the right", () => {
    render(<UploadRow row={report} />);
    const row = screen.getByRole("link");
    expect(row.getAttribute("href")).toBe("/reports/9");
    expect(row.textContent).toContain("REPORT");
    expect(row.querySelector(".row-right")?.textContent).toBe("MIL ON");
  });

  it("tints each badge by its tone", () => {
    render(<UploadRow row={log} />);
    expect(screen.getByText("3 events").className).toContain("badge-neutral");
    expect(screen.getByText("2 notes").className).toContain("badge-accent");
    expect(screen.getByText("12 rows skipped").className).toContain("badge-warn");
  });

  it("inserts a hostile filename-like value as text only", () => {
    render(<UploadRow row={{ ...log, recordedAt: "<img src=x onerror=alert(1)>" }} />);
    expect(document.querySelector("img")).toBeNull();
  });
});
