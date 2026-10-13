// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmSheet } from "./ConfirmSheet.tsx";

afterEach(cleanup);

describe("ConfirmSheet", () => {
  it("states what goes and confirms with the final button", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmSheet
        title="Delete vehicle?"
        goes={["1 Vehicle", "3 Reports"]}
        confirmLabel="Delete vehicle"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("3 Reports")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete vehicle" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancels from the header action", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmSheet
        title="Delete?"
        goes={["1 Report"]}
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("marks the final button as the filled danger button", () => {
    render(
      <ConfirmSheet
        title="Delete?"
        goes={["1 Report"]}
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Delete" }).classList.contains("btn-danger-fill"),
    ).toBe(true);
  });
});
