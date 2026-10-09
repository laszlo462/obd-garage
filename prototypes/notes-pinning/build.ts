// PROTOTYPE, throwaway. Answers "Can Notes be pinned to a moment on a phone chart?" (wayfinder ticket)
// and the uPlot touch spike from ADR 0002. Not production code: no tests, minimal error handling.
//
//   node prototypes/notes-pinning/build.ts <Drive Log .csv> [events .json]
//
// Writes prototypes/notes-pinning/out/index.html (gitignored: it embeds the Drive Log).
// Only event t0/t1/title are kept from the events file; free text stays out.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join } from "node:path";

const [csvPath, eventsPath] = process.argv.slice(2);
if (!csvPath) {
  console.error("usage: node build.ts <drive-log.csv> [events.json]");
  process.exit(1);
}

const lines = readFileSync(csvPath, "utf8").replace(/^﻿/, "").split(/\r?\n/);
const start = lines[0].replace("# StartTime = ", "").trim();
const hdr = lines[1].split(",").map((s) => s.trim());

// Channels to chart, matched by case-insensitive header prefix (first match wins).
const WANT: Record<string, string[]> = {
  rpm: ["engine rpm", "engine revolutions"],
  vss: ["vehicle speed"],
  load: ["calculated load value", "engine load"],
  maf: ["mass air flow sensor a"],
  cmd: ["commanded egr a", "commanded exhaust gas recirculation a"],
  act: ["actual egr a", "actual exhaust gas recirculation a"],
  vp: ["exhaust gas recirculation valve position"],
  ep: ["exhaust pressure sensor bank 1", "exhaust pressure sensor 1"],
  map: ["intake manifold absolute pressure a"],
  ect: ["engine coolant temperature 1", "engine coolant temperature sensor 1"],
};
const col: Record<string, number> = {};
for (const [k, names] of Object.entries(WANT)) {
  const i = hdr.findIndex((h) => names.some((n) => h.toLowerCase().startsWith(n)));
  if (i >= 0) col[k] = i;
}
const unit = (i: number) => hdr[i].match(/\(([^()]*)\)\s*$/)?.[1] ?? "";
const label = (i: number) => hdr[i].replace(/\s*\([^()]*\)\s*$/, "");

// Drop the all-zero pre-connect rows.
const rows = lines
  .slice(2)
  .filter(Boolean)
  .map((l) => l.split(",").map(Number))
  .filter((r) => r.some((v, j) => j !== 0 && v !== 0));

const r2 = (x: number) => Math.round(x * 100) / 100;
const data = {
  file: basename(csvPath),
  start,
  t: rows.map((r) => r2(r[0])),
  ch: Object.fromEntries(
    Object.entries(col).map(([k, i]) => [k, { label: label(i), unit: unit(i), v: rows.map((r) => r2(r[i])) }]),
  ),
  events: [] as { t0: number; t1: number; title: string }[],
};
if (eventsPath && existsSync(eventsPath)) {
  const ev = JSON.parse(readFileSync(eventsPath, "utf8"));
  data.events = (ev.events ?? []).map((e: { t0: number; t1: number; title: string }) => ({
    t0: e.t0,
    t1: e.t1,
    title: e.title,
  }));
}

const here = import.meta.dirname;
const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });
const page = readFileSync(join(here, "index.html"), "utf8").replace(
  "/*__DATA__*/",
  () => `const DATA = ${JSON.stringify(data)};`,
);
writeFileSync(join(outDir, "index.html"), page);
console.log(
  `wrote out/index.html: ${rows.length} rows, channels ${Object.keys(col).join(", ")}, ${data.events.length} events`,
);
