// @vitest-environment happy-dom
import { cleanup, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { MenuSheet } from "./MenuSheet.tsx";
import { renderWithApp } from "./test-render.tsx";
import { vehicleRow } from "./test-support.ts";

afterEach(cleanup);

const vehicles = [vehicleRow({ id: 4 }), vehicleRow({ id: 9, label: "2018 Honda Civic" })];

describe("MenuSheet", () => {
  it("links Vehicles with their count", async () => {
    renderWithApp(<MenuSheet onClose={() => {}} />, { vehicles });
    const link = await screen.findByRole("link", { name: /^Vehicles/ });
    expect(link.getAttribute("href")).toBe("/vehicles");
    await waitFor(() => expect(link.textContent).toContain("2"));
  });

  it("shows count badges for Unassigned and Failed Uploads", async () => {
    renderWithApp(<MenuSheet onClose={() => {}} />, {
      vehicles,
      unassigned: [
        { id: 1, filename: "a.csv", recordedAt: null, durationSec: null, noteCount: 0 },
        { id: 2, filename: "b.csv", recordedAt: null, durationSec: null, noteCount: 0 },
        { id: 3, filename: "c.csv", recordedAt: null, durationSec: null, noteCount: 0 },
      ],
      failed: [
        { id: 4, kind: "report", filename: "d.html", error: "bad", uploadedAt: "2026-10-01" },
      ],
    });
    const unassigned = await screen.findByRole("link", { name: /Unassigned/ });
    await waitFor(() => expect(unassigned.textContent).toContain("3"));
    expect(unassigned.getAttribute("href")).toBe("/unassigned");
    const failed = screen.getByRole("link", { name: /Failed Uploads/ });
    expect(failed.textContent).toContain("1");
    expect(failed.getAttribute("href")).toBe("/failed-uploads");
  });

  it("hides the count badges at zero", async () => {
    renderWithApp(<MenuSheet onClose={() => {}} />, { vehicles });
    const unassigned = await screen.findByRole("link", { name: /Unassigned/ });
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /^Vehicles/ }).textContent).toContain("2"),
    );
    expect(unassigned.textContent).not.toContain("0");
    expect(screen.getByRole("link", { name: /Failed Uploads/ }).textContent).not.toContain("0");
  });

  it("names the Current Vehicle on the Export placeholder and shows the app version", async () => {
    renderWithApp(<MenuSheet onClose={() => {}} />, { vehicles, version: "1.4.0" });
    expect(await screen.findByRole("button", { name: "Export 2012 Ford F-250…" })).toBeTruthy();
    expect(await screen.findByText("Version 1.4.0")).toBeTruthy();
  });
});
