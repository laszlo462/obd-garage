// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet.tsx";

afterEach(cleanup);

describe("Sheet", () => {
  it("is a dialog named by its title", () => {
    render(
      <Sheet title="Menu" actionLabel="Close" onClose={() => {}}>
        <p>Body</p>
      </Sheet>,
    );
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
  });

  it("shows the title and one text action that closes it", () => {
    const onClose = vi.fn();
    render(
      <Sheet title="Menu" actionLabel="Done" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    expect(screen.getByRole("heading", { name: "Menu" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Sheet title="Menu" actionLabel="Close" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on a scrim click but not on a click inside", () => {
    const onClose = vi.fn();
    render(
      <Sheet title="Menu" actionLabel="Close" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus into the dialog when it opens", () => {
    render(
      <Sheet title="Menu" actionLabel="Close" onClose={() => {}}>
        <p>Body</p>
      </Sheet>,
    );
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("returns focus to the opener when it closes", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open menu
          </button>
          {open && (
            <Sheet title="Menu" actionLabel="Close" onClose={() => setOpen(false)}>
              <p>Body</p>
            </Sheet>
          )}
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open menu" });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).not.toBe(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("wraps Tab from the last control to the first", () => {
    render(
      <Sheet title="Menu" actionLabel="Close" onClose={() => {}}>
        <button type="button">One</button>
        <button type="button">Two</button>
      </Sheet>,
    );
    const last = screen.getByRole("button", { name: "Two" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    render(
      <Sheet title="Menu" actionLabel="Close" onClose={() => {}}>
        <button type="button">One</button>
        <button type="button">Two</button>
      </Sheet>,
    );
    const first = screen.getByRole("button", { name: "Close" });
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Two" }));
  });
});
