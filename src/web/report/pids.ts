import type { PidRow } from "../../core/report.ts";
import { dec, fmtNum, num } from "./numbers.ts";

/** Mode $01 groups, in display order. A row goes to the first group whose pattern matches. */
export const GROUPS: [string, RegExp][] = [
  ["EGR", /\bEGR\b|exhaust gas recirculation/i],
  ["Air, boost & turbo", /air flow|intake|manifold|turbo|\bVGT\b|wastegate|charge air|barometric/i],
  ["Fuel", /fuel|injection/i],
  [
    "Exhaust & aftertreatment",
    /exhaust|\bDPF\b|\bPF_|NOx|reagent|\bO2\b|lambda|\bNTE\b|aftertreatment|regen/i,
  ],
  ["Engine & driver", /load|RPM|speed|pedal|torque|voltage|PTO|trans|glow/i],
  ["Temperatures", /temperature/i],
  ["Counters & run time", /time|distance|warm-ups|AECD/i],
  ["Other", /./],
];

/** Capability rows (what the ECU supports), not readings. */
export const isSupportRow = (r: PidRow): boolean =>
  /^support|supported|^location of|OBD requirements|external test|^fuel type|freeze frame DTC|Auxiliary inputs/i.test(
    r.description,
  );

export type PidGroup = { group: string; rows: PidRow[] };

const groupOf = (r: PidRow): string =>
  GROUPS.find(([, re]) => re.test(r.description))?.[0] ?? "Other";

/** Rows under their group, in group order. Support rows are dropped unless `support` is set. */
export function groupPids(rows: PidRow[], opts: { support?: boolean } = {}): PidGroup[] {
  const kept = rows.filter((r) => opts.support || !isSupportRow(r));
  return GROUPS.map(([group]) => ({
    group,
    rows: kept.filter((r) => groupOf(r) === group),
  })).filter((g) => g.rows.length > 0);
}

const PAIRS: [string, RegExp, RegExp][] = [
  ["EGR A", /^Commanded EGR A duty/i, /^Actual EGR A duty/i],
  ["Intake throttle A", /^Commanded intake air flow A/i, /^Relative intake air flow A/i],
  ["VGT A", /^Commanded variable geometry turbo A/i, /^Variable geometry turbo A position/i],
  ["Wastegate A", /^Commanded wastegate A/i, /^Wastegate A position/i],
  ["Fuel rail pressure A", /^Commanded fuel rail pressure A/i, /^Fuel rail pressure A/i],
];

export type PairCard = {
  label: string;
  commanded: string;
  actual: string;
  units: string;
  /** Bar widths, 0-100. */
  commandedPct: number;
  actualPct: number;
  /** Actual minus commanded, signed. */
  error: string;
  /** The gap is worth a look: 10 points of a percent pair, 5 % of the larger value otherwise. */
  big: boolean;
};

/** Commanded-versus-actual cards for the pairs a Report lists. */
export function pairCards(rows: PidRow[]): PairCard[] {
  const cards: PairCard[] = [];
  for (const [label, commandedRe, actualRe] of PAIRS) {
    const c = rows.find((r) => commandedRe.test(r.description) && !isSupportRow(r));
    const a = rows.find((r) => actualRe.test(r.description) && !isSupportRow(r));
    if (!c || !a || !Number.isFinite(num(c.value)) || !Number.isFinite(num(a.value))) continue;
    const cv = num(c.value);
    const av = num(a.value);
    const pct = /%/.test(c.units);
    const top = pct ? 100 : Math.max(cv, av) * 1.1 || 1;
    const err = av - cv;
    const digits = Math.max(dec(c.value), dec(a.value));
    cards.push({
      label,
      commanded: c.value,
      actual: a.value,
      units: c.units,
      commandedPct: Math.min(100, (cv / top) * 100),
      actualPct: Math.min(100, (av / top) * 100),
      error: `${err >= 0 ? "+" : "−"}${fmtNum(String(+Math.abs(err).toFixed(digits)))}`,
      big: pct ? Math.abs(err) >= 10 : Math.abs(err) >= Math.max(cv, av) * 0.05,
    });
  }
  return cards;
}
