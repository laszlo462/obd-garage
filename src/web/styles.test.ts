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

  it("tints each badge kind with its DESIGN.md ink and a matching fill", () => {
    for (const [tone, ink, fill] of [
      ["bad", "--bad", "--bad-t"],
      ["warn", "--warn", "--warn-t"],
      ["ok", "--ok", "--ok-t"],
      ["accent", "--accent", "--accent-t"],
    ] as const) {
      expect(rule(`.badge-${tone}`), tone).toContain(`color: var(${ink})`);
      expect(rule(`.badge-${tone}`), tone).toContain(`background: var(${fill})`);
    }
    expect(rule(".badge-neutral")).toMatch(/background:\s*var\(--surface2\)/);
  });

  it("draws badges in 11px 600 mono with a 4px radius", () => {
    const badge = rule(".badge") ?? "";
    expect(badge).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(badge).toMatch(/font-size:\s*var\(--fs-11\)/);
    expect(badge).toMatch(/font-weight:\s*600/);
    expect(badge).toMatch(/border-radius:\s*var\(--radius-control\)/);
  });

  it("colours the row kind label --c1 for LOG and --warn for REPORT", () => {
    expect(rule(".kind-log")).toMatch(/color:\s*var\(--c1\)/);
    expect(rule(".kind-report")).toMatch(/color:\s*var\(--warn\)/);
  });

  it("colours stat values by tone", () => {
    for (const [tone, colour] of [
      ["ok", "--ok"],
      ["warn", "--warn"],
      ["bad", "--bad"],
    ] as const)
      expect(rule(`.tone-${tone}`), tone).toContain(`color: var(${colour})`);
  });
});

describe("Report viewer layout", () => {
  it("lets the viewer container grow to 1180px from 900px up, inside the gutter", () => {
    expect(rule("main.viewer", media("min-width: 900px"))).toMatch(/max-width:\s*1180px/);
  });

  it("lays the overview tiles in 2 columns on a phone and 4 from 900px up", () => {
    expect(rule(".tiles")).toMatch(/grid-template-columns:\s*repeat\(2,/);
    expect(rule(".tiles", media("min-width: 900px"))).toMatch(
      /grid-template-columns:\s*repeat\(4,/,
    );
  });

  it("draws a section as a bordered panel with the count badge on the right of the summary", () => {
    expect(rule(".section")).toMatch(/border:\s*1px solid var\(--line\)/);
    expect(rule(".section summary")).toMatch(/justify-content:\s*space-between/);
  });
});

describe("Drive Log viewer layout", () => {
  it("lets the page scroll vertically over the chart and nothing else, so touches reach our plugin", () => {
    expect(rule(".u-over")).toMatch(/touch-action:\s*pan-y/);
    expect(rule(".chart-overview")).toMatch(/touch-action:\s*none/);
  });

  it("fixes the readout's time column at 84px and its rows at 22px", () => {
    expect(rule(".readout-time")).toMatch(/width:\s*84px/);
    expect(rule(".readout-slot")).toMatch(/height:\s*22px/);
    expect(rule(".readout-slot")).toMatch(/white-space:\s*nowrap/);
  });

  it("writes readout values in tabular mono so digits keep their width", () => {
    const value = rule(".readout-value") ?? "";
    expect(value).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(value).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it("sizes the phone readout columns to their content and never clips a slot, so units stay whole", () => {
    expect(rule(".readout-slots")).toMatch(/grid-template-columns:\s*repeat\(3,\s*max-content\)/);
    expect(rule(".readout-slot")).not.toMatch(/overflow:\s*hidden/);
    expect(rule(".readout-value")).toMatch(/font-size:\s*var\(--fs-12\)/);
    expect(rule(".readout-unit")).toMatch(/font-size:\s*9px/);
  });

  // The fit itself (375 and 390 px phones) needs a browser; these are the rules it relies on.
  it("keeps the phone readout tight: small padding and gaps, a 6px dot, and the 84px time column", () => {
    expect(rule(".readout")).toMatch(/padding:\s*6px\s+6px/);
    expect(rule(".readout")).toMatch(/gap:\s*6px/);
    expect(rule(".readout-slots")).toMatch(/column-gap:\s*4px/);
    expect(rule(".readout-slot")).toMatch(/gap:\s*2px/);
    expect(rule(".readout-dot")).toMatch(/width:\s*6px/);
    expect(rule(".readout-time")).toMatch(/width:\s*84px/);
  });

  it("lays the readout slots in 3 columns on a phone and 118px columns from 900px up", () => {
    expect(rule(".readout-slots")).toMatch(/grid-template-columns:\s*repeat\(3,/);
    expect(rule(".readout-slots", media("min-width: 900px"))).toMatch(
      /grid-template-columns:\s*repeat\(auto-fill,\s*118px\)/,
    );
  });

  it("draws the overview strip 34px high with the zoom window outlined in --accent", () => {
    expect(rule(".chart-overview")).toMatch(/height:\s*34px/);
    expect(rule(".chart-window")).toMatch(/border:\s*1\.5px solid var\(--accent\)/);
  });

  it("draws the cursor as a 1.2px --ink line", () => {
    const line = rule(".chart-card .u-cursor-x") ?? "";
    expect(line).toMatch(/1\.2px/);
    expect(line).toMatch(/var\(--ink\)/);
  });

  it("puts the chart in one bordered panel", () => {
    expect(rule(".chart-card")).toMatch(/border:\s*1px solid var\(--line\)/);
  });
});

describe("desktop overrides", () => {
  /** `source` with every @media block cut out, so only base rules are left. */
  function withoutMedia(source: string): string {
    let out = "";
    let i = 0;
    while (i < source.length) {
      const at = source.indexOf("@media", i);
      if (at < 0) return out + source.slice(i);
      out += source.slice(i, at);
      let depth = 0;
      let j = source.indexOf("{", at);
      do {
        depth += source[j] === "{" ? 1 : source[j] === "}" ? -1 : 0;
        j++;
      } while (depth > 0 && j < source.length);
      i = j;
    }
    return out;
  }

  it("has no base rule for a selector after the 900px block that overrides it", () => {
    const start = css.indexOf("@media (min-width: 900px)");
    const body = media("min-width: 900px");
    const end = css.indexOf("{", start) + 1 + body.length + 1;
    const later = withoutMedia(css.slice(end));
    const props = (decls: string) => [...decls.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1] ?? "");
    const shadowed = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m) =>
      (m[1] ?? "")
        .split(",")
        .map((sel) => sel.trim())
        .filter((sel) => {
          const laterProps = props(rule(sel, later) ?? "");
          return props(m[2] ?? "").some((name) => laterProps.includes(name));
        }),
    );
    expect(body).toContain("max-width");
    expect(shadowed).toEqual([]);
  });
});

describe("IUMPR table", () => {
  it("fixes the layout so the columns line up under their headers, with numbers right-aligned", () => {
    expect(rule(".iumpr-table")).toMatch(/table-layout:\s*fixed/);
    expect(rule(".iumpr-table")).toMatch(/width:\s*100%/);
    for (const sel of [
      ".iumpr-table th:nth-child(2)",
      ".iumpr-table th:nth-child(3)",
      ".iumpr-table td.mono-value",
    ])
      expect(rule(sel), sel).toMatch(/text-align:\s*right/);
  });

  it("gives the Monitor column a share of the width and wraps long names", () => {
    expect(rule(".iumpr-table th:first-child")).toMatch(/width:\s*\d+%/);
    expect(rule(".iumpr-name")).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe("IUMPR table on a phone", () => {
  it("sizes cells by border-box, so the column percentages are the real widths", () => {
    expect(rule(".iumpr-table th")).toMatch(/box-sizing:\s*border-box/);
    expect(rule(".iumpr-table td")).toMatch(/box-sizing:\s*border-box/);
  });

  it("lets the ratio bar shrink to its cell instead of holding a minimum width", () => {
    expect(css).not.toMatch(/\.ratio-bar \{[^}]*min-width/);
    expect(rule(".iumpr-ratio .ratio-bar")).toMatch(/max-width:\s*100%/);
  });
});

describe("unbreakable parts", () => {
  it("keeps a .nowrap part on one line", () => {
    expect(rule(".nowrap")).toMatch(/white-space:\s*nowrap/);
  });
});
