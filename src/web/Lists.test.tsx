// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppState } from "./AppState.tsx";
import { DriveLogs } from "./DriveLogs.tsx";
import { renderApp, renderWithApp } from "./test-render.tsx";
import { driveLogRow, reportRow, vehicleRow } from "./test-support.ts";

afterEach(cleanup);

const vehicles = [vehicleRow({ id: 4, label: "Truck" }), vehicleRow({ id: 9, label: "Civic" })];

describe("Reports", () => {
  beforeEach(() => history.replaceState(null, "", "/reports"));

  it("lists the Current Vehicle's Reports as rows that open the Report viewer", async () => {
    renderApp({
      vehicles,
      reports: {
        4: [
          reportRow({
            id: 2,
            mil: "on",
            storedCodes: ["P0401"],
            recordedAt: "2026-10-02T21:32:14",
          }),
          reportRow({ id: 1, recordedAt: "2026-08-21T21:57:10" }),
        ],
      },
    });
    const links = await screen.findAllByRole("link", { name: /REPORT/ });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/reports/2", "/reports/1"]);
    expect(within(links[0] as HTMLElement).getAllByText("MIL ON")).toHaveLength(2);
    expect(within(links[0] as HTMLElement).getByText("P0401")).toBeTruthy();
    expect(within(links[1] as HTMLElement).getByText("21 Aug 21:57")).toBeTruthy();
  });

  it("says so when the Vehicle has no Reports", async () => {
    renderApp({ vehicles });
    expect(await screen.findByText("No reports yet.")).toBeTruthy();
  });
});

describe("Drive Logs", () => {
  beforeEach(() => history.replaceState(null, "", "/drive-logs"));

  it("groups rows under the month they were recorded, as written", async () => {
    renderApp({
      vehicles,
      driveLogs: {
        4: [
          driveLogRow({ id: 3, recordedAt: "2026-11-01T00:00:01" }),
          driveLogRow({ id: 2, recordedAt: "2026-10-31T23:59:59" }),
          driveLogRow({ id: 1, recordedAt: "2026-10-02T17:58:45" }),
        ],
      },
    });
    const labels = await screen.findAllByRole("heading", { level: 2 });
    expect(labels.map((h) => h.textContent)).toEqual([
      "November 2026 · 1 drive log",
      "October 2026 · 2 drive logs",
    ]);
    const oct = labels[1]?.parentElement as HTMLElement;
    expect(
      within(oct)
        .getAllByRole("link")
        .map((l) => l.getAttribute("href")),
    ).toEqual(["/drive-logs/2", "/drive-logs/1"]);
  });

  it("shows the Event, Note and skipped-row badges and the duration", async () => {
    renderApp({
      vehicles,
      driveLogs: { 4: [driveLogRow({ eventCount: 3, noteCount: 1, skippedRows: 12 })] },
    });
    const row = await screen.findByRole("link", { name: /LOG/ });
    for (const text of ["3 events", "1 note", "12 rows skipped", "41 min"])
      expect(within(row).getByText(text)).toBeTruthy();
  });

  it("says so when the Vehicle has no Drive Logs", async () => {
    renderApp({ vehicles });
    expect(await screen.findByText("No drive logs yet.")).toBeTruthy();
  });
});

describe("changing the Current Vehicle", () => {
  it.each([
    ["/reports", "21 Aug 21:57", "05 Jan 05:05"],
    ["/drive-logs", "02 Oct 17:58", "04 Sep 09:09"],
  ])("refreshes %s", async (path, truck, civic) => {
    history.replaceState(null, "", path);
    renderApp({
      vehicles,
      reports: {
        4: [reportRow({ id: 1, recordedAt: "2026-08-21T21:57:10" })],
        9: [reportRow({ id: 5, recordedAt: "2026-01-05T05:05:05" })],
      },
      driveLogs: {
        4: [driveLogRow({ id: 1, recordedAt: "2026-10-02T17:58:45" })],
        9: [driveLogRow({ id: 5, recordedAt: "2026-09-04T09:09:09" })],
      },
    });
    await screen.findByText(truck);
    fireEvent.click(screen.getByRole("button", { name: /Truck/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("radio", { name: /Civic/ }));
    expect(await screen.findByText(civic)).toBeTruthy();
    expect(screen.queryByText(truck)).toBeNull();
  });
});

describe("invalidate", () => {
  it("reloads the list on screen", async () => {
    history.replaceState(null, "", "/drive-logs");
    const data = {
      vehicles,
      driveLogs: { 4: [driveLogRow({ id: 1, recordedAt: "2026-10-02T17:58:45" })] },
    };
    const Bump = () => {
      const state = useAppState();
      return (
        <button type="button" onClick={() => state.invalidate()}>
          bump
        </button>
      );
    };
    renderWithApp(
      <>
        <Bump />
        <DriveLogs />
      </>,
      data,
    );
    await screen.findByText("02 Oct 17:58");
    data.driveLogs[4].push(driveLogRow({ id: 2, recordedAt: "2026-10-03T08:00:00" }));
    fireEvent.click(screen.getByRole("button", { name: "bump" }));
    expect(await screen.findByText("03 Oct 08:00")).toBeTruthy();
  });
});

describe("viewer routes", () => {
  it("/drive-logs/12 is a placeholder until the Drive Log viewer lands", async () => {
    history.replaceState(null, "", "/drive-logs/12");
    renderApp({ vehicles });
    expect(await screen.findByText("Drive Log viewer")).toBeTruthy();
  });
});
