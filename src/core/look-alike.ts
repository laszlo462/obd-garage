import { type ChannelKey, channel, STANDARD_CATALOGUE } from "./channels.ts";
import type { FreezeFrame } from "./report.ts";
import type { EventDraft, NotApplicable, Rule, RuleContext, RuleLog } from "./rules.ts";
import { normaliseUnit } from "./units.ts";

/** Id of the rule. A Vehicle Profile overrides its tolerances through `params["core.look-alike"]`. */
export const LOOK_ALIKE_ID = "core.look-alike";

/** Spans must last this long (seconds), and spans closer together than this merge. */
const MIN_SPAN_S = 2;
/**
 * Timestamp jitter allowed on both limits above. OBDLink timestamps are in milliseconds and rows arrive about
 * 0.5 s apart, so a run that is "2 s" in the vehicle can measure 1.999 s. A span of at least 2 - JITTER_S
 * counts, and spans less than 2 - JITTER_S apart merge.
 */
const JITTER_S = 0.05;
const MIN_SHARED = 3;

/** Default band: ±10 % of the freeze-frame value ... */
const DEFAULT_RELATIVE = 0.1;
/** ... but never narrower than this absolute amount, in the Reference Report's unit (lower-cased). */
const DEFAULT_MIN: Readonly<Record<string, number>> = {
  rpm: 100,
  "km/h": 8,
  mph: 5,
  "°c": 5,
  "°f": 9,
  "%": 5,
  kpa: 3,
  inhg: 1,
  psi: 0.5,
  v: 0.5,
  "lb/min": 0.5,
  "g/s": 0.5,
};

/**
 * Channels that are not driving conditions. A run-time counter only ever matches the frame once, so it
 * would stop every other Channel from matching.
 */
const NOT_CONDITIONS: ReadonlySet<ChannelKey> = new Set(["time", "runTime"]);

/** A per-Channel override from the Profile. Either field may be left out. `min` is in the report's unit. */
export type Tolerance = { relative?: number; min?: number };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function toleranceFor(ctx: RuleContext, key: ChannelKey, unit: string): Required<Tolerance> {
  const all = ctx.params[LOOK_ALIKE_ID];
  const override = isRecord(all) && isRecord(all[key]) ? all[key] : {};
  return {
    relative: finite(override.relative) ? override.relative : DEFAULT_RELATIVE,
    min: finite(override.min)
      ? override.min
      : (DEFAULT_MIN[normaliseUnit(unit).toLowerCase()] ?? 0),
  };
}

type Target = {
  key: ChannelKey;
  label: string;
  value: number;
  unit: string;
  /** Log values in the report's unit. */
  values: number[];
  lo: number;
  hi: number;
};

const fmt = (n: number) => String(Math.round(n * 10) / 10);

function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Merges spans less than `MIN_SPAN_S - JITTER_S` apart. */
function mergeSpans(spans: { t0: number; t1: number }[]): { t0: number; t1: number }[] {
  const out: { t0: number; t1: number }[] = [];
  for (const s of spans) {
    const last = out.at(-1);
    if (last && s.t0 - last.t1 < MIN_SPAN_S - JITTER_S) last.t1 = s.t1;
    else out.push({ ...s });
  }
  return out;
}

function targetsFrom(frame: FreezeFrame, log: RuleLog, ctx: RuleContext): { targets: Target[] } {
  const catalogue = ctx.catalogue ?? STANDARD_CATALOGUE;
  const seen = new Set<ChannelKey>();
  const targets: Target[] = [];
  for (const row of frame.rows) {
    if (row.number === null || row.units === "") continue;
    const m = catalogue.match(row.description);
    if (!m.known || NOT_CONDITIONS.has(m.key) || seen.has(m.key)) continue;
    seen.add(m.key);
    // A Channel the log lacks, or whose unit cannot convert to the report's, is not shared.
    const col = channel(log.channels, m.key, row.units);
    if (!col.ok) continue;
    const tol = toleranceFor(ctx, m.key, row.units);
    const half = Math.max(Math.abs(row.number) * tol.relative, tol.min);
    targets.push({
      key: m.key,
      label: m.label,
      value: row.number,
      unit: row.units,
      values: col.values,
      lo: row.number - half,
      hi: row.number + half,
    });
  }
  return { targets };
}

/**
 * Freeze-frame Look-alike: spans where every Channel shared with the Reference Report's freeze frame stays
 * inside its tolerance band for at least 2 s. Generic: the DTC and date come from the report, and the
 * Profile only tunes the bands.
 */
export const lookAlike: Rule = {
  id: LOOK_ALIKE_ID,
  needs: [],
  needsReferenceReport: true,
  run(log, ctx): EventDraft[] | NotApplicable {
    const reference = ctx.reference;
    const frame = reference?.freezeFrames?.[0];
    if (!reference || !frame) {
      return { notApplicable: "the Reference Report has no freeze frame" };
    }
    const { targets } = targetsFrom(frame, log, ctx);
    if (targets.length < MIN_SHARED) {
      const names = targets.map((t) => t.key).join(", ") || "none";
      return {
        notApplicable: `only ${targets.length} Channels shared with the freeze frame (${names}); need ${MIN_SHARED}`,
      };
    }

    const inBand = (i: number) =>
      targets.every((t) => {
        const v = t.values[i];
        return v !== undefined && v >= t.lo && v <= t.hi;
      });

    const spans: { t0: number; t1: number }[] = [];
    let start = -1;
    const close = (end: number) => {
      const t0 = log.t[start] ?? Number.NaN;
      // A row's values hold until the next row (held-row collapse), so the span runs to the row after the
      // last in-band one. At the end of the log there is none, so it ends at the last row.
      const t1 = log.t[end + 1] ?? log.t[end] ?? Number.NaN;
      if (t1 - t0 >= MIN_SPAN_S - JITTER_S) spans.push({ t0, t1 });
      start = -1;
    };
    for (let i = 0; i < log.t.length; i++) {
      if (inBand(i)) {
        if (start < 0) start = i;
      } else if (start >= 0) close(i - 1);
    }
    if (start >= 0) close(log.t.length - 1);

    const dtc = frame.dtc ?? "";
    const title = `Looks like the freeze frame (${dtc ? `${dtc}, ` : ""}${shortDate(reference.header.date)} report)`;
    const names = targets.map((t) => t.label).join(", ");
    return mergeSpans(spans).map((s) => ({
      kind: "span",
      t0: s.t0,
      t1: s.t1,
      title,
      text: `All ${targets.length} Channels shared with the freeze frame (${names}) stayed within their tolerance bands for ${fmt(s.t1 - s.t0)} s.`,
    }));
  },
};
