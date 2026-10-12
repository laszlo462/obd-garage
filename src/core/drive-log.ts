import { type Catalogue, type ChannelKey, STANDARD_CATALOGUE } from "./channels.ts";

export type DriveLogChannel = {
  label: string;
  /** The exported unit; undefined when the header has none. */
  unit?: string;
  /** The header exactly as exported. */
  header: string;
  /** False for an extra: a column no catalogue alias claims. */
  known: boolean;
  values: number[];
};

export type DriveLogRowCounts = {
  /** Non-blank data lines in the file. */
  read: number;
  /** Malformed rows: wrong field count or a non-numeric field. */
  skipped: number;
  /** All-zero rows logged before the adapter connected. */
  idle: number;
  /** Rows left after held-row collapse, one per refresh batch. */
  collapsed: number;
};

export type DriveLog = {
  /** `StartTime` as a naive local ISO time with no offset (ADR 0004), e.g. `2026-07-25T18:50:37.987`. */
  startTime: string;
  /** Seconds from the first to the last non-idle row. */
  duration: number;
  rows: DriveLogRowCounts;
  /** Tolerated problems, for the viewer ("12 rows skipped"). */
  warnings: string[];
  /** Raw `Time (sec)` of each collapsed row. Events and pinned Notes anchor on it. */
  t: number[];
  /** Every column except `Time (sec)`, keyed through the catalogue. Extras are kept. */
  channels: Record<ChannelKey, DriveLogChannel>;
};

export type DriveLogFailureCode =
  | "missing-bom"
  | "missing-start-time"
  | "bad-start-time"
  | "missing-time-column";

export type DriveLogResult =
  | { kind: "drive-log"; log: DriveLog }
  /** Looks like a Drive Log but cannot be read. Ingest turns this into a Failed Upload. */
  | { kind: "failed"; code: DriveLogFailureCode; reason: string }
  /** Some other file (a Report, random text). Not an error for this parser. */
  | { kind: "not-drive-log" };

export type DriveLogOptions = {
  /** Header-to-Channel mapping; a Vehicle Profile passes its extended catalogue. */
  catalogue?: Catalogue;
  /**
   * Channels whose change starts a new refresh batch. The first ones present are used; with none present,
   * every column counts. A Vehicle Profile may add its own (e.g. EGR position).
   */
  collapseKeys?: readonly ChannelKey[];
};

/** Standard Channels that OBDLink refreshes every batch, so a change in any marks a new batch. */
export const DEFAULT_COLLAPSE_KEYS: readonly ChannelKey[] = ["rpm", "maf", "map"];

const BOM = "﻿";
const START_LINE = /^#\s*StartTime\s*=/i;
const START_TIME =
  /^#\s*StartTime\s*=\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)\s*$/i;
const TIME_HEADER = "time (sec)";

const fail = (code: DriveLogFailureCode, reason: string): DriveLogResult => ({
  kind: "failed",
  code,
  reason,
});

const splitFields = (line: string) => line.split(",").map((s) => s.trim());
const isTimeHeader = (h: string) => h.toLowerCase().replace(/\s+/g, " ") === TIME_HEADER;

/** Converts `# StartTime = MM/DD/YYYY hh:mm:ss.ffff AM/PM` to a naive local ISO time, or undefined. */
export function parseStartTime(line: string): string | undefined {
  const m = START_TIME.exec(line.trim());
  if (!m) return undefined;
  const [, mo, d, y, h, mi, s, frac, ampm] = m;
  const month = Number(mo);
  const day = Number(d);
  const hour12 = Number(h);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour12 < 1 || hour12 > 12) return undefined;
  if (Number(mi) > 59 || Number(s) > 59) return undefined;
  const hour = (hour12 % 12) + (ampm?.toUpperCase() === "PM" ? 12 : 0);
  const pad = (n: number | string) => String(n).padStart(2, "0");
  const ms = frac ? `.${frac.slice(0, 3).padEnd(3, "0")}` : "";
  return `${y}-${pad(month)}-${pad(day)}T${pad(hour)}:${mi}:${s}${ms}`;
}

/**
 * Parses an OBDLink Drive Log, recognised by content rather than file name. Returns "not-drive-log" for
 * other files, a typed failure when a Drive Log lacks its essentials, and otherwise the column-oriented log
 * with held rows collapsed.
 */
export function parseDriveLog(
  input: string | Uint8Array,
  options: DriveLogOptions = {},
): DriveLogResult {
  const text =
    typeof input === "string" ? input : new TextDecoder("utf-8", { ignoreBOM: true }).decode(input);
  const hasBom = text.startsWith(BOM);
  const lines = (hasBom ? text.slice(1) : text).split(/\r?\n/);
  const first = lines[0] ?? "";
  const hasStartLine = START_LINE.test(first);
  const headerIndex = hasStartLine ? 1 : 0;
  const header = splitFields(lines[headerIndex] ?? "");
  const timeIndex = header.findIndex(isTimeHeader);

  if (!hasStartLine && timeIndex < 0) return { kind: "not-drive-log" };
  if (!hasBom) return fail("missing-bom", "Drive Log does not start with a UTF-8 byte order mark");
  if (!hasStartLine) return fail("missing-start-time", "Drive Log has no '# StartTime =' line");
  const startTime = parseStartTime(first);
  if (startTime === undefined) {
    return fail("bad-start-time", `Drive Log StartTime is not readable: "${first.trim()}"`);
  }
  if (timeIndex < 0) return fail("missing-time-column", "Drive Log has no 'Time (sec)' column");

  // Read rows, skipping malformed ones and the all-zero rows logged before the adapter connected.
  const rows: number[][] = [];
  let read = 0;
  let skipped = 0;
  let idle = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim() === "") continue;
    read++;
    const fields = splitFields(line);
    const row = fields.map((f) => (f === "" ? Number.NaN : Number(f)));
    if (fields.length !== header.length || row.some((v) => !Number.isFinite(v))) {
      skipped++;
      continue;
    }
    if (row.every((v, j) => j === timeIndex || v === 0)) {
      idle++;
      continue;
    }
    rows.push(row);
  }

  const catalogue = options.catalogue ?? STANDARD_CATALOGUE;
  const columns = catalogue
    .matchAll(header)
    .map((m, i) => ({ i, m }))
    .filter(({ i }) => i !== timeIndex);
  const indexOf = new Map(columns.map(({ i, m }) => [m.key, i]));

  // Collapse held rows: keep a row only when a key Channel changed since the last kept row.
  const keyCols = (options.collapseKeys ?? DEFAULT_COLLAPSE_KEYS)
    .map((k) => indexOf.get(k))
    .filter((i) => i !== undefined);
  const changeCols = keyCols.length ? keyCols : columns.map(({ i }) => i);
  const batches: number[][] = [];
  for (const r of rows) {
    const last = batches[batches.length - 1];
    if (!last || changeCols.some((j) => r[j] !== last[j])) batches.push(r);
  }

  const channels: Record<ChannelKey, DriveLogChannel> = {};
  for (const { i, m } of columns) {
    const values = batches.map((r) => r[i] ?? Number.NaN);
    channels[m.key] = {
      label: m.label,
      ...(m.unit === undefined ? {} : { unit: m.unit }),
      header: m.header,
      known: m.known,
      values,
    };
  }

  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  const span = firstRow && lastRow ? (lastRow[timeIndex] ?? 0) - (firstRow[timeIndex] ?? 0) : 0;
  // OBDLink writes times to the millisecond; round away float noise from the subtraction.
  const duration = Math.round(span * 1000) / 1000;
  const warnings = skipped ? [`${skipped} ${skipped === 1 ? "row" : "rows"} skipped`] : [];

  return {
    kind: "drive-log",
    log: {
      startTime,
      duration,
      rows: { read, skipped, idle, collapsed: batches.length },
      warnings,
      t: batches.map((r) => r[timeIndex] ?? Number.NaN),
      channels,
    },
  };
}
