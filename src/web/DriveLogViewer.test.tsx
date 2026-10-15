// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubCanvas } from "./test-canvas.ts";
import { renderApp } from "./test-render.tsx";
import { driveLogDetail, driveLogRow, type StubData, vehicleRow } from "./test-support.ts";

beforeEach(() => {
  stubCanvas();
  history.replaceState(null, "", "/drive-logs/1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const vehicles = [vehicleRow({ id: 1, label: "2012 Ford F-250" })];
const data = (over: StubData = {}): StubData => ({
  vehicles,
  driveLogDetails: { 1: driveLogDetail() },
  ...over,
});

/** The readout's text with figure-space padding removed. */
const plain = (el: Element) => el.textContent?.replaceAll(" ", "").trim();
const slot = async (name: string) => within(await screen.findByRole("listitem", { name }));

describe("Drive Log viewer: readout", () => {
  it("opens on the first row: its time and elapsed time, then one slot per charted Channel", async () => {
    renderApp(data());
    const readout = await screen.findByRole("region", { name: "Readout" });
    expect(within(readout).getByText("17:58:45")).toBeTruthy();
    expect(within(readout).getByText("+0:00")).toBeTruthy();
    const speed = await slot("Speed");
    expect(plain(speed.getByText("0", { selector: ".readout-value" }))).toBe("0");
    expect(speed.getByText("mph")).toBeTruthy();
    const rpm = await slot("RPM");
    expect(plain(rpm.getByText("800", { selector: ".readout-value" }))).toBe("800");
    expect(rpm.getByText("rpm")).toBeTruthy();
    // Load is in the log but in no panel, so it has no slot.
    expect(screen.queryByRole("listitem", { name: "Load" })).toBeNull();
  });
});

/** The plot overlays (one per panel), each given a 400 px wide box at the page's left edge. */
async function overlays() {
  const found = await waitFor(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".chart-stack .u-over")];
    if (els.length === 0) throw new Error("no chart yet");
    return els;
  });
  for (const el of found)
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 100 }) as DOMRect;
  return found;
}

describe("Drive Log viewer: cursor", () => {
  it("moves the cursor to the row nearest the mouse and shows that row in the readout", async () => {
    renderApp(data());
    const [over] = await overlays();
    // 400 px show 0 to 100 s, so x 205 is 51.25 s: the nearest row is 50 s.
    fireEvent.mouseMove(over as HTMLElement, { clientX: 205, clientY: 20 });
    await waitFor(() => expect(screen.getByText("+0:50")).toBeTruthy());
    expect(screen.getByText("17:59:35")).toBeTruthy();
    expect(plain((await slot("Speed")).getByText("50", { selector: ".readout-value" }))).toBe("50");
    expect(plain((await slot("RPM")).getByText("1300", { selector: ".readout-value" }))).toBe(
      "1300",
    );
  });

  it("moves the same cursor from either panel", async () => {
    renderApp(data());
    const [, second] = await overlays();
    fireEvent.mouseMove(second as HTMLElement, { clientX: 399, clientY: 20 });
    await waitFor(() => expect(screen.getByText("+1:40")).toBeTruthy());
    expect(plain((await slot("Speed")).getByText("100", { selector: ".readout-value" }))).toBe(
      "100",
    );
  });
});

/** Where the overview strip outlines the zoom window, as percentages of the whole drive. */
const zoomWindow = () => {
  const el = screen.getByRole("img", { name: "Zoom window" });
  return { left: parseFloat(el.style.left), width: parseFloat(el.style.width) };
};

describe("Drive Log viewer: zoom with the mouse", () => {
  it("starts showing the whole drive", async () => {
    renderApp(data());
    await overlays();
    expect(zoomWindow()).toEqual({ left: 0, width: 100 });
  });

  it("brush-zooms to the range dragged across", async () => {
    renderApp(data());
    const [over] = await overlays();
    fireEvent.mouseDown(over as HTMLElement, { clientX: 100, clientY: 20, button: 0 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 25 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 25 });
    // x 100 to 300 of 400 px is 25 to 75 s of 100 s.
    await waitFor(() => expect(zoomWindow()).toEqual({ left: 25, width: 50 }));
  });

  it("brushes right to left too", async () => {
    renderApp(data());
    const [over] = await overlays();
    fireEvent.mouseDown(over as HTMLElement, { clientX: 300, clientY: 20, button: 0 });
    fireEvent.mouseMove(window, { clientX: 100, clientY: 20 });
    fireEvent.mouseUp(window, { clientX: 100, clientY: 20 });
    await waitFor(() => expect(zoomWindow()).toEqual({ left: 25, width: 50 }));
  });

  it("zooms the Readout's cursor along: moving the mouse after a zoom maps x to the new range", async () => {
    renderApp(data());
    const [over] = await overlays();
    fireEvent.mouseDown(over as HTMLElement, { clientX: 100, clientY: 20, button: 0 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 20 });
    await waitFor(() => expect(zoomWindow().width).toBe(50));
    // The plot now shows 25 to 75 s, so x 400 is 75 s: the nearest row is 70 s or 80 s (tie goes earlier).
    fireEvent.mouseMove(over as HTMLElement, { clientX: 400, clientY: 20 });
    await waitFor(() => expect(screen.getByText("+1:10")).toBeTruthy());
  });

  it("resets to the whole drive on a double-click", async () => {
    renderApp(data());
    const [over] = await overlays();
    fireEvent.mouseDown(over as HTMLElement, { clientX: 100, clientY: 20, button: 0 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 20 });
    await waitFor(() => expect(zoomWindow().width).toBe(50));
    fireEvent.dblClick(over as HTMLElement, { clientX: 200, clientY: 20 });
    await waitFor(() => expect(zoomWindow()).toEqual({ left: 0, width: 100 }));
  });

  it("a click without a drag places the cursor and leaves the range alone", async () => {
    renderApp(data());
    const [over] = await overlays();
    fireEvent.mouseDown(over as HTMLElement, { clientX: 205, clientY: 20, button: 0 });
    fireEvent.mouseUp(window, { clientX: 206, clientY: 20 });
    await waitFor(() => expect(screen.getByText("+0:50")).toBeTruthy());
    expect(zoomWindow()).toEqual({ left: 0, width: 100 });
  });
});

describe("Drive Log viewer: overview strip", () => {
  it("centres the zoom window where the mouse goes down and follows a drag", async () => {
    renderApp(data());
    const [over] = await overlays();
    fireEvent.mouseDown(over as HTMLElement, { clientX: 100, clientY: 20, button: 0 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 20 });
    await waitFor(() => expect(zoomWindow().width).toBe(50));
    const strip = document.querySelector(".chart-overview") as HTMLElement;
    strip.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 34 }) as DOMRect;
    // x 100 of 400 is 25 s: the 50 s wide window centres there, so it would run to -0 and 50.
    fireEvent.mouseDown(strip, { clientX: 100, button: 0 });
    await waitFor(() => expect(zoomWindow()).toEqual({ left: 0, width: 50 }));
    fireEvent.mouseMove(window, { clientX: 300 });
    fireEvent.mouseUp(window, { clientX: 300 });
    await waitFor(() => expect(zoomWindow()).toEqual({ left: 50, width: 50 }));
  });
});

describe("Drive Log viewer: series colours", () => {
  const setTokens = (colors: string[]) =>
    colors.forEach((c, i) => {
      document.documentElement.style.setProperty(`--c${i + 1}`, c);
    });
  const SCHEME = "(prefers-color-scheme: dark)";
  let schemeListeners: (() => void)[];
  beforeEach(() => {
    schemeListeners = [];
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_: string, fn: () => void) => {
        if (query === SCHEME) schemeListeners.push(fn);
      },
      removeEventListener: (_: string, fn: () => void) => {
        schemeListeners = schemeListeners.filter((l) => l !== fn);
      },
    }));
  });
  afterEach(() => document.documentElement.removeAttribute("style"));

  /** The colours of the cursor dots on the first panel's lines, and of the readout's dots. */
  const dots = () => ({
    cursor: [...document.querySelectorAll<HTMLElement>(".chart-stack .u-cursor-pt")].map(
      (el) => el.style.backgroundColor,
    ),
    readout: [...document.querySelectorAll<HTMLElement>(".readout-dot")].map(
      (el) => el.style.backgroundColor,
    ),
  });

  it("gives the charted Channels --c1, --c2, ... in order, and draws the cursor dots in them", async () => {
    setTokens(["rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)"]);
    renderApp(data());
    const [over] = await overlays();
    fireEvent.mouseMove(over as HTMLElement, { clientX: 205, clientY: 20 });
    await waitFor(() => expect(screen.getByText("+0:50")).toBeTruthy());
    expect(dots().readout).toEqual(["rgb(1, 1, 1)", "rgb(2, 2, 2)"]);
    expect(dots().cursor).toEqual(["rgb(1, 1, 1)", "rgb(2, 2, 2)"]);
  });

  it("reads the tokens again when the colour scheme changes", async () => {
    setTokens(["rgb(1, 1, 1)", "rgb(2, 2, 2)"]);
    renderApp(data());
    const [over] = await overlays();
    expect(schemeListeners.length).toBeGreaterThan(0);
    setTokens(["rgb(9, 9, 9)", "rgb(8, 8, 8)"]);
    act(() => {
      for (const fn of schemeListeners) fn();
    });
    await waitFor(() => expect(dots().readout).toEqual(["rgb(9, 9, 9)", "rgb(8, 8, 8)"]));
    const [again] = await overlays();
    fireEvent.mouseMove(again as HTMLElement, { clientX: 205, clientY: 20 });
    expect(over).toBeTruthy();
    await waitFor(() => expect(dots().cursor).toEqual(["rgb(9, 9, 9)", "rgb(8, 8, 8)"]));
  });
});

describe("Drive Log viewer: the … sheet", () => {
  const openSheet = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    return screen.findByRole("dialog", { name: "Drive Log" });
  };

  it("offers Download original as a download link to the stored file, and Delete…", async () => {
    renderApp(data());
    const sheet = await openSheet();
    const link = within(sheet).getByRole("link", { name: "Download original" });
    expect(link.getAttribute("href")).toBe("/api/uploads/1/original");
    expect(link.hasAttribute("download")).toBe(true);
    expect(within(sheet).getByRole("button", { name: "Delete…" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks before deleting, then deletes the upload and goes back in history", async () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    const deletedUploads: number[] = [];
    history.replaceState(null, "", "/drive-logs");
    renderApp(data({ deletedUploads, driveLogs: { 1: [driveLogRow({ id: 1 })] } }));
    fireEvent.click(await screen.findByRole("link", { name: /Oct/ }));
    fireEvent.click(within(await openSheet()).getByRole("button", { name: "Delete…" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this Drive Log?" });
    expect(deletedUploads).toEqual([]);
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deletedUploads).toEqual([1]));
    await waitFor(() => expect(back).toHaveBeenCalledOnce());
  });

  it("goes to the Drive Logs tab after a delete when the app opened on this log", async () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    renderApp(data());
    fireEvent.click(within(await openSheet()).getByRole("button", { name: "Delete…" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this Drive Log?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(location.pathname).toBe("/drive-logs"));
    expect(back).not.toHaveBeenCalled();
  });

  it("toasts and stays when the delete fails", async () => {
    renderApp(data({ fail: { deleteUpload: "status" } }));
    fireEvent.click(within(await openSheet()).getByRole("button", { name: "Delete…" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this Drive Log?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Couldn't delete the Drive Log.")).toBeTruthy();
    expect(location.pathname).toBe("/drive-logs/1");
  });
});

describe("Drive Log viewer: shell", () => {
  it("uses the wide viewer container", async () => {
    renderApp(data());
    await screen.findByRole("region", { name: "Readout" });
    expect(document.querySelector("main")?.classList.contains("viewer")).toBe(true);
  });

  it("shows the load banner when the log fails to load", async () => {
    renderApp(data({ fail: { driveLogDetail: "status" } }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("says Unassigned in the meta line for a log with no Vehicle", async () => {
    renderApp(data({ driveLogDetails: { 1: driveLogDetail({ vehicleId: null }) } }));
    expect(await screen.findByText("Unassigned · 2 min · 11 rows")).toBeTruthy();
  });
});

describe("Drive Log viewer: cursor look", () => {
  const SCHEME = "(prefers-color-scheme: dark)";
  let listeners: (() => void)[];
  beforeEach(() => {
    listeners = [];
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_: string, fn: () => void) => {
        if (query === SCHEME) listeners.push(fn);
      },
      removeEventListener: () => {},
    }));
  });
  afterEach(() => document.documentElement.removeAttribute("style"));

  const look = () => ({
    lines: [...document.querySelectorAll<HTMLElement>(".chart-stack .u-cursor-x")].map(
      (el) =>
        `${el.style.borderRightWidth} ${el.style.borderRightStyle} ${el.style.borderRightColor}`,
    ),
    rings: [...document.querySelectorAll<HTMLElement>(".chart-stack .u-cursor-pt")].map(
      (el) => el.style.borderColor,
    ),
    sizes: [...document.querySelectorAll<HTMLElement>(".chart-stack .u-cursor-pt")].map(
      (el) => el.style.width,
    ),
  });

  it("draws a solid 1.2px --ink line and 9px dots ringed in --surface, and re-reads them on a scheme change", async () => {
    document.documentElement.style.setProperty("--ink", "rgb(5, 5, 5)");
    document.documentElement.style.setProperty("--surface", "rgb(250, 250, 250)");
    renderApp(data());
    const [over] = await overlays();
    fireEvent.mouseMove(over as HTMLElement, { clientX: 205, clientY: 20 });
    await waitFor(() => expect(screen.getByText("+0:50")).toBeTruthy());
    expect(look().lines).toEqual(Array(2).fill("1.2px solid rgb(5, 5, 5)"));
    expect(look().rings).toEqual(Array(2).fill("rgb(250, 250, 250)"));
    expect(look().sizes).toEqual(["9px", "9px"]);
    document.documentElement.style.setProperty("--ink", "rgb(200, 200, 200)");
    document.documentElement.style.setProperty("--surface", "rgb(20, 20, 20)");
    act(() => {
      for (const fn of listeners) fn();
    });
    const [again] = await overlays();
    fireEvent.mouseMove(again as HTMLElement, { clientX: 205, clientY: 20 });
    await waitFor(() => {
      expect(look().lines).toEqual(Array(2).fill("1.2px solid rgb(200, 200, 200)"));
      expect(look().rings).toEqual(Array(2).fill("rgb(20, 20, 20)"));
    });
  });
});

describe("Drive Log viewer: a log of one row", () => {
  it("still shows the whole drive as the zoom window and the row in the readout", async () => {
    const t = [0];
    renderApp(
      data({
        driveLogDetails: {
          1: driveLogDetail({
            channels: {
              t,
              channels: {
                speed: { label: "Vehicle speed", unit: "mph", values: [73.4] },
                rpm: { label: "Engine speed", unit: "rpm", values: [900] },
              },
              hidden: [],
            },
          }),
        },
      }),
    );
    await overlays();
    expect(zoomWindow()).toEqual({ left: 0, width: 100 });
    expect(plain((await slot("Speed")).getByText("73.40", { selector: ".readout-value" }))).toBe(
      "73.40",
    );
  });
});

describe("Drive Log viewer: the zoom stays inside the drive", () => {
  it("slides the window back in when the overview is centred at the far edge", async () => {
    renderApp(data());
    const [over] = await overlays();
    fireEvent.mouseDown(over as HTMLElement, { clientX: 100, clientY: 20, button: 0 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 20 });
    await waitFor(() => expect(zoomWindow().width).toBe(50));
    const strip = document.querySelector(".chart-overview") as HTMLElement;
    strip.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 34 }) as DOMRect;
    // Centring a 50 s window on the last second would run it to 125 s of a 100 s drive.
    fireEvent.mouseDown(strip, { clientX: 400, button: 0 });
    fireEvent.mouseUp(window, { clientX: 400 });
    await waitFor(() => expect(zoomWindow()).toEqual({ left: 50, width: 50 }));
  });

  it("slides it back in at the near edge too", async () => {
    renderApp(data());
    const [over] = await overlays();
    fireEvent.mouseDown(over as HTMLElement, { clientX: 100, clientY: 20, button: 0 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 20 });
    await waitFor(() => expect(zoomWindow().width).toBe(50));
    const strip = document.querySelector(".chart-overview") as HTMLElement;
    strip.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 34 }) as DOMRect;
    fireEvent.mouseDown(strip, { clientX: 0, button: 0 });
    fireEvent.mouseUp(window, { clientX: 0 });
    await waitFor(() => expect(zoomWindow()).toEqual({ left: 0, width: 50 }));
  });
});

describe("Drive Log viewer: IN WINDOW flag", () => {
  it("turns on at the first row of a pack span and off past its last row", async () => {
    renderApp(data());
    const [over] = await overlays();
    const flag = () => document.querySelector(".readout-flag")?.textContent?.trim();
    expect(flag()).toBe("");
    // 400 px show 0 to 100 s, so 10 s is 40 px. The pack span runs 60 to 80 s.
    fireEvent.mouseMove(over as HTMLElement, { clientX: 200 });
    await waitFor(() => expect(screen.getByText("+0:50")).toBeTruthy());
    expect(flag()).toBe("");
    fireEvent.mouseMove(over as HTMLElement, { clientX: 240 });
    await waitFor(() => expect(flag()).toBe("● IN WINDOW"));
    fireEvent.mouseMove(over as HTMLElement, { clientX: 320 });
    await waitFor(() => expect(screen.getByText("+1:20")).toBeTruthy());
    expect(flag()).toBe("● IN WINDOW");
    fireEvent.mouseMove(over as HTMLElement, { clientX: 360 });
    await waitFor(() => expect(flag()).toBe(""));
  });
});

const eventsPanel = async () => within(await screen.findByRole("region", { name: "Events" }));

describe("Drive Log viewer: Events list", () => {
  it("lists one row per Event by time: title, detail, start and, for a span, duration", async () => {
    renderApp(data());
    const panel = await eventsPanel();
    expect(panel.getByRole("heading", { name: /Events/ }).textContent).toBe("Events3");
    const rows = panel.getAllByRole("button");
    expect(rows.map((r) => r.querySelector(".event-title")?.textContent)).toEqual([
      "Idle",
      "Engine start",
      "P0401 entry window",
    ]);
    expect(within(rows[0] as HTMLElement).getByText("Engine at idle, 10 s")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("+0:20")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("10 s")).toBeTruthy();
    // A point has a start only.
    expect(within(rows[1] as HTMLElement).getByText("+0:45")).toBeTruthy();
    expect(rows[1]?.querySelector(".event-duration")).toBeNull();
  });
});

describe("Drive Log viewer: Events list rows", () => {
  const withPackName = {
    ruleId: "p0401.entry-window",
    packId: "p0401",
    packName: "6.7 P0401",
    name: "P0401 entry window",
    status: "ran" as const,
    events: 1,
  };

  it("puts the pack's name above a pack Event and none above a generic one", async () => {
    const base = driveLogDetail();
    renderApp(
      data({
        driveLogDetails: {
          1: driveLogDetail({ ruleOutcomes: [...base.ruleOutcomes, withPackName] }),
        },
      }),
    );
    const rows = (await eventsPanel()).getAllByRole("button");
    expect(rows[2]?.querySelector(".event-pack")?.textContent).toBe("6.7 P0401");
    expect(rows[0]?.querySelector(".event-pack")).toBeNull();
  });

  it("inserts an Event's title and text as text, never markup", async () => {
    const base = driveLogDetail();
    const first = base.events[0] as (typeof base.events)[number];
    renderApp(
      data({
        driveLogDetails: {
          1: driveLogDetail({
            events: [{ ...first, title: "<b>bold</b>", text: "<img src=x onerror=boom()>" }],
          }),
        },
      }),
    );
    const row = (await eventsPanel()).getAllByRole("button")[0] as HTMLElement;
    expect(row.querySelector(".event-title")?.textContent).toBe("<b>bold</b>");
    expect(row.querySelector("b, img")).toBeNull();
  });
});

describe("Drive Log viewer: rules that did not run", () => {
  it("ends the list with a muted line for each, after the Events", async () => {
    renderApp(data());
    const items = (await eventsPanel()).getAllByRole("listitem");
    expect(items.map((li) => li.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      expect.stringContaining("Idle"),
      expect.stringContaining("Engine start"),
      expect.stringContaining("P0401 entry window"),
      "Regen: not applicable, no DPF regen status in this log",
    ]);
  });

  it("names the missing Channels by the labels the server sends", async () => {
    const base = driveLogDetail();
    renderApp(
      data({
        driveLogDetails: {
          1: driveLogDetail({
            ruleOutcomes: [
              {
                ruleId: "core.peaks",
                packId: null,
                name: "Peaks",
                status: "not-applicable",
                missing: ["speed", "egrActual"],
                missingLabels: ["Vehicle speed", "EGR position, actual"],
              },
            ] as typeof base.ruleOutcomes,
          }),
        },
      }),
    );
    const items = (await eventsPanel()).getAllByRole("listitem");
    expect(items.at(-1)?.textContent).toBe(
      "Peaks: not applicable, no Vehicle speed, EGR position, actual in this log",
    );
  });

  it("keeps the lines when the log has no Events, and adds the Unassigned line on an Unassigned log", async () => {
    renderApp(
      data({
        driveLogDetails: { 1: driveLogDetail({ vehicleId: null, events: [] }) },
      }),
    );
    const items = (await eventsPanel()).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Regen: not applicable, no DPF regen status in this log",
      "Rule Packs: not run, Unassigned logs get no Rule Packs",
    ]);
  });
});

describe("Drive Log viewer: tapping an Events row", () => {
  it("moves the cursor to the nearest row to the Event's start, updates the readout and scrolls the chart into view", async () => {
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    renderApp(data());
    const rows = (await eventsPanel()).getAllByRole("button");
    // The Engine start point is at 45 s: between rows 40 s and 50 s, and the earlier row wins a tie.
    fireEvent.click(rows[1] as HTMLElement);
    const readout = await screen.findByRole("region", { name: "Readout" });
    await waitFor(() => expect(within(readout).getByText("+0:40")).toBeTruthy());
    expect(plain((await slot("Speed")).getByText("40", { selector: ".readout-value" }))).toBe("40");
    expect(scrolled).toHaveLength(1);
    expect(scrolled[0]?.classList.contains("chart-card")).toBe(true);
  });
});

describe("Drive Log viewer: legend", () => {
  const legend = async () =>
    (await screen.findByRole("list", { name: "Legend" })).querySelectorAll("li");

  it("has a swatch for each overlay kind in the log", async () => {
    renderApp(data());
    const items = await legend();
    expect([...items].map((li) => li.textContent)).toEqual(["Event", "Point event", "Rule Pack"]);
    expect([...items].map((li) => li.querySelector("i")?.className)).toEqual([
      "legend-swatch event-marker-fill",
      "legend-swatch event-marker-dashed-line",
      "legend-swatch event-marker-hatch",
    ]);
  });

  it("has none for a kind the log lacks", async () => {
    const base = driveLogDetail();
    renderApp(
      data({
        driveLogDetails: { 1: driveLogDetail({ events: [base.events[0] as never] }) },
      }),
    );
    expect([...(await legend())].map((li) => li.textContent)).toEqual(["Event"]);
  });

  it("is absent when the log has no Events", async () => {
    renderApp(data({ driveLogDetails: { 1: driveLogDetail({ events: [] }) } }));
    await screen.findByRole("region", { name: "Readout" });
    expect(screen.queryByRole("list", { name: "Legend" })).toBeNull();
  });
});

describe("Drive Log viewer: side column", () => {
  it("puts the readout and chart in the main column and the Events panel in the side column, after it", async () => {
    renderApp(data());
    const events = await screen.findByRole("region", { name: "Events" });
    const side = events.closest(".viewer-side") as HTMLElement;
    const main = document.querySelector(".chart-card")?.closest(".viewer-main") as HTMLElement;
    expect(side).toBeTruthy();
    expect(main).toBeTruthy();
    expect(main.contains(screen.getByRole("region", { name: "Readout" }))).toBe(true);
    expect(side.contains(main)).toBe(false);
    expect(main.nextElementSibling).toBe(side);
    expect(main.parentElement).toBe(side.parentElement);
  });
});

describe("Drive Log viewer: header", () => {
  it("titles the log with its date and time, with the Vehicle, duration and row count under it", async () => {
    renderApp(data());
    const title = await screen.findByRole("heading", { name: "FRI 02 OCT · 17:58" });
    const meta = await screen.findByText("2012 Ford F-250 · 2 min · 11 rows");
    expect(title.parentElement?.contains(meta)).toBe(true);
    expect(
      within(screen.getByRole("banner")).getByRole("heading", { name: "Drive Log" }),
    ).toBeTruthy();
  });
});
