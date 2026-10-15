// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportSheet } from "./ExportSheet.tsx";
import { renderWithApp } from "./test-render.tsx";
import { exportSummary, type StubData, vehicleRow } from "./test-support.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const vehicles = [vehicleRow({ id: 4, label: "2012 Ford F-250", vin: "TEST-VIN-00001234" })];
const data = (over: StubData = {}): StubData => ({ vehicles, ...over });

/** The download link; it has no `href` and no link role while it is disabled. */
const download = () => screen.getByText(/^(Download \.zip|Nothing in this range)$/);
const isDisabled = (el: HTMLElement) =>
  !el.hasAttribute("href") && el.getAttribute("aria-disabled") === "true";

describe("ExportSheet: Vehicle scope", () => {
  it("opens on All time with the summary, the VIN line and a download link for the whole span", async () => {
    renderWithApp(
      <ExportSheet scope={{ kind: "vehicle", vehicleId: 4 }} onClose={() => {}} />,
      data({
        exportSummary: exportSummary({
          driveLogs: 1,
          reports: 0,
          referenceOnly: 1,
          firstDay: "2026-08-21",
          lastDay: "2026-10-02",
        }),
      }),
    );
    expect(
      await screen.findByText("1 Drive Log · 0 Reports, +1 Reference Report outside the range"),
    ).toBeTruthy();
    expect(
      await screen.findByText("This Bundle contains the VIN (TEST-VIN-00001234)."),
    ).toBeTruthy();
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-08-21");
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-10-02");
    const link = download();
    expect(link.getAttribute("href")).toBe("/api/export?vehicle=4&from=2026-08-21&to=2026-10-02");
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("opens on This day when given a day, and asks the summary for that day only", async () => {
    const summaryCalls: NonNullable<StubData["summaryCalls"]> = [];
    renderWithApp(
      <ExportSheet
        scope={{ kind: "vehicle", vehicleId: 4, day: "2026-10-02" }}
        onClose={() => {}}
      />,
      data({ summaryCalls }),
    );
    await screen.findByText("1 Drive Log · 0 Reports");
    expect(summaryCalls).toEqual([{ vehicle: "4", from: "2026-10-02", to: "2026-10-02" }]);
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-10-02");
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-10-02");
    expect(screen.getByRole("button", { name: "This day" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(download().getAttribute("href")).toBe(
      "/api/export?vehicle=4&from=2026-10-02&to=2026-10-02",
    );
  });

  it("sets the range to the device's last 30 days with Last 30 days, and reloads the summary", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 14, 23, 30));
    const summaryCalls: NonNullable<StubData["summaryCalls"]> = [];
    renderWithApp(
      <ExportSheet scope={{ kind: "vehicle", vehicleId: 4 }} onClose={() => {}} />,
      data({ summaryCalls }),
    );
    await screen.findByText("1 Drive Log · 0 Reports");
    fireEvent.click(screen.getByRole("button", { name: "Last 30 days" }));

    await waitFor(() =>
      expect(summaryCalls.at(-1)).toEqual({ vehicle: "4", from: "2026-09-15", to: "2026-10-14" }),
    );
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-09-15");
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-10-14");
    expect(screen.getByRole("button", { name: "Last 30 days" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await waitFor(() =>
      expect(download().getAttribute("href")).toBe(
        "/api/export?vehicle=4&from=2026-09-15&to=2026-10-14",
      ),
    );
  });

  it("takes a typed From or To date as a custom range and reloads the summary", async () => {
    const summaryCalls: NonNullable<StubData["summaryCalls"]> = [];
    renderWithApp(
      <ExportSheet
        scope={{ kind: "vehicle", vehicleId: 4, day: "2026-10-02" }}
        onClose={() => {}}
      />,
      data({ summaryCalls }),
    );
    await screen.findByText("1 Drive Log · 0 Reports");
    fireEvent.input(screen.getByLabelText("To"), { target: { value: "2026-10-09" } });

    await waitFor(() =>
      expect(summaryCalls.at(-1)).toEqual({ vehicle: "4", from: "2026-10-02", to: "2026-10-09" }),
    );
    for (const name of ["This day", "Last 30 days", "All time"])
      expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-10-09");
    await waitFor(() =>
      expect(download().getAttribute("href")).toBe(
        "/api/export?vehicle=4&from=2026-10-02&to=2026-10-09",
      ),
    );
  });

  it("disables the download while the summary loads", async () => {
    let answer: (s: ReturnType<typeof exportSummary>) => void = () => {};
    const pending = new Promise<ReturnType<typeof exportSummary>>((resolve) => {
      answer = resolve;
    });
    renderWithApp(
      <ExportSheet
        scope={{ kind: "vehicle", vehicleId: 4, day: "2026-10-02" }}
        onClose={() => {}}
      />,
      data({ exportSummary: () => pending }),
    );
    await screen.findByText("Download .zip");
    expect(isDisabled(download())).toBe(true);

    answer(exportSummary());
    await waitFor(() => expect(isDisabled(download())).toBe(false));
  });

  it("ignores an older summary that arrives after a newer range was answered", async () => {
    let late: (s: ReturnType<typeof exportSummary>) => void = () => {};
    const slow = new Promise<ReturnType<typeof exportSummary>>((resolve) => {
      late = resolve;
    });
    renderWithApp(
      <ExportSheet
        scope={{ kind: "vehicle", vehicleId: 4, day: "2026-10-02" }}
        onClose={() => {}}
      />,
      data({
        exportSummary: ({ from }) =>
          from === "2026-10-02" ? slow : exportSummary({ driveLogs: 5, reports: 2 }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
    await screen.findByText("5 Drive Logs · 2 Reports");

    late(exportSummary({ driveLogs: 9, reports: 9 }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText("5 Drive Logs · 2 Reports")).toBeTruthy();
    expect(screen.queryByText(/9 Drive Logs/)).toBeNull();
    expect(isDisabled(download())).toBe(false);
  });

  it("disables the download without asking the server when From is after To", async () => {
    const summaryCalls: NonNullable<StubData["summaryCalls"]> = [];
    renderWithApp(
      <ExportSheet
        scope={{ kind: "vehicle", vehicleId: 4, day: "2026-10-02" }}
        onClose={() => {}}
      />,
      data({ summaryCalls }),
    );
    await screen.findByText("1 Drive Log · 0 Reports");
    fireEvent.input(screen.getByLabelText("From"), { target: { value: "2026-10-05" } });

    await waitFor(() => expect(isDisabled(download())).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(summaryCalls).toHaveLength(1);

    fireEvent.input(screen.getByLabelText("From"), { target: { value: "" } });
    await waitFor(() => expect(isDisabled(download())).toBe(true));
    expect(summaryCalls).toHaveLength(1);
  });

  it("disables the download and reads 'Nothing in this range' when every count is 0", async () => {
    renderWithApp(
      <ExportSheet
        scope={{ kind: "vehicle", vehicleId: 4, day: "2026-10-02" }}
        onClose={() => {}}
      />,
      data({ exportSummary: exportSummary({ driveLogs: 0, reports: 0, referenceOnly: 0 }) }),
    );
    expect(await screen.findByText("Nothing in this range")).toBeTruthy();
    expect(isDisabled(download())).toBe(true);
    expect(screen.queryByText("Download .zip")).toBeNull();
  });

  it("names the Originals missing on disk in --bad and disables the download", async () => {
    renderWithApp(
      <ExportSheet
        scope={{ kind: "vehicle", vehicleId: 4, day: "2026-10-02" }}
        onClose={() => {}}
      />,
      data({ exportSummary: exportSummary({ missing: ["log.csv", "aug.html"] }) }),
    );
    const message = await screen.findByText("An Original is missing on disk: log.csv, aug.html");
    expect(message.classList.contains("tone-bad")).toBe(true);
    expect(isDisabled(download())).toBe(true);
  });

  it("says the summary could not load, in --bad, and disables the download", async () => {
    const fail: StubData["fail"] = { exportSummary: "status" };
    renderWithApp(
      <ExportSheet
        scope={{ kind: "vehicle", vehicleId: 4, day: "2026-10-02" }}
        onClose={() => {}}
      />,
      data({ fail }),
    );
    const message = await screen.findByText("Couldn't load the summary.");
    expect(message.classList.contains("tone-bad")).toBe(true);
    expect(isDisabled(download())).toBe(true);
  });

  it("shows the same failure when the request itself throws", async () => {
    renderWithApp(
      <ExportSheet
        scope={{ kind: "vehicle", vehicleId: 4, day: "2026-10-02" }}
        onClose={() => {}}
      />,
      data({ fail: { exportSummary: "throw" } }),
    );
    expect(await screen.findByText("Couldn't load the summary.")).toBeTruthy();
  });

  it("moves between This day, Last 30 days and All time, asking the summary for each range", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 14, 12));
    const summaryCalls: NonNullable<StubData["summaryCalls"]> = [];
    renderWithApp(
      <ExportSheet
        scope={{ kind: "vehicle", vehicleId: 4, day: "2026-10-02" }}
        onClose={() => {}}
      />,
      data({
        summaryCalls,
        exportSummary: exportSummary({ firstDay: "2026-08-21", lastDay: "2026-10-02" }),
      }),
    );
    await screen.findByText("1 Drive Log · 0 Reports");
    const range = () => [
      (screen.getByLabelText("From") as HTMLInputElement).value,
      (screen.getByLabelText("To") as HTMLInputElement).value,
    ];

    fireEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
    await waitFor(() => expect(range()).toEqual(["2026-09-15", "2026-10-14"]));

    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    await waitFor(() => expect(range()).toEqual(["2026-08-21", "2026-10-02"]));
    expect(summaryCalls.at(-1)).toEqual({ vehicle: "4", from: "0001-01-01", to: "9999-12-31" });

    fireEvent.click(screen.getByRole("button", { name: "This day" }));
    await waitFor(() => expect(range()).toEqual(["2026-10-02", "2026-10-02"]));
    expect(summaryCalls.at(-1)).toEqual({ vehicle: "4", from: "2026-10-02", to: "2026-10-02" });
  });

  it("offers no This day preset without a day", async () => {
    renderWithApp(
      <ExportSheet scope={{ kind: "vehicle", vehicleId: 4 }} onClose={() => {}} />,
      data(),
    );
    await screen.findByText("1 Drive Log · 0 Reports");
    expect(screen.queryByRole("button", { name: "This day" })).toBeNull();
    expect(screen.getByRole("button", { name: "All time" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("ExportSheet: Unassigned scope", () => {
  const unassigned = (logIds: number[]) => (
    <ExportSheet scope={{ kind: "unassigned", logIds }} onClose={() => {}} />
  );

  it("counts the selection in the title and has no dates, presets or VIN line", async () => {
    const summaryCalls: NonNullable<StubData["summaryCalls"]> = [];
    renderWithApp(unassigned([3, 5, 8]), data({ summaryCalls }));
    expect(screen.getByRole("dialog", { name: "Export 3 Drive Logs" })).toBeTruthy();
    expect(screen.queryByLabelText("From")).toBeNull();
    expect(screen.queryByLabelText("To")).toBeNull();
    expect(screen.queryByRole("button", { name: "All time" })).toBeNull();
    expect(screen.queryByText(/contains the VIN/)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(summaryCalls).toEqual([]);
  });

  it("counts one Drive Log in the singular", () => {
    renderWithApp(unassigned([3]), data());
    expect(screen.getByRole("dialog", { name: "Export 1 Drive Log" })).toBeTruthy();
  });

  it("downloads by submitting a form that posts one logIds field per id", () => {
    renderWithApp(unassigned([3, 5]), data());
    const button = screen.getByRole("button", { name: "Download .zip" });
    const form = button.closest("form") as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/api/export/unassigned");
    const fields = [...form.querySelectorAll<HTMLInputElement>('input[name="logIds"]')];
    expect(fields.map((f) => [f.type, f.value])).toEqual([
      ["hidden", "3"],
      ["hidden", "5"],
    ]);
    expect(button.getAttribute("type")).toBe("submit");
  });
});
