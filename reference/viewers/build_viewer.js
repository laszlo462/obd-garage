// Builds a self-contained interactive viewer for any OBDLink CSV drive log.
//   node build_viewer.js <path/to/CSVLog_*.csv>
// Writes viewer_<YYYY-MM-DD>_<HHMM>.html next to this script. Node only, no dependencies.
//
// Optional per-log settings: events/<csv basename>.json. Every key is optional; without the file you
// still get all the charts. Example: events/CSVLog_20260821_212246.json.
//   note               short tag after the title, e.g. "MIL commanded on"
//   subtitle           free text appended to the description line
//   engineOffsetS      engine run time at log t = 0; enables the "Engine run time" x axis
//   mapCorrectionInHg  offers a MAP_A correction toggle (use 1.24 only for logs before the 2026-09-09 MAP swap)
//   freezeFrame        { channel: value } dashed reference lines; channel keys are the KNOWN keys below
//   events             [{ t0, t1, title, text }] in log seconds; t0 === t1 draws a line, otherwise a band
// Any CSV column not in KNOWN still shows in the readout and data table, so new PIDs (cooler bypass,
// regen status) appear automatically. To chart one, add it to KNOWN and to ALL_PANELS in viewer_template.html.
const fs = require("fs");
const path = require("path");

const csvPath = process.argv[2];
if (!csvPath) { console.error("usage: node build_viewer.js <path/to/CSVLog_*.csv>"); process.exit(1); }
const base = path.basename(csvPath, ".csv");
const cfgPath = path.join(__dirname, "events", base + ".json");
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};

const lines = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "").split(/\r?\n/);
const start = lines[0].replace("# StartTime = ", "").trim();
const hdr = lines[1].split(",").map((s) => s.trim());

// Charted channels, matched by case-insensitive header prefix. All are optional; the first match wins
// (so of the two identical MAF PIDs, the first is used). Arrays list the alternative names OBDLink used
// in the 2026-10-02 PID set (SAE naming).
const KNOWN = {
  t: "time (sec)", maf: "mass air flow sensor a", app: "accelerator pedal position d",
  act: ["actual exhaust gas recirculation a", "actual egr a"], cmd: ["commanded exhaust gas recirculation a", "commanded egr a"],
  ect1: ["engine coolant temperature sensor 1", "engine coolant temperature 1"], load: ["engine load", "calculated load value"],
  rpm: ["engine revolutions", "engine rpm"],
  egrt: "exhaust gas recirculation temperature bank 1", thrc: "exhaust gas recirculation throttle position commanded",
  vp: "exhaust gas recirculation valve position (%)", egt: "exhaust gas temperature 11",
  ep: ["exhaust pressure sensor 1", "exhaust pressure sensor bank 1"], map: "intake manifold absolute pressure a",
  nox: ["nitrogen oxides", "nox sensor concentration bank 1 sensor 1"], vss: "vehicle speed",
  regen: "diesel particulate filter regeneration status", soot: "dpf soot", byp: "egr cooler bypass valve (%)",
};
// Known-useless columns (README §5 / 09-30 §5): never shown. NOx sensor 2 does not exist on this truck.
const SKIP = ["exhaust gas recirculation system evaluated", "turbocharger wastegate", "nox sensor concentration bank 1 sensor 2"];
const C = {}, used = new Set();
for (const [k, names] of Object.entries(KNOWN)) {
  const i = hdr.findIndex((h, j) => !used.has(j) && [].concat(names).some((p) => h.toLowerCase().startsWith(p)));
  if (i >= 0) { C[k] = i; used.add(i); }
}
if (C.t === undefined) throw new Error("no 'Time (sec)' column");
// Every other column goes into the readout and data table as an uncharted extra.
const extras = hdr.map((h, i) => [h, i]).filter(([h, i]) => !used.has(i) && h && !SKIP.some((s) => h.toLowerCase().startsWith(s)))
  .filter(([h], j, a) => a.findIndex(([h2]) => h2.toLowerCase() === h.toLowerCase()) === j)   // drop duplicate PIDs
  .filter(([h]) => ![...used].some((u) => hdr[u].toLowerCase() === h.toLowerCase()))
  .map(([h, i], j) => {
    const m = h.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    return { key: "x" + j, i, label: m ? m[1] : h, unit: m ? m[2] : "" };
  });

// Drop all-zero pre-connect rows, then collapse held rows to one entry per refresh batch (CLAUDE.md rules).
const rows = lines.slice(2).filter(Boolean).map((l) => l.split(",").map(Number)).filter((r) => r.some((v, j) => j !== C.t && v !== 0));
const keyCols = ["rpm", "cmd", "maf", "map", "ep", "vp"].filter((k) => k in C).map((k) => C[k]);
const changeCols = keyCols.length ? keyCols : hdr.map((_, j) => j).filter((j) => j !== C.t);
const batches = [rows[0]];
for (const r of rows.slice(1)) if (changeCols.some((j) => r[j] !== batches[batches.length - 1][j])) batches.push(r);

const r1 = (x) => Math.round(x * 10) / 10;
const D = {};
for (const k of Object.keys(C)) D[k] = batches.map((r) => r1(r[C[k]]));
for (const x of extras) D[x.key] = batches.map((r) => r1(r[x.i]));
if (D.regen) D.regen = D.regen.map((v) => v * 100);   // 0/1 flag, scaled to share the soot % axis
// P0401 low-flow entry window (DOBDSM1202 p. 39): 600-2,500 rpm, ECT 70-100 C, valve 40-60 % (SAE scale assumed).
// The pre-October logs used a different decode of the same PID: full open = 99.35, vs 59.61 on the SAE $69 decode
// the freeze frame uses (10-02 addendum §2.1). Rescale those by 59.61/99.35 before the window test.
// simplified: linear rescale from the two ceilings; refit if a log mixes both decodes.
let actScale = 1;
if ("act" in C) {
  const actMax = Math.max(...rows.map((r) => r[C.act]));
  if (actMax > 62) actScale = 59.61 / 99.35;
}
if (["rpm", "ect1", "act"].every((k) => k in C)) {
  D.inw = batches.map((r) => (r[C.rpm] >= 600 && r[C.rpm] <= 2500 && r[C.ect1] >= 158 && r[C.ect1] <= 212
    && r[C.act] * actScale >= 40 && r[C.act] * actScale <= 60 ? 1 : 0));
}

let miles = null;
if ("vss" in C) { miles = 0; for (let i = 1; i < rows.length; i++) miles += rows[i - 1][C.vss] * (rows[i][C.t] - rows[i - 1][C.t]) / 3600; }
const m = start.match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+)/);
const date = `${m[3]}-${m[1]}-${m[2]}`;
const hhmm = String(+m[4] % 12 + (/PM/.test(start) ? 12 : 0)).padStart(2, "0") + m[5];
const meta = {
  file: path.basename(csvPath), date, start,
  minutes: r1((rows[rows.length - 1][C.t] - rows[0][C.t]) / 60), miles: miles === null ? null : r1(miles),
  batches: batches.length, rows: rows.length,
  egrScale: actScale === 1 ? "SAE $69 decode (full open = 59.6 %)" : "pre-October decode (full open = 99.35 %)",
  missing: Object.keys(KNOWN).filter((k) => !(k in C)),
  extras: extras.map(({ key, label, unit }) => ({ key, label, unit })),
};

const out = path.join(__dirname, `viewer_${date}_${hhmm}.html`);
const page = fs.readFileSync(path.join(__dirname, "viewer_template.html"), "utf8")
  .replace("/*__DATA__*/", () => `const START = ${JSON.stringify(start)};\nconst META = ${JSON.stringify(meta)};\n`
    + `const CFG = ${JSON.stringify(cfg)};\nconst D = ${JSON.stringify(D)};`);
fs.writeFileSync(out, page);
console.log(`wrote ${path.basename(out)}: ${batches.length} batches from ${rows.length} rows, `
  + `${(cfg.events || []).length} events${fs.existsSync(cfgPath) ? "" : " (no events/" + base + ".json)"}`
  + (meta.missing.length ? `; not in this log: ${meta.missing.join(", ")}` : ""));
