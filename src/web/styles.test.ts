import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles/app.css", import.meta.url), "utf8");

/** The declarations of every rule whose selector list contains `selector`, joined. */
function rule(selector: string, source = css): string | undefined {
  const bodies = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1]?.split(",").some((s) => s.trim() === selector))
    .map((m) => m[2]);
  return bodies.length > 0 ? bodies.join(";") : undefined;
}

/** The body of the first `@media` block whose condition contains `condition`. */
function media(condition: string): string {
  const at = css.indexOf(`@media (${condition})`);
  if (at < 0) return "";
  const start = css.indexOf("{", at) + 1;
  let depth = 1;
  let end = start;
  while (depth > 0 && end < css.length) {
    depth += css[end] === "{" ? 1 : css[end] === "}" ? -1 : 0;
    end++;
  }
  return css.slice(start, end - 1);
}

describe("app stylesheet", () => {
  it("stops double-tap zoom on buttons, links, labels, inputs and summary", () => {
    for (const el of ["button", "a", "label", "input", "summary"]) {
      expect(rule(el), el).toMatch(/touch-action:\s*manipulation/);
    }
  });

  it("fills the final confirm button with --bad", () => {
    expect(rule(".btn-danger-fill")).toMatch(/background:\s*var\(--bad\)/);
  });

  it("draws count badges filled --bad and at least 20px wide", () => {
    const body = rule(".count-badge");
    expect(body).toMatch(/background:\s*var\(--bad\)/);
    expect(body).toMatch(/min-width:\s*20px/);
  });

  it("turns sheets into dialogs at most 560px wide from 900px up", () => {
    expect(rule('.scrim > [role="dialog"]', media("min-width: 900px"))).toMatch(
      /max-width:\s*560px/,
    );
  });

  it("widens the gutter to 20px from 900px up", () => {
    expect(rule(":root", media("min-width: 900px"))).toMatch(/--gutter:\s*20px/);
  });

  it("slides a phone sheet up from the bottom with 6px top corners", () => {
    const body = rule('.scrim > [role="dialog"]') ?? "";
    expect(body).toMatch(/border-radius:\s*var\(--radius-panel\)\s+var\(--radius-panel\)\s+0\s+0/);
    expect(body).toMatch(/animation:\s*sheet-up\s+200ms/);
  });

  it("drops the slide animation under prefers-reduced-motion", () => {
    expect(rule('.scrim > [role="dialog"]', media("prefers-reduced-motion: reduce"))).toMatch(
      /animation:\s*none/,
    );
  });

  it("centres the dialog from 900px up", () => {
    const wide = media("min-width: 900px");
    expect(rule(".scrim", wide)).toMatch(/align-items:\s*center/);
    expect(rule('.scrim > [role="dialog"]', wide)).toMatch(
      /border-radius:\s*var\(--radius-panel\)\s*;/,
    );
  });

  it("keeps buttons, tabs and links at least 40px tall, with 44px targets for the bar controls", () => {
    expect(rule("button")).toMatch(/min-height:\s*40px/);
    expect(rule(".bar-control")).toMatch(/min-width:\s*var\(--touch\)/);
    expect(rule(".bar-control")).toMatch(/min-height:\s*var\(--touch\)/);
  });

  it("sets body text in Inter at 15px on the --bg canvas", () => {
    const body = rule("body") ?? "";
    expect(body).toMatch(/font-family:\s*var\(--font-text\)/);
    expect(body).toMatch(/font-size:\s*var\(--fs-15\)/);
    expect(body).toMatch(/background:\s*var\(--bg\)/);
  });

  it("fixes the tab bar to the bottom with safe-area padding, and sticks the app bar", () => {
    const nav = rule(".tab-bar") ?? "";
    expect(nav).toMatch(/position:\s*fixed/);
    expect(nav).toMatch(/bottom:\s*0/);
    expect(nav).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(rule(".app-bar")).toMatch(/position:\s*sticky/);
  });

  it("fills Add with --accent and draws the menu dot in --bad as a circle", () => {
    expect(rule(".add-button")).toMatch(/background:\s*var\(--accent\)/);
    expect(rule(".add-button")).toMatch(/color:\s*var\(--accent-ink\)/);
    expect(rule(".dot")).toMatch(/background:\s*var\(--bad\)/);
    expect(rule(".dot")).toMatch(/border-radius:\s*50%/);
  });

  it("centres list content at most 760px wide from 900px up, inside the gutter", () => {
    expect(rule("main")).toMatch(/padding:\s*var\(--gutter\)/);
    expect(rule("main", media("min-width: 900px"))).toMatch(/max-width:\s*760px/);
  });

  it("scopes shell rules to classes so a sheet's own header and nav are not pinned", () => {
    expect(rule("nav")).toBeUndefined();
    expect(rule("header")).toBeUndefined();
  });

  it("stacks the scrim above the app bar and the tab bar", () => {
    const z = (sel: string) => Number(/z-index:\s*(\d+)/.exec(rule(sel) ?? "")?.[1] ?? 0);
    expect(z(".scrim")).toBeGreaterThan(z(".app-bar"));
    expect(z(".scrim")).toBeGreaterThan(z(".tab-bar"));
  });
});
