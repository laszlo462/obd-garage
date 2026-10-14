// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { Section } from "./Section.tsx";

afterEach(cleanup);

const details = (title: string) => screen.getByText(title).closest("details") as HTMLDetailsElement;

describe("Section", () => {
  it("shows the title, the count badge and the body, open when defaultOpen", () => {
    render(
      <Section title="Trouble codes" count={3} defaultOpen>
        <p>body text</p>
      </Section>,
    );
    expect(details("Trouble codes").open).toBe(true);
    expect(details("Trouble codes").querySelector(".count")?.textContent).toBe("3");
    expect(screen.getByText("body text")).toBeTruthy();
  });

  it("is closed by default, and opens and closes from its summary", () => {
    render(
      <Section title="Live data" count={132}>
        <p>rows</p>
      </Section>,
    );
    const d = details("Live data");
    expect(d.open).toBe(false);
    d.open = true;
    fireEvent(d, new Event("toggle"));
    expect(d.open).toBe(true);
  });

  it("has no badge without a count", () => {
    render(
      <Section title="Notes" defaultOpen>
        <p>x</p>
      </Section>,
    );
    expect(details("Notes").querySelector(".count")).toBeNull();
  });
});
