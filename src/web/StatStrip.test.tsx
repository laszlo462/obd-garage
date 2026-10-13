// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { StatStrip } from "./StatStrip.tsx";
import { statusReport } from "./test-support.ts";

afterEach(cleanup);
const TODAY = new Date(2026, 9, 11, 8, 0);

describe("StatStrip", () => {
  const latest = statusReport({
    id: 5,
    mil: "on",
    storedCodes: ["P0401", "P0402"],
    pendingCodes: ["P0401"],
    permanentCodes: ["P0401"],
    incompleteMonitors: 2,
  });
  const previous = statusReport({
    id: 4,
    mil: "on",
    storedCodes: ["P0401"],
    pendingCodes: ["P0401"],
  });

  it("shows four tiles, each with a word or number, its status colour and a change line", () => {
    const { container } = render(<StatStrip status={{ report: latest, previous }} today={TODAY} />);
    const tiles = [...container.querySelectorAll(".stat-tile")];
    expect(tiles.map((t) => t.querySelector(".stat-label")?.textContent)).toEqual([
      "MIL",
      "Stored",
      "Pending",
      "Monitors",
    ]);
    const value = (i: number) => tiles[i]?.querySelector(".stat-value");
    expect([0, 1, 2, 3].map((i) => value(i)?.textContent)).toEqual(["ON", "2", "1", "9/11"]);
    expect(value(0)?.className).toContain("tone-bad");
    expect(value(1)?.className).toContain("tone-bad");
    expect(value(2)?.className).toContain("tone-warn");
    expect(value(3)?.className).toContain("tone-warn");
    const change = (i: number) => tiles[i]?.querySelector(".stat-change");
    expect([0, 1, 2, 3].map((i) => change(i)?.textContent)).toEqual([
      "no change",
      "+1",
      "no change",
      "-2 ready",
    ]);
    expect(change(1)?.className).toContain("tone-warn");
  });

  it("opens the latest Report from the whole panel, with a footer saying how old it is", () => {
    render(<StatStrip status={{ report: latest, previous }} today={TODAY} />);
    const panel = screen.getByRole("link");
    expect(panel.getAttribute("href")).toBe("/reports/5");
    expect(
      within(panel).getByText("Latest report 2 Oct · 9 days ago · P0401 permanent ›"),
    ).toBeTruthy();
  });

  it("leaves permanent codes out of the footer when there are none", () => {
    render(
      <StatStrip status={{ report: statusReport({ id: 5 }), previous: null }} today={TODAY} />,
    );
    expect(screen.getByText("Latest report 2 Oct · 9 days ago ›")).toBeTruthy();
  });

  it("reads No diagnostic report yet, with a hint, when the Vehicle has no Report", () => {
    render(<StatStrip status={{ report: null, previous: null }} today={TODAY} />);
    expect(screen.getByText("No diagnostic report yet")).toBeTruthy();
    expect(screen.getByText(/Add a Diagnostic Report/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
