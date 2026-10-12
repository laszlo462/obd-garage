// Turns real OBDLink exports into committable fixtures. Run it locally; it never uploads anything.
//
//   node scripts/scrub-fixture.ts --out <dir> [--deny "word,word"] <file>...
//
// File type decides the scrub: .html (Diagnostic Report), .csv (Drive Log), .json (annotation
// events, report-notes). Output keeps the exported file names. See --help.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Fixed fake serial for VIN positions 12-17.
export const FAKE_SERIAL = "000001";
// JSON keys that hold free text. Dropped, never rewritten.
const PROSE_KEYS = new Set(["note", "subtitle", "text"]);
// 17 characters from the VIN alphabet (no I, O, Q), with at least one digit and one letter.
const VIN_SHAPE = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-HJ-NPR-Z0-9]{17}\b/;
const VIN_SHAPE_ALL = new RegExp(VIN_SHAPE.source, "g");
const GAP = String.raw`(?:\s|<[^>]*>)*`;
const VIN_CAPTURE = `([A-HJ-NPR-Z0-9]{17})`;
// The two places a Report holds the VIN: the header line and the Mode $09 row.
const REPORT_VIN_PLACES = [
  new RegExp(`(VIN:${GAP})${VIN_CAPTURE}`, "g"),
  new RegExp(`(Vehicle Identification Number${GAP})${VIN_CAPTURE}`, "g"),
];

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const VALUES: Record<string, number> = {};
for (let d = 0; d <= 9; d++) VALUES[String(d)] = d;
for (const [letters, first] of [
  ["ABCDEFGH", 1],
  ["JKLMN", 1],
  ["P", 7],
  ["R", 9],
  ["STUVWXYZ", 2],
] as const) {
  for (const [i, c] of [...letters].entries()) VALUES[c] = first + i;
}

export class ScrubError extends Error {}

// ISO 3779 / NHTSA check digit (position 9) for a 17-character VIN. Position 9 of the input is ignored.
export function checkDigit(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const value = VALUES[vin.charAt(i)];
    if (value === undefined) throw new ScrubError(`Not a VIN character: ${vin.charAt(i)}`);
    sum += value * (WEIGHTS[i] as number);
  }
  const rem = sum % 11;
  return rem === 10 ? "X" : String(rem);
}

export function hasValidCheckDigit(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) && vin.charAt(8) === checkDigit(vin);
}

function fakeVin(vin: string): string {
  const body = vin.slice(0, 11) + FAKE_SERIAL;
  return body.slice(0, 8) + checkDigit(body) + body.slice(9);
}

/** Diagnostic Report (HTML): fake the VIN in its two known places; fail on any other VIN. */
export function scrubReport(html: string): string {
  let replaced = 0;
  let out = html;
  for (const place of REPORT_VIN_PLACES) {
    out = out.replace(place, (_m, lead: string, vin: string) => {
      replaced++;
      return lead + fakeVin(vin);
    });
  }
  if (replaced === 0) throw new ScrubError("No VIN found in the header or the Mode $09 row.");
  // Anything VIN-shaped that is not the fake one we just wrote is a VIN left in the wrong place.
  const leftover = out.match(VIN_SHAPE_ALL)?.filter((v) => v !== fakeVin(v));
  if (leftover?.length) {
    throw new ScrubError("A VIN-shaped string is in an unexpected place in the Report.");
  }
  return out;
}

/** Drive Log (CSV): unchanged, but must hold no VIN-shaped string. */
export function scrubCsv(csv: string): string {
  if (VIN_SHAPE.test(csv)) throw new ScrubError("A VIN-shaped string is in the Drive Log.");
  return csv;
}

function dropProse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropProse);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !PROSE_KEYS.has(k))
        .map(([k, v]) => [k, dropProse(v)]),
    );
  }
  return value;
}

/** Annotation events or report-notes (JSON): free-text fields removed. */
export function scrubAnnotations(json: string): string {
  const out = JSON.stringify(dropProse(JSON.parse(json)), null, 2);
  if (VIN_SHAPE.test(out)) throw new ScrubError("A VIN-shaped string is in the JSON.");
  return `${out}\n`;
}

// Where a denied word sits: a JSON path for JSON files, "content" otherwise.
function findDenied(name: string, text: string, deny: string[]): string | undefined {
  const hit = (s: string) => deny.some((w) => s.toLowerCase().includes(w));
  if (!name.toLowerCase().endsWith(".json")) return hit(text) ? "content" : undefined;
  const walk = (v: unknown, path: string): string | undefined => {
    if (typeof v === "string") return hit(v) ? path : undefined;
    if (v && typeof v === "object") {
      for (const [k, child] of Object.entries(v)) {
        const sub = Array.isArray(v) ? `${path}[${k}]` : path ? `${path}.${k}` : k;
        if (!Array.isArray(v) && hit(k)) return `${sub} (key)`;
        const found = walk(child, sub);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(JSON.parse(text), "");
}

function scrubOne(file: string, text: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith(".html")) return scrubReport(text);
  if (lower.endsWith(".csv")) return scrubCsv(text);
  if (lower.endsWith(".json")) return scrubAnnotations(text);
  throw new ScrubError("unsupported file type (use .html, .csv or .json).");
}

/** Scrub every file, check the deny list, and only then write into outDir. All or nothing. */
export function scrubFiles(files: string[], outDir: string, deny: string[]): void {
  const words = deny.map((w) => w.trim().toLowerCase()).filter(Boolean);
  const outputs: { name: string; text: string }[] = [];
  for (const file of files) {
    const name = basename(file);
    let text: string;
    try {
      text = scrubOne(file, readFileSync(file, "utf8"));
    } catch (e) {
      if (e instanceof ScrubError) throw new ScrubError(`${name}: ${e.message}`);
      throw e;
    }
    const where = findDenied(name, text, words);
    if (where) throw new ScrubError(`${name}: denied word found in ${where}.`);
    outputs.push({ name, text });
  }
  mkdirSync(outDir, { recursive: true });
  for (const { name, text } of outputs) writeFileSync(join(outDir, name), text);
}

const USAGE = `Usage: node scripts/scrub-fixture.ts --out <dir> [--deny "word,word"] <file>...

Scrubs OBDLink exports into fixtures that are safe to commit. Output keeps the file names.
  .html  Diagnostic Report: VIN serial (positions 12-17) replaced, check digit recomputed.
         Fails if a VIN-shaped string is anywhere else.
  .csv   Drive Log: copied unchanged. Fails if it holds a VIN-shaped string.
  .json  Annotation events or report-notes: note, subtitle and text fields removed.

  --out <dir>      Target directory (created if needed).
  --deny "a,b"     Words (case-insensitive) that must not appear in any output, titles included.
                   Pass them on the command line only; never store them in the repo.
If anything fails, nothing is written and the exit code is non-zero.`;

function main(argv: string[]): void {
  const files: string[] = [];
  let out: string | undefined;
  let deny: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      return;
    }
    if (arg === "--out") out = argv[++i];
    else if (arg === "--deny") deny = (argv[++i] ?? "").split(",");
    else files.push(arg);
  }
  if (!out || files.length === 0) throw new ScrubError(`Missing --out or input files.\n\n${USAGE}`);
  for (const f of files) if (!existsSync(f)) throw new ScrubError(`No such file: ${f}`);
  scrubFiles(files, out, deny);
  console.log(`Wrote ${files.length} file(s) to ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof ScrubError ? e.message : e);
    process.exitCode = 1;
  }
}
