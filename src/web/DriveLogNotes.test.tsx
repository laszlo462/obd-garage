// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubCanvas } from "./test-canvas.ts";
import { renderApp } from "./test-render.tsx";
import { driveLogDetail, noteRow, type StubData, vehicleRow } from "./test-support.ts";

beforeEach(() => {
  stubCanvas();
  history.replaceState(null, "", "/drive-logs/1");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const data = (over: StubData = {}): StubData => ({
  vehicles: [vehicleRow({ id: 1 })],
  driveLogDetails: { 1: driveLogDetail() },
  notes: {},
  ...over,
});

/** The Drive Log viewer's Notes panel (whole-drive Notes). */
const notesPanel = async () => within(await screen.findByRole("region", { name: "Notes" }));

const noteBar = async () => within(await screen.findByRole("toolbar", { name: "Note bar" }));

describe("Drive Log viewer: Note bar", () => {
  it("steps the cursor one row with the steppers (a click), and stops at the first and last row", async () => {
    renderApp(data());
    const bar = await noteBar();
    expect(bar.getByRole("button", { name: /Note here 17:58:45/ })).toBeTruthy();
    fireEvent.click(bar.getByRole("button", { name: "Next row" }));
    expect(bar.getByRole("button", { name: /Note here 17:58:55/ })).toBeTruthy();
    fireEvent.click(bar.getByRole("button", { name: "Previous row" }));
    fireEvent.click(bar.getByRole("button", { name: "Previous row" }));
    expect(bar.getByRole("button", { name: /Note here 17:58:45/ })).toBeTruthy();
    for (let i = 0; i < 12; i++) fireEvent.click(bar.getByRole("button", { name: "Next row" }));
    expect(bar.getByRole("button", { name: /Note here 18:00:25/ })).toBeTruthy();
  });
});

describe("Drive Log viewer: holding a stepper", () => {
  it("steps once on press, again after 420 ms, then every 70 ms, and stops on release", async () => {
    renderApp(data());
    const bar = await noteBar();
    const next = bar.getByRole("button", { name: "Next row" });
    const at = (clock: string) => bar.getByRole("button", { name: `Note here ${clock}` });
    vi.useFakeTimers();
    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    fireEvent.pointerDown(next);
    await advance(0);
    expect(at("17:58:55")).toBeTruthy();
    await advance(419);
    expect(at("17:58:55")).toBeTruthy();
    await advance(1);
    expect(at("17:59:05")).toBeTruthy();
    await advance(70);
    expect(at("17:59:15")).toBeTruthy();
    fireEvent.pointerUp(next);
    // The click that follows a pointer press is not a second step.
    fireEvent.click(next, { detail: 1 });
    await advance(1000);
    expect(at("17:59:15")).toBeTruthy();
  });

  it("stops when the pointer leaves or is cancelled", async () => {
    renderApp(data());
    const bar = await noteBar();
    const next = bar.getByRole("button", { name: "Next row" });
    vi.useFakeTimers();
    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    for (const stop of [fireEvent.pointerLeave, fireEvent.pointerCancel]) {
      const start = bar.getByRole("button", { name: /Note here/ }).textContent;
      fireEvent.pointerDown(next);
      await advance(0);
      const pressed = bar.getByRole("button", { name: /Note here/ }).textContent;
      expect(pressed).not.toBe(start);
      stop(next);
      await advance(1000);
      expect(bar.getByRole("button", { name: /Note here/ }).textContent).toBe(pressed);
    }
  });
});

describe("Drive Log viewer: pinning a Note", () => {
  it("opens the Note sheet at the cursor row and pins the Note to that row's Time (sec)", async () => {
    const noteCalls: NonNullable<StubData["noteCalls"]> = [];
    renderApp(data({ noteCalls }));
    const bar = await noteBar();
    fireEvent.click(bar.getByRole("button", { name: "Next row" }));
    fireEvent.click(bar.getByRole("button", { name: "Next row" }));
    fireEvent.click(bar.getByRole("button", { name: /Note here/ }));
    const sheet = within(await screen.findByRole("dialog", { name: "Note at 17:59:05" }));
    fireEvent.input(sheet.getByRole("textbox"), { target: { value: "Surge at 20 s" } });
    fireEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(noteCalls.filter((c) => c.method === "POST")).toEqual([
      { method: "POST", uploadId: 1, text: "Surge at 20 s", pinnedAt: 20 },
    ]);
  });
});

describe("Drive Log viewer: a pinned Note after a reload", () => {
  const pinned = noteRow({
    id: 5,
    text: "Surge here",
    pinnedTimeSec: 21,
    snappedTimeSec: 20,
  });

  it("shows Open Note exactly when the cursor sits on the pinned row, and opens Note view", async () => {
    renderApp(data({ notes: { 1: [pinned] } }));
    const bar = await noteBar();
    const next = () => fireEvent.click(bar.getByRole("button", { name: "Next row" }));
    await waitFor(() => expect(bar.getByRole("button", { name: /Note here/ })).toBeTruthy());
    next();
    expect(bar.queryByRole("button", { name: /Open Note/ })).toBeNull();
    next();
    await bar.findByRole("button", { name: "Open Note 17:59:05" });
    expect(bar.queryByRole("button", { name: /Note here/ })).toBeNull();
    next();
    expect(bar.queryByRole("button", { name: /Open Note/ })).toBeNull();
    fireEvent.click(bar.getByRole("button", { name: "Previous row" }));
    fireEvent.click(await bar.findByRole("button", { name: "Open Note 17:59:05" }));
    const view = within(await screen.findByRole("dialog", { name: "Note" }));
    expect(view.getByText("Surge here")).toBeTruthy();
  });
});

describe("Drive Log viewer: changing a pinned Note", () => {
  const pinned = noteRow({ id: 5, text: "Surge here", pinnedTimeSec: 20, snappedTimeSec: 20 });
  const openIt = async (extra: StubData = {}) => {
    renderApp(data({ notes: { 1: [pinned] }, ...extra }));
    const bar = await noteBar();
    fireEvent.click(bar.getByRole("button", { name: "Next row" }));
    fireEvent.click(bar.getByRole("button", { name: "Next row" }));
    fireEvent.click(await bar.findByRole("button", { name: /Open Note/ }));
    return within(await screen.findByRole("dialog", { name: "Note" }));
  };

  it("shows the time of the row in Note view and titles the edit sheet with it", async () => {
    const noteCalls: NonNullable<StubData["noteCalls"]> = [];
    const view = await openIt({ noteCalls });
    expect(view.getByText("At 17:59:05")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Edit" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Note at 17:59:05" }));
    fireEvent.input(sheet.getByRole("textbox"), { target: { value: "Surge, fixed" } });
    fireEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(noteCalls.filter((c) => c.method === "PATCH")).toEqual([
      { method: "PATCH", id: 5, text: "Surge, fixed" },
    ]);
  });

  it("deletes a pinned Note, and the bar goes back to Note here", async () => {
    const view = await openIt();
    fireEvent.click(view.getByRole("button", { name: "Delete" }));
    const confirm = within(await screen.findByRole("dialog", { name: "Delete this Note?" }));
    fireEvent.click(confirm.getByRole("button", { name: "Delete" }));
    const bar = await noteBar();
    await bar.findByRole("button", { name: "Note here 17:59:05" });
  });
});

describe("Drive Log viewer: pinned Notes in the Events list", () => {
  it("merges a pin row among the Events by time; a tap snaps the cursor and opens Note view", async () => {
    renderApp(
      data({
        notes: {
          1: [noteRow({ id: 5, text: "Surge here", pinnedTimeSec: 30, snappedTimeSec: 30 })],
        },
      }),
    );
    const events = within(await screen.findByRole("region", { name: "Events" }));
    const pin = await events.findByRole("button", { name: /Surge here/ });
    const titles = events
      .getAllByRole("listitem")
      .map((li) => li.querySelector(".event-title")?.textContent);
    expect(titles.slice(0, 3)).toEqual(["Idle", "Note", "Engine start"]);
    expect(within(pin).getByText("+0:30")).toBeTruthy();
    fireEvent.click(pin);
    const view = within(await screen.findByRole("dialog", { name: "Note" }));
    expect(view.getByText("Surge here")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Readout" })).getByText("+0:30")).toBeTruthy();
  });
});

describe("Drive Log viewer: the readout flag line", () => {
  const stepTo = async (row: number) => {
    const bar = await noteBar();
    for (let i = 0; i < row; i++) fireEvent.click(bar.getByRole("button", { name: "Next row" }));
  };
  const flag = () => document.querySelector(".readout-flag") as HTMLElement;

  it("reads ● Note in --note on a pinned row, and nothing on the others", async () => {
    renderApp(data({ notes: { 1: [noteRow({ pinnedTimeSec: 30, snappedTimeSec: 30 })] } }));
    await stepTo(2);
    expect(flag().textContent).toBe("");
    await stepTo(1);
    await waitFor(() => expect(flag().textContent).toBe("● Note"));
    expect(flag().querySelector("span")?.getAttribute("style")).toContain("var(--note)");
  });

  it("reads ● IN WINDOW · ● Note when both apply", async () => {
    renderApp(data({ notes: { 1: [noteRow({ pinnedTimeSec: 60, snappedTimeSec: 60 })] } }));
    await stepTo(6);
    await waitFor(() => expect(flag().textContent).toBe("● IN WINDOW · ● Note"));
  });
});

describe("Drive Log viewer: pin heads", () => {
  it("puts a pin head above the chart for each pinned row; a tap snaps the cursor and opens Note view", async () => {
    renderApp(
      data({
        notes: {
          1: [
            noteRow({ id: 5, text: "Surge here", pinnedTimeSec: 30, snappedTimeSec: 30 }),
            noteRow({ id: 6, text: "Whole drive" }),
          ],
        },
      }),
    );
    const head = await screen.findByRole("button", { name: "Note at 17:59:15" });
    expect(screen.getAllByRole("button", { name: /^Note at / }).length).toBe(1);
    expect(head.closest(".chart-card")).not.toBeNull();
    fireEvent.click(head);
    const view = within(await screen.findByRole("dialog", { name: "Note" }));
    expect(view.getByText("Surge here")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Readout" })).getByText("+0:30")).toBeTruthy();
  });
});

describe("Drive Log viewer: the legend", () => {
  it("shows a Note swatch when a Note is pinned, and none otherwise", async () => {
    renderApp(data({ notes: { 1: [noteRow({ pinnedTimeSec: 30, snappedTimeSec: 30 })] } }));
    const legend = within(await screen.findByRole("list", { name: "Legend" }));
    await waitFor(() => expect(legend.getByText("Note")).toBeTruthy());
    cleanup();
    renderApp(data({ notes: { 1: [noteRow({ text: "Whole drive" })] } }));
    await screen.findByRole("list", { name: "Legend" });
    await screen.findByText("Whole drive");
    expect(within(screen.getByRole("list", { name: "Legend" })).queryByText("Note")).toBeNull();
  });
});

describe("Drive Log viewer: an Event row and the legend", () => {
  it("seeks the cursor to an Event when its row is tapped", async () => {
    renderApp(data());
    const events = within(await screen.findByRole("region", { name: "Events" }));
    fireEvent.click(await events.findByRole("button", { name: /Engine start/ }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "Readout" })).getByText("+0:40"),
      ).toBeTruthy(),
    );
  });

  it("draws no legend without Events, a freeze frame or a Note, and a Note-only legend with a pin", async () => {
    const bare = driveLogDetail({ events: [] });
    renderApp(data({ driveLogDetails: { 1: bare } }));
    await screen.findByRole("region", { name: "Readout" });
    expect(screen.queryByRole("list", { name: "Legend" })).toBeNull();
    cleanup();
    renderApp(
      data({
        driveLogDetails: { 1: bare },
        notes: { 1: [noteRow({ pinnedTimeSec: 30, snappedTimeSec: 30 })] },
      }),
    );
    const legend = within(await screen.findByRole("list", { name: "Legend" }));
    expect(legend.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Note"]);
  });
});

describe("Drive Log viewer: changing a whole-drive Note", () => {
  const whole = () => noteRow({ id: 4, text: "Whole old" });

  it("edits it from the Notes panel", async () => {
    const noteCalls: NonNullable<StubData["noteCalls"]> = [];
    renderApp(data({ noteCalls, notes: { 1: [whole()] } }));
    const panel = await notesPanel();
    fireEvent.click(await panel.findByRole("button", { name: /Whole old/ }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Note" })).getByRole("button", {
        name: "Edit",
      }),
    );
    const sheet = within(await screen.findByRole("dialog", { name: "Note" }));
    fireEvent.input(sheet.getByRole("textbox"), { target: { value: "Whole new" } });
    fireEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(panel.getByText("Whole new")).toBeTruthy());
    expect(panel.queryByText("Whole old")).toBeNull();
    expect(noteCalls.filter((c) => c.method === "PATCH")).toEqual([
      { method: "PATCH", id: 4, text: "Whole new" },
    ]);
  });

  it("deletes it from the Notes panel after the confirmation", async () => {
    const noteCalls: NonNullable<StubData["noteCalls"]> = [];
    renderApp(data({ noteCalls, notes: { 1: [whole()] } }));
    const panel = await notesPanel();
    fireEvent.click(await panel.findByRole("button", { name: /Whole old/ }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Note" })).getByRole("button", {
        name: "Delete",
      }),
    );
    const confirm = within(await screen.findByRole("dialog", { name: "Delete this Note?" }));
    fireEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(panel.queryByText("Whole old")).toBeNull());
    expect(noteCalls.filter((c) => c.method === "DELETE")).toEqual([{ method: "DELETE", id: 4 }]);
  });
});

describe("Drive Log viewer: Notes panel", () => {
  it("lists only the whole-drive Notes, oldest first, and adds one with Add", async () => {
    const noteCalls: NonNullable<StubData["noteCalls"]> = [];
    renderApp(
      data({
        noteCalls,
        notes: {
          1: [
            noteRow({ id: 2, text: "Whole later", createdAt: "2026-10-05T09:00:00.000Z" }),
            noteRow({ id: 3, text: "Pinned one", pinnedTimeSec: 30, snappedTimeSec: 30 }),
            noteRow({ id: 1, text: "Whole first", createdAt: "2026-10-04T09:00:00.000Z" }),
          ],
        },
      }),
    );
    const panel = await notesPanel();
    await waitFor(() => expect(panel.getAllByRole("listitem").length).toBe(2));
    expect(panel.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Whole first"),
      expect.stringContaining("Whole later"),
    ]);
    fireEvent.click(panel.getByRole("button", { name: "Add" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Note" }));
    fireEvent.input(sheet.getByRole("textbox"), { target: { value: "Whole new" } });
    fireEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(panel.getByText("Whole new")).toBeTruthy());
    expect(noteCalls.filter((c) => c.method === "POST")).toEqual([
      { method: "POST", uploadId: 1, text: "Whole new", pinnedAt: null },
    ]);
  });
});
