// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubCanvas } from "./test-canvas.ts";
import { renderApp } from "./test-render.tsx";
import { driveLogDetail, reportRow, type StubData, vehicleRow } from "./test-support.ts";

beforeEach(() => {
  stubCanvas();
  history.replaceState(null, "", "/drive-logs/1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const OCT = reportRow({ id: 2, recordedAt: "2026-10-02T21:32:14" });
const AUG = reportRow({ id: 3, recordedAt: "2026-08-21T21:56:40" });
const data = (over: StubData = {}): StubData => ({
  vehicles: [vehicleRow({ id: 1, label: "2012 Ford F-250" })],
  driveLogDetails: { 1: driveLogDetail() },
  reports: { 1: [OCT, AUG] },
  referenceCalls: [],
  ...over,
});

describe("Reference chip", () => {
  it("names the Report in use, by its date", async () => {
    renderApp(data());
    expect(await screen.findByRole("button", { name: "Reference: 2 Oct report" })).toBeTruthy();
  });
});

const openSheet = async (name = "Reference: 2 Oct report") => {
  fireEvent.click(await screen.findByRole("button", { name }));
  return within(await screen.findByRole("dialog", { name: "Reference Report" }));
};

describe("Reference Report sheet", () => {
  it("lists the Vehicle's Reports newest first as radios, badges the closest, then None", async () => {
    renderApp(data());
    const sheet = await openSheet();
    const radios = await waitFor(() => {
      const found = sheet.getAllByRole("radio");
      if (found.length < 3) throw new Error("reports not loaded");
      return found as HTMLInputElement[];
    });
    expect(radios.map((r) => r.closest("label")?.textContent)).toEqual([
      "FRI 02 OCT · 21:32Closest",
      "FRI 21 AUG · 21:56",
      "None",
    ]);
    expect(radios.map((r) => r.checked)).toEqual([true, false, false]);
    expect(sheet.queryByRole("button", { name: "Use the closest" })).toBeNull();
  });

  it("sets a Report: PUT with its id, then the sheet closes and the chip names it", async () => {
    const stub = data();
    renderApp(stub);
    const sheet = await openSheet();
    fireEvent.click(await sheet.findByRole("radio", { name: /21 AUG/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reference: 21 Aug report" })).toBeTruthy(),
    );
    expect(stub.referenceCalls).toEqual([{ method: "PUT", id: 1, reportId: 3 }]);
    expect(screen.queryByRole("dialog", { name: "Reference Report" })).toBeNull();
  });

  it("sets None: PUT with a null id, and the chip says None", async () => {
    const stub = data();
    renderApp(stub);
    const sheet = await openSheet();
    fireEvent.click(await sheet.findByRole("radio", { name: "None" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reference: None" })).toBeTruthy(),
    );
    expect(stub.referenceCalls).toEqual([{ method: "PUT", id: 1, reportId: null }]);
  });

  it("goes back to the closest Report with DELETE, offered only once the choice is not the default", async () => {
    const stub = data({
      driveLogDetails: {
        1: driveLogDetail({
          referenceReport: {
            id: 3,
            defaultId: 2,
            state: "set",
            recordedAt: "2026-08-21T21:56:40",
            freezeFrame: [],
          },
        }),
      },
    });
    renderApp(stub);
    const sheet = await openSheet("Reference: 21 Aug report");
    fireEvent.click(await sheet.findByRole("button", { name: "Use the closest" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reference: 2 Oct report" })).toBeTruthy(),
    );
    expect(stub.referenceCalls).toEqual([{ method: "DELETE", id: 1 }]);
    const again = await openSheet();
    expect(again.queryByRole("button", { name: "Use the closest" })).toBeNull();
  });

  it.each(["status", "throw"] as const)(
    "keeps the choice and toasts when the server call fails (%s)",
    async (mode) => {
      renderApp(data({ fail: { reference: mode } }));
      const sheet = await openSheet();
      fireEvent.click(await sheet.findByRole("radio", { name: "None" }));
      expect(await screen.findByText("Couldn't change the Reference Report.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Reference: 2 Oct report" })).toBeTruthy();
    },
  );
});

describe("Reference Report sheet: Report list fails to load", () => {
  it.each(["status", "throw"] as const)(
    "says so as a line of text and keeps None usable (%s)",
    async (mode) => {
      const stub = data({ fail: { reports: mode } });
      renderApp(stub);
      const sheet = await openSheet();
      expect(await sheet.findByText("Couldn't load the Reports.")).toBeTruthy();
      fireEvent.click(sheet.getByRole("radio", { name: "None" }));
      await waitFor(() =>
        expect(stub.referenceCalls).toEqual([{ method: "PUT", id: 1, reportId: null }]),
      );
    },
  );
});

const LOOK_TITLE = "Looks like the freeze frame (P0401, 2026-10-02 report)";
const eventsPanel = async () => within(await screen.findByRole("region", { name: "Events" }));
const lookSwitch = async () =>
  (await eventsPanel()).getByRole("switch", { name: "Look-alikes" }) as HTMLInputElement;

describe("Look-alikes switch", () => {
  it("is off at first, and turns the Look-alikes on in the list and the legend, and off again", async () => {
    renderApp(data());
    const toggle = await lookSwitch();
    expect(toggle.checked).toBe(false);
    const panel = await eventsPanel();
    expect(panel.queryByText(LOOK_TITLE)).toBeNull();
    expect(panel.getByRole("heading", { name: /Events/ }).textContent).toBe("Events3");
    expect(screen.queryByText("Look-alike")).toBeNull();

    fireEvent.click(toggle);
    const row = (await eventsPanel()).getByText(LOOK_TITLE);
    expect(row.closest("button")?.querySelector(".event-marker-outline")).toBeTruthy();
    expect((await eventsPanel()).getByRole("heading", { name: /Events/ }).textContent).toBe(
      "Events4",
    );
    expect(screen.getByRole("list", { name: "Legend" }).textContent).toContain("Look-alike");

    fireEvent.click(await lookSwitch());
    await waitFor(() => expect(screen.queryByText(LOOK_TITLE)).toBeNull());
  });

  it("is off again when another Drive Log opens", async () => {
    renderApp(data({ driveLogDetails: { 1: driveLogDetail(), 2: driveLogDetail({ id: 2 }) } }));
    fireEvent.click(await lookSwitch());
    expect((await eventsPanel()).getByText(LOOK_TITLE)).toBeTruthy();
    await act(async () => {
      history.pushState(null, "", "/drive-logs/2");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(async () => expect((await lookSwitch()).checked).toBe(false));
    expect(screen.queryByText(LOOK_TITLE)).toBeNull();
  });
});

describe("Unassigned Drive Log", () => {
  it("offers to assign a Vehicle, has no Look-alikes switch, and says the Look-alikes were skipped", async () => {
    renderApp(
      data({
        driveLogDetails: {
          1: driveLogDetail({
            vehicleId: null,
            referenceReport: {
              id: null,
              defaultId: null,
              state: "default",
              recordedAt: null,
              freezeFrame: [],
            },
            ruleOutcomes: [
              {
                ruleId: "core.look-alike",
                packId: null,
                name: "Look-alikes",
                status: "skipped",
                reason: "no-reference-report",
              },
            ],
            events: [],
          }),
        },
      }),
    );
    expect(await screen.findByRole("button", { name: "Assign to a Vehicle…" })).toBeTruthy();
    const panel = await eventsPanel();
    expect(panel.queryByRole("switch")).toBeNull();
    expect(panel.getByText("Look-alikes: skipped, no Reference Report")).toBeTruthy();
  });
});

describe("Freeze-frame lines", () => {
  const withFrame = (freezeFrame: { key: string; value: number }[]) =>
    data({
      driveLogDetails: {
        1: driveLogDetail({
          referenceReport: {
            id: 2,
            defaultId: 2,
            state: "default",
            recordedAt: "2026-10-02T21:32:14",
            freezeFrame,
          },
        }),
      },
    });
  const legend = async () => (await screen.findByRole("list", { name: "Legend" })).textContent;

  it("adds a Freeze frame swatch to the legend when a charted Channel has a value", async () => {
    renderApp(withFrame([{ key: "rpm", value: 1346 }]));
    expect(await legend()).toContain("Freeze frame");
  });

  it("adds none while the freeze frame has nothing for the charted Channels, and one once such a Channel is charted", async () => {
    // Load is in the log but charted by no panel.
    renderApp(withFrame([{ key: "load", value: 40 }]));
    expect(await legend()).not.toContain("Freeze frame");
    const chips = within(await screen.findByRole("group", { name: "Channels" }));
    fireEvent.click(chips.getByRole("button", { name: "Engine load" }));
    await waitFor(async () => expect(await legend()).toContain("Freeze frame"));
  });
});
