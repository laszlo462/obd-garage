// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppState } from "./AppState.tsx";
import { LoadBanner } from "./LoadBanner.tsx";
import { Reports } from "./Reports.tsx";
import { renderApp, renderWithApp } from "./test-render.tsx";
import { reportRow, type StubData, vehicleRow } from "./test-support.ts";

afterEach(cleanup);

describe("Load banner", () => {
  beforeEach(() => history.replaceState(null, "", "/reports"));

  it("shows one banner when a list fails, and Retry reloads it and clears the banner", async () => {
    const fail: StubData["fail"] = { reports: "status" };
    renderApp({
      vehicles: [vehicleRow({ id: 4 })],
      reports: { 4: [reportRow({ id: 2 })] },
      fail,
    });
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("Couldn't load.");
    expect(screen.queryByText("Could not load. Try again later.")).toBeNull();
    delete fail.reports;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("link", { name: /REPORT/ });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

/** A button that bumps the revision, so every list screen reloads. */
function Reload() {
  const state = useAppState();
  return (
    <button type="button" onClick={() => state.invalidate()}>
      Reload
    </button>
  );
}

describe("Load banner: stale rows", () => {
  it("keeps the old rows under the banner when a reload of the same Vehicle fails", async () => {
    const fail: StubData["fail"] = {};
    renderWithApp(
      <>
        <LoadBanner />
        <Reports />
        <Reload />
      </>,
      { vehicles: [vehicleRow({ id: 4 })], reports: { 4: [reportRow({ id: 2 })] }, fail },
    );
    await screen.findByRole("link", { name: /REPORT/ });
    fail.reports = "throw";
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: /REPORT/ })).toBeTruthy();
  });
});
