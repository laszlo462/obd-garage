import { describe, expect, it } from "vitest";
import type { MonitorState, ParsedReport } from "../core/report.ts";
import { reportBadges } from "./report-badges.ts";

const test = (state: MonitorState) => ({ name: "x", continuous: false, status: state, state });

describe("reportBadges", () => {
  it("counts every monitor test in the total, not-applicable ones included", () => {
    const parsed = {
      monitors: [
        { ecu: "ECM", tests: [test("complete"), test("incomplete"), test("na")] },
        { ecu: "TCM", tests: [test("na")] },
      ],
    } as ParsedReport;
    expect(reportBadges(parsed)).toMatchObject({ incompleteMonitors: 1, totalMonitors: 4 });
  });
});
