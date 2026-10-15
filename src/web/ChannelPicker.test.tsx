// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubCanvas } from "./test-canvas.ts";
import { renderApp } from "./test-render.tsx";
import { driveLogDetail, type StubData, vehicleRow } from "./test-support.ts";

beforeEach(() => {
  stubCanvas();
  history.replaceState(null, "", "/drive-logs/1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
});

/**
 * 40 rows, one second apart. Log order: speed, rpm, load, coolant, boost. The preset charts speed and rpm;
 * the Profile hides boost.
 */
const longLog = () => {
  const t = Array.from({ length: 40 }, (_, i) => i);
  return driveLogDetail({
    metadata: { startTime: "2026-10-02T17:58:45.9486", duration: 39, rows: {} },
    channels: {
      t,
      channels: {
        speed: { label: "Vehicle speed", unit: "mph", values: t.map((i) => i) },
        rpm: { label: "Engine speed", unit: "rpm", values: t.map((i) => 800 + i * 10) },
        load: { label: "Engine load", unit: "%", values: t.map((i) => 20 + i / 2) },
        ect: { label: "Coolant", unit: "°F", values: t.map((i) => 180 + i) },
        boost: { label: "Boost", unit: "psi", values: t.map((i) => i % 7) },
      },
      hidden: ["boost"],
    },
  });
};

const data = (over: StubData = {}): StubData => ({
  vehicles: [vehicleRow({ id: 1, label: "2012 Ford F-250" })],
  driveLogDetails: { 1: longLog() },
  ...over,
});

const chips = async () => within(await screen.findByRole("group", { name: "Channels" }));
const chipNames = async () =>
  (await chips()).getAllByRole("button").map((b) => b.textContent?.trim());
const slotNames = () =>
  [...document.querySelectorAll(".readout-slot")].map((el) => el.getAttribute("aria-label"));
const panelLabels = () =>
  [...document.querySelectorAll(".chart-label")].map((el) => el.textContent);
const tap = async (name: string) => fireEvent.click((await chips()).getByRole("button", { name }));

describe("Channel picker: chips", () => {
  it("lists the charted Channels first in picker order, then the other visible ones in log order, then All Channels…", async () => {
    renderApp(data());
    expect(await chipNames()).toEqual([
      "Vehicle speed",
      "Engine speed",
      "Engine load",
      "Coolant",
      "All Channels…",
    ]);
    const c = await chips();
    expect(c.getByRole("button", { name: "Vehicle speed" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(c.getByRole("button", { name: "Coolant" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("adds exactly one readout slot and one panel line on a tap, and takes them away on the second", async () => {
    renderApp(data());
    await chips();
    expect(slotNames()).toEqual(["Speed", "RPM"]);
    await waitFor(() =>
      expect(panelLabels()).toEqual(["Vehicle speed (mph)", "Engine speed (rpm)"]),
    );

    await tap("Engine load");
    await waitFor(() => expect(slotNames()).toEqual(["Speed", "RPM", "Engine load"]));
    await waitFor(() =>
      expect(panelLabels()).toEqual([
        "Vehicle speed (mph)",
        "Engine speed (rpm)",
        "Engine load (%)",
      ]),
    );
    expect(
      (await chips()).getByRole("button", { name: "Engine load" }).getAttribute("aria-pressed"),
    ).toBe("true");

    await tap("Engine load");
    await waitFor(() => expect(slotNames()).toEqual(["Speed", "RPM"]));
    await waitFor(() =>
      expect(panelLabels()).toEqual(["Vehicle speed (mph)", "Engine speed (rpm)"]),
    );
  });

  it("moves a Channel to the front of the chips when it is charted, and back among the others when dropped", async () => {
    renderApp(data());
    await tap("Coolant");
    await waitFor(() => expect(slotNames()).toContain("Coolant"));
    expect((await chipNames()).slice(0, 4)).toEqual([
      "Vehicle speed",
      "Engine speed",
      "Coolant",
      "Engine load",
    ]);
    await tap("Vehicle speed");
    await waitFor(() => expect(slotNames()).toEqual(["RPM", "Coolant"]));
    expect(await chipNames()).toEqual([
      "Engine speed",
      "Coolant",
      "Vehicle speed",
      "Engine load",
      "All Channels…",
    ]);
  });

  it("appends a newly charted Channel to the end of the readout, in picker order", async () => {
    renderApp(data());
    await tap("Vehicle speed");
    await tap("Engine load");
    await tap("Vehicle speed");
    await waitFor(() => expect(slotNames()).toEqual(["RPM", "Engine load", "Speed"]));
  });

  it("colours chips, slots and panel lines by place in the picker order, with a dot and a border in the colour", async () => {
    const tokens = ["rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)", "rgb(4, 4, 4)"];
    tokens.forEach((c, i) => {
      document.documentElement.style.setProperty(`--c${i + 1}`, c);
    });
    renderApp(data());
    await tap("Coolant");
    await tap("Engine load");
    await waitFor(() => expect(slotNames()).toEqual(["Speed", "RPM", "Coolant", "Engine load"]));
    const readout = [...document.querySelectorAll<HTMLElement>(".readout-dot")].map(
      (el) => el.style.backgroundColor,
    );
    expect(readout).toEqual(tokens);
    const c = await chips();
    const chipColour = (name: string) =>
      c.getByRole("button", { name }).style.getPropertyValue("--chip");
    expect(chipColour("Vehicle speed")).toBe("rgb(1, 1, 1)");
    expect(chipColour("Coolant")).toBe("rgb(3, 3, 3)");
    expect(chipColour("Engine load")).toBe("rgb(4, 4, 4)");
    // An uncharted chip carries no series colour.
    await tap("Engine load");
    await waitFor(() => expect(slotNames()).toEqual(["Speed", "RPM", "Coolant"]));
    expect(c.getByRole("button", { name: "Engine load" }).style.getPropertyValue("--chip")).toBe(
      "",
    );
  });
});

describe("Channel picker: All Channels sheet", () => {
  const open = async () => {
    fireEvent.click((await chips()).getByRole("button", { name: "All Channels…" }));
    return within(await screen.findByRole("dialog", { name: "All Channels" }));
  };

  it("has a checkbox per Channel, ticked for the charted ones, with the Profile's hidden Channels apart under their own heading", async () => {
    renderApp(data());
    const sheet = await open();
    const box = (name: string) => sheet.getByRole("checkbox", { name }) as HTMLInputElement;
    expect(box("Vehicle speed").checked).toBe(true);
    expect(box("Engine speed").checked).toBe(true);
    expect(box("Engine load").checked).toBe(false);
    expect(box("Coolant").checked).toBe(false);
    const heading = sheet.getByText("Hidden by the Profile");
    const boost = box("Boost");
    expect(heading.compareDocumentPosition(boost) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The visible Channels come before the heading.
    expect(
      box("Coolant").compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("charts a Channel when it is ticked and drops it when it is unticked, like a chip tap", async () => {
    renderApp(data());
    const sheet = await open();
    fireEvent.click(sheet.getByRole("checkbox", { name: "Boost" }));
    await waitFor(() => expect(slotNames()).toEqual(["Speed", "RPM", "Boost"]));
    await waitFor(() =>
      expect(panelLabels()).toEqual(["Vehicle speed (mph)", "Engine speed (rpm)", "Boost (psi)"]),
    );
    fireEvent.click(sheet.getByRole("checkbox", { name: "Vehicle speed" }));
    await waitFor(() => expect(slotNames()).toEqual(["RPM", "Boost"]));
    fireEvent.click(sheet.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // A charted hidden Channel gets a chip too, among the charted ones.
    expect((await chipNames()).slice(0, 2)).toEqual(["Engine speed", "Boost"]);
  });
});

describe("Channel picker: data table", () => {
  const overlay = async () => {
    const el = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(".chart-stack .u-over");
      if (!found) throw new Error("no chart yet");
      return found;
    });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 100 }) as DOMRect;
    return el;
  };
  const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
  const current = () => rows().filter((r) => r.getAttribute("aria-current") === "true");
  const cells = (row: HTMLElement) =>
    within(row)
      .getAllByRole("cell")
      .map((c) => c.textContent?.replaceAll(" ", "").trim());

  it("is collapsed until Show, and Hide collapses it again", async () => {
    renderApp(data());
    const show = await screen.findByRole("button", { name: "Show" });
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(show);
    expect(screen.getByRole("table")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows 11 rows with the cursor row marked at the centre; columns are time, charted Channels in picker order, then the other visible ones", async () => {
    renderApp(data());
    const over = await overlay();
    await tap("Coolant");
    fireEvent.mouseMove(over, { clientX: 200, clientY: 20 });
    fireEvent.click(await screen.findByRole("button", { name: "Show" }));
    const table = within(screen.getByRole("table"));
    expect(table.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Time",
      "Vehicle speed",
      "Engine speed",
      "Coolant",
      "Engine load",
    ]);
    // 200 px of 390 is 20 s of 39.
    await waitFor(() => expect(rows()).toHaveLength(11));
    expect(rows().map((r) => cells(r)[1])).toEqual(
      Array.from({ length: 11 }, (_, i) => String(15 + i)),
    );
    expect(current()).toHaveLength(1);
    expect(cells(current()[0] as HTMLElement)).toEqual(["17:59:05", "20", "1000", "200", "30.00"]);
    expect(rows()[5]).toBe(current()[0]);
  });

  it("moves the highlight with the cursor, and holds a full window at the ends", async () => {
    renderApp(data());
    const over = await overlay();
    fireEvent.click(await screen.findByRole("button", { name: "Show" }));
    expect(cells(current()[0] as HTMLElement)[1]).toBe("0");
    expect(rows()[0]).toBe(current()[0]);
    fireEvent.mouseMove(over, { clientX: 200, clientY: 20 });
    await waitFor(() => expect(cells(current()[0] as HTMLElement)[1]).toBe("20"));
    fireEvent.mouseMove(over, { clientX: 220, clientY: 20 });
    await waitFor(() => expect(cells(current()[0] as HTMLElement)[1]).toBe("22"));
    expect(rows()).toHaveLength(11);
    fireEvent.mouseMove(over, { clientX: 389, clientY: 20 });
    await waitFor(() => expect(cells(current()[0] as HTMLElement)[1]).toBe("39"));
    expect(rows()).toHaveLength(11);
    expect(rows().at(-1)).toBe(current()[0]);
  });

  it("writes values with each Channel's fixed format", async () => {
    renderApp(data());
    fireEvent.click(await screen.findByRole("button", { name: "Show" }));
    // Load runs 20 to 39.5: two decimals. It is the third column after Time, behind speed and rpm.
    expect(cells(rows()[0] as HTMLElement)[3]).toBe("20.00");
  });
});

describe("Channel picker: notices", () => {
  it("shows every decode notice and warning as text above the chips", async () => {
    const notices = ["EGR position rescaled from the pre-October decode", "Second notice"];
    const warnings = ["12 rows skipped"];
    renderApp(
      data({
        driveLogDetails: {
          1: { ...longLog(), decodeNotices: notices, warnings },
        },
      }),
    );
    const c = await screen.findByRole("group", { name: "Channels" });
    for (const text of [...notices, ...warnings]) {
      const el = screen.getByText(text);
      expect(el.closest(".notice")).toBeTruthy();
      expect(el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("inserts a notice as text, never markup", async () => {
    renderApp(
      data({
        driveLogDetails: {
          1: { ...longLog(), warnings: ["<img src=x onerror=alert(1)><b>bold</b>"] },
        },
      }),
    );
    const el = await screen.findByText("<img src=x onerror=alert(1)><b>bold</b>");
    expect(el.querySelector("img, b")).toBeNull();
  });

  it("shows no notice when the payload has none", async () => {
    renderApp(data());
    await screen.findByRole("group", { name: "Channels" });
    expect(document.querySelector(".notice")).toBeNull();
  });
});

describe("Channel picker: per Drive Log", () => {
  it("starts again from the preset when another Drive Log opens", async () => {
    renderApp(
      data({ driveLogDetails: { 1: longLog(), 2: { ...longLog(), id: 2, vehicleId: 1 } } }),
    );
    await tap("Engine load");
    await waitFor(() => expect(slotNames()).toContain("Engine load"));
    await act(async () => {
      history.pushState(null, "", "/drive-logs/2");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(slotNames()).toEqual(["Speed", "RPM"]));
  });
});
