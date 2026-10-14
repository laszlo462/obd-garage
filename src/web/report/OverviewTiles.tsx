import type { ParsedReport } from "../../core/report.ts";
import { type Comparison, codeCount } from "./compare.ts";
import { fmtNum } from "./numbers.ts";

type Tone = "ok" | "warn" | "bad" | "muted";

type Tile = { label: string; value: string; unit?: string; tone: Tone; change: string | null };

const MIL_WORD = { on: "ON", off: "OFF", unknown: "?" } as const;

function tiles(report: ParsedReport, c: Comparison): Tile[] {
  const mil = report.overview?.mil ?? "unknown";
  const stored = codeCount(report, "confirmed");
  const pending = codeCount(report, "pending");
  const tests = (report.monitors ?? []).flatMap((e) => e.tests);
  const incomplete = tests.filter((t) => t.state === "incomplete").length;
  const since = report.overview?.additional.find((r) => /Distance.*since/i.test(r.description));
  return [
    {
      label: "MIL",
      value: MIL_WORD[mil],
      tone: mil === "on" ? "bad" : mil === "off" ? "ok" : "muted",
      change: c.overview.mil,
    },
    {
      label: "Codes",
      value: String(stored),
      unit: `stored · ${pending} pending`,
      tone: stored ? "bad" : pending ? "warn" : "ok",
      change: c.overview.codes,
    },
    {
      label: "Monitors",
      value: `${tests.length - incomplete}/${tests.length}`,
      tone: incomplete ? "warn" : "ok",
      change: c.overview.monitors,
    },
    {
      label: "Since clear",
      value: since ? fmtNum(since.value) : "–",
      unit: since ? (since.units === "miles" ? "mi" : since.units) : undefined,
      tone: "muted",
      change: c.overview.sinceClear,
    },
  ];
}

/** The four overview tiles: a mono value and, when comparing, the change line. */
export function OverviewTiles(props: { report: ParsedReport; comparison: Comparison }) {
  return (
    <div class="tiles">
      {tiles(props.report, props.comparison).map((t) => (
        // biome-ignore lint/a11y/useSemanticElements: a tile is a labelled trio of spans, not form controls; a fieldset would add form semantics
        <div key={t.label} class="tile" role="group" aria-label={t.label}>
          <span class="tile-label">{t.label}</span>
          <span class={`tile-value tone-${t.tone}`}>{t.value}</span>
          {t.unit && <small class="tile-unit">{t.unit}</small>}
          {t.change && <span class="tile-change">{t.change}</span>}
        </div>
      ))}
    </div>
  );
}
