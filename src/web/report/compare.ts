import type { Dtc, ParsedReport } from "../../core/report.ts";
import { delta } from "./numbers.ts";

export type Comparison = {
  /** `dtcKey`s of the current Report's codes that the other Report lacks. */
  newCodes: string[];
  /** `dtcKey`s of the codes both Reports list. */
  alsoIn: string[];
  /** The other Report's codes this Report lacks, in its order, one per `dtcKey`. */
  goneCodes: Dtc[];
  /** `dtcKey` to the statuses added and removed, for codes both Reports list whose statuses differ. */
  statusChanges: Record<string, { added: string[]; removed: string[] }>;
  /** Monitor key to the status text the other Report printed, where the state differs. */
  monitorWas: Record<string, string>;
  /** Mode $06 key to the value text the other Report printed. */
  mode06Was: Record<string, string>;
  /** The change line under each overview tile; null when there is nothing to say. */
  overview: {
    mil: string | null;
    codes: string | null;
    monitors: string | null;
    sinceClear: string | null;
  };
};

export const dtcKey = (d: Pick<Dtc, "ecu" | "code">): string => `${d.ecu}|${d.code}`;

/**
 * Keys that repeat (same name twice) get an occurrence suffix so rows line up across Reports.
 * Returns each item with its key.
 */
export function keyed<T>(items: T[], keyFn: (item: T) => string): [string, T][] {
  const seen: Record<string, number> = {};
  return items.map((item) => {
    const k = keyFn(item);
    seen[k] = (seen[k] ?? 0) + 1;
    return [`${k}#${seen[k]}`, item];
  });
}

export const monitorKeys = (r: ParsedReport) =>
  keyed(
    (r.monitors ?? []).flatMap((e) => e.tests.map((t) => ({ ecu: e.ecu, t }))),
    ({ ecu, t }) => `${ecu}|${t.name}`,
  ).map(([k, { t }]) => [k, t] as const);

export const mode06Keys = (r: ParsedReport) => keyed(r.mode06 ?? [], (t) => `${t.mid} ${t.tid}`);

/** Compare the current Report with another one (or none). Every field is empty with none. */
export function compareReports(current: ParsedReport, other: ParsedReport | null): Comparison {
  const c: Comparison = {
    newCodes: [],
    alsoIn: [],
    goneCodes: [],
    statusChanges: {},
    monitorWas: {},
    mode06Was: {},
    overview: { mil: null, codes: null, monitors: null, sinceClear: null },
  };
  if (!other) return c;
  const before = new Set((other.dtcs ?? []).map(dtcKey));
  const now = new Set((current.dtcs ?? []).map(dtcKey));
  for (const d of current.dtcs ?? [])
    (before.has(dtcKey(d)) ? c.alsoIn : c.newCodes).push(dtcKey(d));
  for (const d of other.dtcs ?? []) {
    if (now.has(dtcKey(d))) continue;
    now.add(dtcKey(d));
    c.goneCodes.push(d);
  }
  const codesBefore = new Map((other.dtcs ?? []).map((d) => [dtcKey(d), d] as const));
  for (const d of current.dtcs ?? []) {
    const was = codesBefore.get(dtcKey(d));
    if (!was || dtcKey(d) in c.statusChanges) continue;
    const added = d.statuses.filter((s) => !was.statuses.includes(s));
    const removed = was.statuses.filter((s) => !d.statuses.includes(s));
    if (added.length || removed.length) c.statusChanges[dtcKey(d)] = { added, removed };
  }
  const monitorsBefore = new Map(monitorKeys(other));
  for (const [k, t] of monitorKeys(current)) {
    const was = monitorsBefore.get(k);
    if (was && was.state !== t.state) c.monitorWas[k] = was.status;
  }
  const mode06Before = new Map(mode06Keys(other));
  for (const [k] of mode06Keys(current)) {
    const was = mode06Before.get(k);
    if (was) c.mode06Was[k] = was.valueText;
  }
  c.overview = {
    mil: milLine(current, other),
    codes: codesLine(current, other),
    monitors: monitorsLine(current, other),
    sinceClear: sinceClearLine(current, other),
  };
  return c;
}

const MIL_WORD = { on: "ON", off: "OFF", unknown: "?" } as const;

function milLine(current: ParsedReport, other: ParsedReport): string {
  const now = current.overview?.mil ?? "unknown";
  const was = other.overview?.mil ?? "unknown";
  return now === was ? "no change" : `was ${MIL_WORD[was]}`;
}

/** Distinct codes whose status text has `word` (confirmed, pending, permanent). */
export const codeCount = (r: ParsedReport, word: string) =>
  new Set(
    (r.dtcs ?? [])
      .filter((d) => d.statuses.some((s) => s.toLowerCase().includes(word)))
      .map((d) => d.code),
  ).size;

function codesLine(current: ParsedReport, other: ParsedReport): string {
  const parts = (["stored", "pending"] as const)
    .map((kind) => {
      const word = kind === "stored" ? "confirmed" : "pending";
      const d = codeCount(current, word) - codeCount(other, word);
      return d === 0 ? "" : `${d > 0 ? "+" : "−"}${Math.abs(d)} ${kind}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "no change";
}

const completeCount = (r: ParsedReport) =>
  (r.monitors ?? []).flatMap((e) => e.tests).filter((t) => t.state === "complete").length;

function monitorsLine(current: ParsedReport, other: ParsedReport): string {
  const d = completeCount(current) - completeCount(other);
  if (d === 0) return "no change";
  return `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} complete`;
}

const SINCE_CLEAR = /Distance.*since/i;

function sinceClearLine(current: ParsedReport, other: ParsedReport): string | null {
  const now = current.overview?.additional.find((r) => SINCE_CLEAR.test(r.description));
  const was = other.overview?.additional.find((r) => SINCE_CLEAR.test(r.description));
  if (!now || !was) return null;
  const d = delta(now.value, was.value);
  if (d === "0") return "no change";
  return `${d} ${now.units === "miles" ? "mi" : now.units}`.trim();
}
