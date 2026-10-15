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

  it("gives an Unassigned row's tick label and its View link a 44px tap target", () => {
    expect(rule(".row-check")).toMatch(/min-height:\s*var\(--touch\)/);
    expect(rule(".unassigned-row .btn-default")).toMatch(/min-height:\s*var\(--touch\)/);
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

  it("splits the phone readout into three equal columns that can shrink, so any set of Channels fits at 360px", () => {
    expect(rule(".readout-slots")).toMatch(
      /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(rule(".readout-slot")).toMatch(/min-width:\s*0/);
    // A unit gives way before the value does; the slot itself never clips.
    expect(rule(".readout-unit")).toMatch(/overflow:\s*hidden/);
    expect(rule(".readout-unit")).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule(".readout-value")).toMatch(/flex:\s*none/);
    expect(rule(".readout-slot")).not.toMatch(/overflow:\s*hidden/);
    expect(rule(".readout-value")).toMatch(/font-size:\s*var\(--fs-12\)/);
    expect(rule(".readout-unit")).toMatch(/font-size:\s*9px/);
  });

  it("gives the readout slots the whole width, without a list's indent", () => {
    expect(rule(".readout-slots")).toMatch(/margin:\s*0;/);
    expect(rule(".readout-slots")).toMatch(/padding:\s*0;/);
    expect(rule(".readout-slots")).toMatch(/list-style:\s*none/);
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

describe("Channel picker", () => {
  it("scrolls the chips sideways with no scrollbar and a 1px --line border on each", () => {
    expect(rule(".chips")).toMatch(/overflow-x:\s*auto/);
    expect(rule(".chips")).toMatch(/scrollbar-width:\s*none/);
    expect(rule(".chip")).toMatch(/border:\s*1px solid var\(--line\)/);
  });

  it("borders a selected chip in its series colour with a 12% tint and a leading dot", () => {
    const selected = rule('.chip[aria-pressed="true"]') ?? "";
    expect(selected).toMatch(/border-color:\s*var\(--chip\)/);
    expect(selected).toMatch(/color-mix\(in srgb,\s*var\(--chip\)\s*12%,\s*transparent\)/);
    expect(rule(".chip-dot")).toMatch(/background:\s*var\(--chip\)/);
    expect(rule('.chip:not([aria-pressed="true"]) .chip-dot')).toMatch(/display:\s*none/);
  });

  it("draws a Notice with a --warn-t fill and --warn text", () => {
    expect(rule(".notice")).toMatch(/background:\s*var\(--warn-t\)/);
    expect(rule(".notice")).toMatch(/color:\s*var\(--warn\)/);
  });

  it("writes the data table in mono 12px, scrolling sideways, and tints the cursor row", () => {
    expect(rule(".data-table-scroll")).toMatch(/overflow-x:\s*auto/);
    expect(rule(".data-table table")).toMatch(/font:\s*var\(--fs-12\)\s+var\(--font-mono\)/);
    expect(rule('.data-table tr[aria-current="true"]')).toMatch(/background:\s*var\(--accent-t\)/);
  });
});

describe("Drive Log viewer columns", () => {
  const desktop = media("min-width: 900px");

  it("stacks the Events panel under the chart on a phone", () => {
    const phone = rule(".viewer-grid", css.slice(0, css.indexOf("@media (min-width: 900px)")));
    expect(phone).toMatch(/display:\s*grid/);
    expect(phone).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  });

  it("puts the chart and a 360px side column side by side from 900px up, the side column sticky", () => {
    expect(rule(".viewer-grid", desktop)).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+360px/,
    );
    expect(rule(".viewer-side", desktop)).toMatch(/position:\s*sticky/);
    expect(rule(".viewer-side", desktop)).toMatch(/top:\s*\d+px/);
  });

  it("declares the base column rules before the 900px block, so they cannot shadow its overrides", () => {
    const block = css.indexOf("@media (min-width: 900px)");
    for (const sel of [".viewer-grid", ".viewer-side"]) {
      const at = css.search(new RegExp(`^${sel.replace(".", "\\.")}[ ,{]`, "m"));
      expect(at, sel).toBeGreaterThanOrEqual(0);
      expect(at, sel).toBeLessThan(block);
    }
  });
});

describe("Events list markers", () => {
  it("shapes the three kinds differently: accent dot-and-dash, tinted square, hatched square", () => {
    expect(rule(".event-marker-dashed-line")).toMatch(/var\(--accent\)/);
    expect(rule(".event-marker-fill")).toMatch(/background:\s*var\(--ev-generic\)/);
    expect(rule(".event-marker-hatch")).toMatch(/repeating-linear-gradient\(\s*45deg/);
    expect(rule(".event-marker-hatch")).toMatch(/var\(--ev-pack\)/);
  });

  it("gives every marker a fixed size, so it cannot stretch across the 22px column", () => {
    for (const sel of [".event-marker-fill", ".event-marker-hatch", ".event-marker-dashed-line"]) {
      expect(rule(sel), sel).toMatch(/(^|[;\s])width:\s*\d+px/);
      expect(rule(sel), sel).toMatch(/(^|[;\s])height:\s*\d+px/);
    }
    expect(rule(".event-marker")).toMatch(/justify-self:\s*center/);
  });

  it("gives the marker column 22px, mutes the detail and the not-run lines, and right-aligns the times in mono", () => {
    expect(rule(".event-row")).toMatch(/grid-template-columns:\s*22px\s/);
    expect(rule(".event-detail")).toMatch(/color:\s*var\(--muted\)/);
    expect(rule(".event-notrun")).toMatch(/font-style:\s*italic/);
    expect(rule(".event-notrun")).toMatch(/color:\s*var\(--muted\)/);
    expect(rule(".event-times")).toMatch(/text-align:\s*right/);
    expect(rule(".event-times")).toMatch(/font-family:\s*var\(--font-mono\)/);
  });
});

describe("Note bar", () => {
  const desktop = media("min-width: 900px");

  it("fixes the bar to the bottom with safe-area padding, over the content and under the sheets", () => {
    const bar = rule(".note-bar") ?? "";
    expect(bar).toMatch(/position:\s*fixed/);
    expect(bar).toMatch(/bottom:\s*0/);
    expect(bar).toMatch(/env\(safe-area-inset-bottom\)/);
    const z = (sel: string) => Number(/z-index:\s*(\d+)/.exec(rule(sel) ?? "")?.[1] ?? 0);
    expect(z(".note-bar")).toBeGreaterThan(0);
    expect(z(".scrim")).toBeGreaterThan(z(".note-bar"));
  });

  it("floats a centred 420px bar from 900px up", () => {
    const wide = rule(".note-bar", desktop) ?? "";
    expect(wide).toMatch(/max-width:\s*420px/);
    expect(wide).toMatch(/left:\s*50%/);
    expect(wide).toMatch(/translateX\(-50%\)/);
  });

  it("declares the base bar rules before the 900px block, so they cannot shadow its overrides", () => {
    const at = css.search(/^\.note-bar[ ,{]/m);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(css.indexOf("@media (min-width: 900px)"));
  });

  it("draws the steppers 52 by 44px with a 9.5px caption", () => {
    expect(rule(".note-step")).toMatch(/width:\s*52px/);
    expect(rule(".note-step")).toMatch(/height:\s*44px/);
    expect(rule(".note-step small")).toMatch(/font-size:\s*9\.5px/);
  });

  it("gives the centre button a fixed share of the bar, so nothing reflows while stepping", () => {
    const here = rule(".note-here") ?? "";
    expect(here).toMatch(/flex:\s*1/);
    expect(here).toMatch(/min-width:\s*0/);
    expect(here).toMatch(/white-space:\s*nowrap/);
    expect(here).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it("turns the centre button --note on a pinned row", () => {
    expect(rule(".note-here-pinned")).toMatch(/background:\s*var\(--note\)/);
  });

  it("keeps the viewer's content clear of the bar", () => {
    expect(rule("main.viewer")).toMatch(/padding-bottom:\s*calc\(/);
  });

  it("stops touch gestures on the steppers from zooming or selecting text", () => {
    expect(rule(".note-step")).toMatch(/touch-action:\s*manipulation/);
    expect(rule(".note-step")).toMatch(/user-select:\s*none/);
    expect(rule(".note-step")).toMatch(/-webkit-touch-callout:\s*none/);
  });
});

describe("pinned Notes on the chart", () => {
  it("gives a pin head a 36px hit area over a --note head, above the first panel", () => {
    expect(rule(".pin-heads")).toMatch(/position:\s*relative/);
    expect(rule(".pin-heads")).toMatch(/height:\s*0/);
    const head = rule(".pin-head") ?? "";
    expect(head).toMatch(/position:\s*absolute/);
    expect(head).toMatch(/width:\s*36px/);
    expect(head).toMatch(/height:\s*36px/);
    expect(head).toMatch(/translateX\(-50%\)/);
    expect(rule(".pin-head i")).toMatch(/background:\s*var\(--note\)/);
  });

  it("marks a Note in the Events list and the legend with --note", () => {
    expect(rule(".event-marker-pin")).toMatch(/var\(--note\)/);
    expect(rule(".legend-swatch-note")).toMatch(/background:\s*var\(--note\)/);
  });
});

describe("Note sheets and lists", () => {
  it("fills the width with the text field, and keeps it in the body font", () => {
    expect(rule(".note-field")).toMatch(/width:\s*100%/);
    expect(rule(".note-field")).toMatch(/font:\s*inherit/);
  });

  it("makes each listed Note a full-width tap target that wraps long text", () => {
    expect(rule(".note-row")).toMatch(/width:\s*100%/);
    expect(rule(".note-text")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule(".note-view-text")).toMatch(/white-space:\s*pre-wrap/);
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
