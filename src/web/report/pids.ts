import type { FreezeFrame, PidRow } from "../../core/report.ts";
import { keyed } from "./compare.ts";
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

/** Rows under their group, in group order. Support rows are dropped. */
export function groupPids(rows: PidRow[]): PidGroup[] {
  const kept = rows.filter((r) => !isSupportRow(r));
  return GROUPS.map(([group]) => ({
    group,
    rows: kept.filter((r) => groupOf(r) === group),
  })).filter((g) => g.rows.length > 0);
}

const pidKeys = (rows: PidRow[]) => keyed(rows, (r) => `${r.pid}|${r.description}`);

/** Each row of this Report to the compared row's value text, where the value differs. Empty with none. */
export function pidWas(rows: PidRow[], other: PidRow[] | null): Map<PidRow, string> {
  const was = new Map<PidRow, string>();
  if (!other) return was;
  const before = new Map(pidKeys(other));
  for (const [k, r] of pidKeys(rows)) {
    const b = before.get(k);
    if (b && b.value !== r.value) was.set(r, b.value);
  }
  return was;
}

/** `pidWas` across freeze frames, which match on their title. */
export function freezeFrameWas(
  frames: FreezeFrame[],
  other: FreezeFrame[] | null,
): Map<PidRow, string> {
  const was = new Map<PidRow, string>();
  if (!other) return was;
  const before = new Map(keyed(other, (f) => f.title));
  for (const [k, f] of keyed(frames, (f) => f.title)) {
    const b = before.get(k);
    if (b) for (const [r, v] of pidWas(f.rows, b.rows)) was.set(r, v);
  }
  return was;
}

/** Rows whose name contains the text, ignoring case. A blank filter keeps every row. */
export function filterPids(rows: PidRow[], query: string): PidRow[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.description.toLowerCase().includes(q)) : rows;
}

const isTimer = (r: PidRow) => /EI-AECD/i.test(r.description);

/** Drops EI-AECD timers at 0 here and at 0 or absent in the compared Report; says how many. */
export function hideIdleTimers(
  rows: PidRow[],
  other: PidRow[] | null,
): { rows: PidRow[]; hidden: number } {
  const before = new Map(pidKeys(other ?? []));
  const idle = new Set<PidRow>();
  for (const [k, r] of pidKeys(rows)) {
    if (!isTimer(r) || num(r.value) !== 0) continue;
    const b = before.get(k);
    if (!b || num(b.value) === 0) idle.add(r);
  }
  return { rows: rows.filter((r) => !idle.has(r)), hidden: idle.size };
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
