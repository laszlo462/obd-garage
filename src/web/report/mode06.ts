import type { Mode06Test, Numeric } from "../../core/report.ts";

/** Limits at these magnitudes are the scaling's end stops: "no limit on this side". */
const SENTINELS = [
  327.67, 327.68, 655.35, 3276.7, 3276.8, 3003.6, 6553.5, 32767, 32768, 65535, 2147483647,
  4294967295,
];

export const isOpen = (x: Numeric): boolean =>
  x === null || !Number.isFinite(x) || SENTINELS.some((s) => Math.abs(Math.abs(x) - s) <= s * 2e-5);

export type Headroom = { abs: number; frac: number | null; side: "min" | "max" };

/** Distance to the nearest real limit. The fraction (of the min-max span) exists for a two-sided band only. */
export function headroom(t: Mode06Test): Headroom | null {
  const lo = isOpen(t.min) ? null : t.min;
  const hi = isOpen(t.max) ? null : t.max;
  const v = t.value;
  if (v === null || !Number.isFinite(v) || (lo === null && hi === null)) return null;
  const dLo = lo === null ? Number.POSITIVE_INFINITY : v - lo;
  const dHi = hi === null ? Number.POSITIVE_INFINITY : hi - v;
  const frac = lo !== null && hi !== null && hi > lo ? Math.min(dLo, dHi) / (hi - lo) : null;
  return { abs: Math.min(dLo, dHi), frac, side: dLo < dHi ? "min" : "max" };
}

export type Band = "bad" | "warn" | "ok";

/** The headroom colour: bad under 5 %, warn under 20 %, ok otherwise. A failed test is bad. */
export function band(t: Mode06Test): Band | null {
  if (/fail/i.test(t.result)) return "bad";
  const frac = headroom(t)?.frac;
  if (frac === null || frac === undefined) return null;
  return frac < 0.05 ? "bad" : frac < 0.2 ? "warn" : "ok";
}

/** A function from a value to 0-100 along the bar, or null when there is nothing to plot. */
export function scaleFor(t: Mode06Test, other?: Mode06Test | null): ((x: number) => number) | null {
  const limits = [t.min, t.max, other?.min, other?.max].filter(
    (x): x is number => x !== null && x !== undefined && !isOpen(x),
  );
  const values = [t.value, other?.value].filter(
    (x): x is number => x !== null && x !== undefined && Number.isFinite(x),
  );
  const points = [...limits, ...values];
  if (points.length === 0) return null;
  let a = Math.min(...points);
  let b = Math.max(...points);
  const span = b - a || Math.max(Math.abs(a) * 0.2, 1);
  // Open sides get extra room so the value does not sit on the edge and the pass zone runs on.
  a -= span * (isOpen(t.min) ? 0.8 : 0.08);
  b += span * (isOpen(t.max) ? 0.8 : 0.08);
  return (x) => Math.max(0, Math.min(100, ((x - a) / (b - a)) * 100));
}

/** The tests with the least headroom first: failures, then the smallest fraction, then the rest. */
export function sortLeastHeadroom(tests: Mode06Test[]): Mode06Test[] {
  const rank = (t: Mode06Test) => (/fail/i.test(t.result) ? -1 : (headroom(t)?.frac ?? 9));
  return [...tests].sort((x, y) => rank(x) - rank(y));
}

/** Misfire MIDs ($A1 to $B1) are shown as one table, not as rows. */
export const isMisfire = (t: Mode06Test): boolean => {
  const n = Number.parseInt(t.mid.slice(1), 16);
  return n >= 0xa1 && n <= 0xb1 && /misfire/i.test(t.midName);
};

const cylinderOf = (t: Mode06Test) => /Cylinder\s*(\d+)/i.exec(t.midName)?.[1] ?? t.mid;

export type MisfireTable = {
  cylinders: string[];
  rows: { tid: string; name: string; cells: (Mode06Test | null)[] }[];
};

/** One row per TID, one column per cylinder; a cell is null where the Report lists no such pair. */
export function groupMisfires(tests: Mode06Test[]): MisfireTable {
  const mis = tests.filter(isMisfire);
  const cylinders = [...new Set(mis.map(cylinderOf))];
  const tids = [...new Set(mis.map((t) => t.tid))].sort();
  return {
    cylinders,
    rows: tids.map((tid) => ({
      tid,
      name: (mis.find((t) => t.tid === tid)?.tidName ?? "")
        .replace(/\(.*?\)/g, "")
        .replace(/misfire counts for /i, "")
        .trim()
        .slice(0, 48),
      cells: cylinders.map((c) => mis.find((t) => t.tid === tid && cylinderOf(t) === c) ?? null),
    })),
  };
}
