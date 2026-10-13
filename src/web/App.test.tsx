// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "./test-render.tsx";
import { vehicleRow } from "./test-support.ts";

/** Pretend the viewport is (or is not) at least 900 px wide. */
function stubViewport(desktop: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: desktop && query.includes("min-width: 900px"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  history.replaceState(null, "", "/");
  stubViewport(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App shell on a phone", () => {
  it("shows a tablist with Recent, Reports and Drive Logs", () => {
    renderApp();
    const tabs = screen.getByRole("tablist");
    expect(tabs).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Recent",
      "Reports",
      "Drive Logs",
    ]);
  });

  it("marks the tab for the current route as selected", () => {
    history.replaceState(null, "", "/reports");
    renderApp();
    expect(screen.getByRole("tab", { name: "Reports" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Recent" }).getAttribute("aria-selected")).toBe("false");
  });

  it("has an Add button beside the tabs, outside the tablist", () => {
    renderApp();
    const add = screen.getByRole("button", { name: "Add" });
    expect(screen.getByRole("tablist").contains(add)).toBe(false);
  });

  it("names the Current Vehicle in the app bar and opens the switcher", async () => {
    renderApp({ vehicles: [vehicleRow({ id: 4, label: "2012 Ford F-250" })] });
    const switcher = await screen.findByRole("button", { name: /2012 Ford F-250/ });
    fireEvent.click(switcher);
    expect(screen.getByRole("dialog", { name: "Current Vehicle" })).toBeTruthy();
  });

  it("opens the Menu from an icon-only button with an aria-label", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
  });

  it("flags the menu button when Unassigned or Failed Uploads is not empty", async () => {
    renderApp({
      failed: [
        { id: 4, kind: "report", filename: "d.html", error: "bad", uploadedAt: "2026-10-01" },
      ],
    });
    expect(await screen.findByRole("button", { name: "Menu, needs attention" })).toBeTruthy();
  });

  it("moves between the tab routes when a tab is tapped", async () => {
    renderApp();
    expect(screen.getByRole("main").textContent).toContain("Recent uploads");
    fireEvent.click(screen.getByRole("tab", { name: "Drive Logs" }));
    await waitFor(() => expect(screen.getByRole("main").textContent).toContain("Drive Logs list"));
    expect(location.pathname).toBe("/drive-logs");
    expect(screen.getByRole("tab", { name: "Drive Logs" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("hides the tab bar on a pushed screen and offers Back", () => {
    history.replaceState(null, "", "/vehicles");
    renderApp();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
  });
});

describe("App sheets", () => {
  it("returns focus to the menu button when the Menu closes on Escape", () => {
    renderApp();
    const menu = screen.getByRole("button", { name: "Menu" });
    menu.focus();
    fireEvent.click(menu);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(menu);
  });
});

describe("App touch targets", () => {
  it("gives the menu, Back and tab controls the 44 px target class", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Menu" }).classList.contains("bar-control")).toBe(
      true,
    );
    expect(screen.getByRole("tab", { name: "Recent" }).classList.contains("bar-control")).toBe(
      true,
    );
  });
});

describe("App empty state", () => {
  it("tells the owner there are no Vehicles yet on a tab screen", async () => {
    renderApp({ vehicles: [] });
    await waitFor(() => expect(screen.getByRole("main").textContent).toContain("No vehicles yet"));
  });
});

describe("App shell at 900 px and up", () => {
  it("moves the tabs and + Add into the app bar", () => {
    stubViewport(true);
    renderApp();
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("tablist")).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "+ Add" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("switches layout when the viewport crosses 900 px", () => {
    let matches = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }));
    renderApp();
    expect(screen.getByRole("navigation")).toBeTruthy();
    act(() => {
      matches = true;
      for (const fn of listeners) fn();
    });
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(within(screen.getByRole("banner")).getByRole("tablist")).toBeTruthy();
  });
});
