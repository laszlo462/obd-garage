import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { type Db, openDb } from "./db.ts";
import type { UploadResult } from "./ingest.ts";
import { originalPath } from "./originals.ts";
import { DEFAULT_REGISTRY as registry } from "./registry.ts";

const fixture = (folder: string, name: string) =>
  readFileSync(new URL(`../../test/fixtures/${folder}/${name}`, import.meta.url));
const AUG = fixture("reports", "Diagnostic Report 2026-08-21 215710.html");
const OCT = fixture("reports", "Diagnostic_Report_2026-10-02_213218.html");
const LOG = fixture("drive-logs", "CSVLog_20261002_175845.csv");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const NOW = () => new Date("2026-10-12T10:00:00Z");

let dir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-export-"));
  db = openDb(join(dir, "t.db"));
  app = createApp({ db, dataDir: dir, registry, now: NOW, appVersion: "1.2.3" });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function upload(body: Uint8Array | string, filename: string, vehicle?: number) {
  const params = new URLSearchParams({ filename });
  if (vehicle !== undefined) params.set("vehicle", String(vehicle));
  const res = await app.request(`/api/uploads?${params}`, {
    method: "POST",
    body: body as BodyInit,
  });
  return (await res.json()) as UploadResult;
}

/** A Vehicle created by the October Report. */
async function vehicleWithReport() {
  const report = await upload(OCT, "oct.html");
  return {
    vehicleId: report.vehicleCreated?.id as number,
    vin: report.vehicleCreated?.vin as string,
    reportId: report.uploadId as number,
  };
}

describe("GET /api/export (Vehicle scope)", () => {
  it("answers 422 'Nothing in this range' when no Drive Log starts in the range", async () => {
    const { vehicleId } = await vehicleWithReport();
    const res = await app.request(`/api/export?vehicle=${vehicleId}&from=2026-01-01&to=2026-01-31`);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Nothing in this range" });
  });
});

describe("a Vehicle Bundle with one Drive Log", () => {
  it("is named for the VIN and range and holds the Original byte for byte", async () => {
    const { vehicleId, vin } = await vehicleWithReport();
    await upload(LOG, "log.csv", vehicleId);
    const res = await app.request(`/api/export?vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="obd-garage_${vin}_2026-10-02_2026-10-02.zip"`,
    );
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Buffer.from(files["drive-logs/log.csv"] as Uint8Array).equals(LOG)).toBe(true);
  });
});

const exportZip = async (query: string) => {
  const res = await app.request(`/api/export?${query}`);
  expect(res.status).toBe(200);
  return unzipSync(new Uint8Array(await res.arrayBuffer()));
};
const json = (files: Record<string, Uint8Array>, name: string) =>
  JSON.parse(new TextDecoder().decode(files[name]));

describe("manifest.json (Vehicle scope)", () => {
  it("records the scope, Vehicle, app version, export time and each file's SHA-256 and upload time", async () => {
    const { vehicleId, vin } = await vehicleWithReport();
    await upload(LOG, "log.csv", vehicleId);
    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    const manifest = json(files, "manifest.json");
    expect(manifest).toMatchObject({
      scope: "vehicle",
      vehicle: {
        vin,
        label: "2012 Ford S-Duty F250-F550",
        profile: "6.7L Power Stroke (2011-2016)",
        packs: ["6.7 P0401 @ 1.2.3"],
      },
      appVersion: "1.2.3",
      exportedAt: "2026-10-12T10:00:00.000Z",
      range: { from: "2026-10-02", to: "2026-10-02" },
    });
    expect(manifest.driveLogs).toEqual([
      expect.objectContaining({
        file: "drive-logs/log.csv",
        originalFilename: "log.csv",
        sha256: sha256(LOG),
        uploadedAt: "2026-10-12T10:00:00.000Z",
        referenceReport: "reports/oct.html",
      }),
    ]);
  });
});

describe("sidecars of a Drive Log", () => {
  it("writes <name>.events.json with the Events as stored", async () => {
    const { vehicleId } = await vehicleWithReport();
    await upload(LOG, "log.csv", vehicleId);
    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    const peak = (title: string, text: string) => ({
      ruleId: "core.peaks",
      startSec: 0.502,
      endSec: 0.502,
      kind: "point",
      title,
      text,
      packId: null,
      category: "generic",
    });
    expect(json(files, "drive-logs/log.csv.events.json")).toEqual([
      peak("Peak engine speed", "Engine RPM peaked at 0 rpm."),
      peak("Peak vehicle speed", "Vehicle speed peaked at 0 km/h."),
      peak("Peak coolant temperature", "Engine coolant temperature peaked at 12 °C."),
    ]);
  });
});

const addNote = (id: number, body: object) =>
  app.request(`/api/uploads/${id}/notes`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe("<name>.notes.json", () => {
  it("gives a pinned Note its row index, elapsed seconds and wall-clock time", async () => {
    const { vehicleId } = await vehicleWithReport();
    const { uploadId } = await upload(LOG, "log.csv", vehicleId);
    await addNote(uploadId as number, { text: "whole drive" });
    await addNote(uploadId as number, { text: "<b>ticking</b>", pinnedAt: 2.001 });
    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    expect(json(files, "drive-logs/log.csv.notes.json")).toEqual([
      {
        text: "whole drive",
        createdAt: "2026-10-12T10:00:00.000Z",
        pinned: null,
      },
      {
        text: "<b>ticking</b>",
        createdAt: "2026-10-12T10:00:00.000Z",
        pinned: {
          rowIndex: 1,
          rawTimeSec: 2.001,
          elapsedSec: 2.001,
          wallClock: "2026-10-02T17:58:47.949",
        },
      },
    ]);
  });
});

describe("<name>.channels.csv", () => {
  it("holds the Channels the app charts, Profile decode fixes applied", async () => {
    const { vehicleId } = await vehicleWithReport();
    await upload(LOG, "log.csv", vehicleId);
    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    const lines = new TextDecoder()
      .decode(files["drive-logs/log.csv.channels.csv"])
      .trimEnd()
      .split("\n");
    const header = (lines[0] as string).split(",");
    expect(header[0]).toBe("Time (sec)");
    const ect = header.indexOf("Engine coolant temperature (°F)");
    expect(ect).toBeGreaterThan(0);
    expect(lines).toHaveLength(13); // header plus the 12 displayed rows
    const first = (lines[1] as string).split(",");
    expect(first[0]).toBe("0.502");
    expect(first[ect]).toBe("53.6");
  });
});

describe("Reference Reports outside the range", () => {
  it("are included with inRange false and their Notes", async () => {
    const aug = await upload(AUG, "aug.html");
    const vehicleId = aug.vehicleCreated?.id as number;
    await upload(LOG, "log.csv", vehicleId);
    await addNote(aug.uploadId as number, { text: "scan before the repair" });

    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "drive-logs/log.csv",
      "drive-logs/log.csv.channels.csv",
      "drive-logs/log.csv.events.json",
      "drive-logs/log.csv.notes.json",
      "manifest.json",
      "reports/aug.html",
      "reports/aug.html.notes.json",
    ]);
    expect(Buffer.from(files["reports/aug.html"] as Uint8Array).equals(AUG)).toBe(true);
    expect(json(files, "reports/aug.html.notes.json")).toEqual([
      { text: "scan before the repair", createdAt: "2026-10-12T10:00:00.000Z", pinned: null },
    ]);
    const manifest = json(files, "manifest.json");
    expect(manifest.driveLogs[0].referenceReport).toBe("reports/aug.html");
    expect(manifest.reports).toEqual([
      {
        file: "reports/aug.html",
        originalFilename: "aug.html",
        sha256: sha256(AUG),
        uploadedAt: "2026-10-12T10:00:00.000Z",
        recordedAt: "2026-08-21T21:56:40",
        inRange: false,
      },
    ]);
  });
});

describe("Reports recorded in the range", () => {
  it("are included even when no Drive Log references them", async () => {
    const aug = await upload(AUG, "aug.html");
    const vehicleId = aug.vehicleCreated?.id as number;
    const oct = await upload(OCT, "oct.html");
    const log = await upload(LOG, "log.csv", vehicleId);
    await app.request(`/api/drive-logs/${log.uploadId}/reference`, {
      method: "PUT",
      body: JSON.stringify({ reportId: aug.uploadId }),
      headers: { "content-type": "application/json" },
    });
    await addNote(oct.uploadId as number, { text: "scanned after the drive" });

    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    expect(Buffer.from(files["reports/oct.html"] as Uint8Array).equals(OCT)).toBe(true);
    expect(json(files, "reports/oct.html.notes.json")).toEqual([
      { text: "scanned after the drive", createdAt: "2026-10-12T10:00:00.000Z", pinned: null },
    ]);
    expect(
      json(files, "manifest.json").reports.map((r: { file: string; inRange: boolean }) => [
        r.file,
        r.inRange,
      ]),
    ).toEqual([
      ["reports/aug.html", false],
      ["reports/oct.html", true],
    ]);
  });
});

describe("a Reference Report inside the range", () => {
  it("is marked inRange true", async () => {
    const { vehicleId } = await vehicleWithReport();
    await upload(LOG, "log.csv", vehicleId);
    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    expect(json(files, "manifest.json").reports).toEqual([
      expect.objectContaining({ file: "reports/oct.html", inRange: true }),
    ]);
  });
});

/** A minimal synthetic Drive Log starting at the given OBDLink StartTime text. */
const syntheticLog = (startTime: string) =>
  `\uFEFF# StartTime = ${startTime}\nTime (sec), Engine RPM (RPM)\n0.000,800\n600.000,820\n1200.000,840\n`;

describe("recorded-local day boundaries", () => {
  it("take whole inclusive days by each Drive Log's recorded start", async () => {
    const { vehicleId } = await vehicleWithReport();
    await upload(syntheticLog("09/30/2026 11:59:00.0000 PM"), "before.csv", vehicleId);
    await upload(syntheticLog("10/01/2026 12:05:00.0000 AM"), "first-day.csv", vehicleId);
    await upload(syntheticLog("10/02/2026 11:50:00.0000 PM"), "over-midnight.csv", vehicleId);
    await upload(syntheticLog("10/03/2026 12:10:00.0000 AM"), "after.csv", vehicleId);

    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-01&to=2026-10-02`);
    const originals = Object.keys(files)
      .filter((f) => /^drive-logs\/[^/]*(?<!\.channels)\.csv$/.test(f))
      .sort();
    expect(originals).toEqual(["drive-logs/first-day.csv", "drive-logs/over-midnight.csv"]);
  });
});

describe("filename clashes", () => {
  it("suffix the later Original with -2 and keep the uploaded name in the manifest", async () => {
    const { vehicleId } = await vehicleWithReport();
    const first = syntheticLog("10/02/2026 09:00:00.0000 AM");
    const second = syntheticLog("10/02/2026 10:00:00.0000 AM");
    await upload(first, "drive.csv", vehicleId);
    await upload(second, "drive.csv", vehicleId);

    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    expect(Buffer.from(files["drive-logs/drive.csv"] as Uint8Array).toString()).toBe(first);
    expect(Buffer.from(files["drive-logs/drive-2.csv"] as Uint8Array).toString()).toBe(second);
    expect(files["drive-logs/drive-2.csv.events.json"]).toBeDefined();
    expect(json(files, "manifest.json").driveLogs).toEqual([
      expect.objectContaining({ file: "drive-logs/drive.csv", originalFilename: "drive.csv" }),
      expect.objectContaining({ file: "drive-logs/drive-2.csv", originalFilename: "drive.csv" }),
    ]);
  });
});

describe("Report filename clashes", () => {
  it("suffix the later Reference Report with -2", async () => {
    const aug = await upload(AUG, "report.html");
    const vehicleId = aug.vehicleCreated?.id as number;
    await upload(OCT, "report.html");
    const early = await upload(syntheticLog("08/22/2026 09:00:00.0000 AM"), "a.csv", vehicleId);
    await upload(syntheticLog("10/02/2026 09:00:00.0000 AM"), "b.csv", vehicleId);
    expect(early.outcome).toBe("added");

    const files = await exportZip(`vehicle=${vehicleId}&from=2026-08-01&to=2026-10-31`);
    expect(Buffer.from(files["reports/report.html"] as Uint8Array).equals(AUG)).toBe(true);
    expect(Buffer.from(files["reports/report-2.html"] as Uint8Array).equals(OCT)).toBe(true);
    expect(
      json(files, "manifest.json").driveLogs.map(
        (l: { referenceReport: string }) => l.referenceReport,
      ),
    ).toEqual(["reports/report.html", "reports/report-2.html"]);
    expect(json(files, "manifest.json").reports).toEqual([
      expect.objectContaining({ file: "reports/report.html", originalFilename: "report.html" }),
      expect.objectContaining({ file: "reports/report-2.html", originalFilename: "report.html" }),
    ]);
  });
});

describe("README.md (Vehicle scope)", () => {
  it("states the VIN and Event timing, then a timeline, then the Reference-only Reports", async () => {
    const aug = await upload(AUG, "aug.html");
    const vehicleId = aug.vehicleCreated?.id as number;
    const vin = aug.vehicleCreated?.vin as string;
    const oct = await upload(OCT, "oct.html");
    const log = await upload(LOG, "log.csv", vehicleId);
    await app.request(`/api/drive-logs/${log.uploadId}/reference`, {
      method: "PUT",
      body: JSON.stringify({ reportId: aug.uploadId }),
      headers: { "content-type": "application/json" },
    });
    await addNote(log.uploadId as number, { text: "ticking when cold" });
    await addNote(oct.uploadId as number, { text: "scanned after the drive" });
    await addNote(aug.uploadId as number, { text: "scan before the repair" });

    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    const readme = new TextDecoder().decode(files["README.md"]);
    expect(readme).toContain(`contains the VIN (${vin})`);
    expect(readme).toContain("Events are as of the export time (2026-10-12T10:00:00.000Z)");
    const at = (needle: string) => {
      const i = readme.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      at("## Timeline"),
      at("2026-10-02 17:58:45"),
      at("drive-logs/log.csv"),
      at("3 Events"),
      at("ticking when cold"),
      at("2026-10-02 21:32:14"),
      at("reports/oct.html"),
      at("scanned after the drive"),
      at("## Reference-only Reports"),
      at("reports/aug.html"),
      at("scan before the repair"),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The Reference-only Report is not on the timeline.
    expect(readme.indexOf("reports/aug.html")).toBeGreaterThan(readme.indexOf("## Reference-only"));
  });
});

const postUnassigned = (body: unknown) =>
  app.request("/api/export/unassigned", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe("POST /api/export/unassigned", () => {
  it("bundles exactly the selected Unassigned Drive Logs, with no Profile applied", async () => {
    const a = await upload(syntheticLog("10/05/2026 09:00:00.0000 AM"), "a.csv");
    await upload(syntheticLog("10/06/2026 09:00:00.0000 AM"), "left-out.csv");
    const c = await upload(syntheticLog("10/09/2026 09:00:00.0000 AM"), "c.csv");
    await addNote(a.uploadId as number, { text: "first drive" });

    const res = await postUnassigned({ logIds: [c.uploadId, a.uploadId] });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="obd-garage_unassigned_2026-10-05_2026-10-09.zip"',
    );
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "drive-logs/a.csv",
      "drive-logs/a.csv.events.json",
      "drive-logs/a.csv.notes.json",
      "drive-logs/c.csv",
      "drive-logs/c.csv.events.json",
      "drive-logs/c.csv.notes.json",
      "manifest.json",
    ]);
    const manifest = json(files, "manifest.json");
    expect(manifest).toMatchObject({
      scope: "unassigned",
      appVersion: "1.2.3",
      exportedAt: "2026-10-12T10:00:00.000Z",
    });
    expect(manifest).not.toHaveProperty("vehicle");
    expect(manifest.driveLogs.map((l: { file: string }) => l.file)).toEqual([
      "drive-logs/a.csv",
      "drive-logs/c.csv",
    ]);
    const readme = new TextDecoder().decode(files["README.md"]);
    expect(readme).toContain("no Vehicle Profile was applied");
    expect(readme).toContain("Channel names and values are raw");
    expect(readme).toContain("first drive");
  });
});

describe("GET /api/export input", () => {
  it("answers 400 for a missing or malformed vehicle or day, and 404 for an unknown Vehicle", async () => {
    const { vehicleId } = await vehicleWithReport();
    const status = async (query: string) => (await app.request(`/api/export?${query}`)).status;
    expect(await status("from=2026-10-02&to=2026-10-02")).toBe(400);
    expect(await status(`vehicle=abc&from=2026-10-02&to=2026-10-02`)).toBe(400);
    expect(await status(`vehicle=${vehicleId}&to=2026-10-02`)).toBe(400);
    expect(await status(`vehicle=${vehicleId}&from=2026-10-02`)).toBe(400);
    expect(await status(`vehicle=${vehicleId}&from=10/02/2026&to=2026-10-02`)).toBe(400);
    expect(await status(`vehicle=${vehicleId}&from=2026-02-30&to=2026-10-02`)).toBe(400);
    expect(await status(`vehicle=${vehicleId}&from=2026-10-03&to=2026-10-02`)).toBe(400);
    expect(await status("vehicle=999&from=2026-10-02&to=2026-10-02")).toBe(404);
  });
});

describe("POST /api/export/unassigned as a form", () => {
  it("takes repeated logIds fields and returns the same zip as the JSON body", async () => {
    const a = await upload(syntheticLog("10/05/2026 09:00:00.0000 AM"), "a.csv");
    const c = await upload(syntheticLog("10/09/2026 09:00:00.0000 AM"), "c.csv");
    const ids = [c.uploadId, a.uploadId] as number[];

    const asJson = await postUnassigned({ logIds: ids });
    const form = await app.request("/api/export/unassigned", {
      method: "POST",
      body: new URLSearchParams(ids.map((id) => ["logIds", String(id)])),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    expect(form.status).toBe(200);
    expect(form.headers.get("content-disposition")).toBe(asJson.headers.get("content-disposition"));
    const unzip = async (res: Response) => unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(await unzip(form)).toEqual(await unzip(asJson));
  });

  it("answers 400 for a form with no logIds or a non-integer one", async () => {
    const post = async (body: string) =>
      (
        await app.request("/api/export/unassigned", {
          method: "POST",
          body,
          headers: { "content-type": "application/x-www-form-urlencoded" },
        })
      ).status;
    expect(await post("")).toBe(400);
    expect(await post("logIds=abc")).toBe(400);
    expect(await post("logIds=1.5")).toBe(400);
    // Spellings that a loose Number() would turn into an integer.
    expect(await post("logIds=")).toBe(400);
    expect(await post("logIds=1e0")).toBe(400);
    expect(await post("logIds=0x1")).toBe(400);
    expect(await post("logIds=%201")).toBe(400);
  });
});

describe("POST /api/export/unassigned input", () => {
  it("answers 400 for a bad selection, 404 for an unknown id and 409 for a log that is not Unassigned", async () => {
    const { vehicleId, reportId } = await vehicleWithReport();
    const assigned = await upload(syntheticLog("10/02/2026 09:00:00.0000 AM"), "x.csv", vehicleId);
    const loose = await upload(syntheticLog("10/03/2026 09:00:00.0000 AM"), "y.csv");
    const bad = async (body: unknown) => (await postUnassigned(body)).status;

    expect(await bad({})).toBe(400);
    expect(await bad({ logIds: "1" })).toBe(400);
    expect(await bad({ logIds: [] })).toBe(400);
    expect(await bad({ logIds: [1.5] })).toBe(400);
    const notJson = await app.request("/api/export/unassigned", { method: "POST", body: "nope" });
    expect(notJson.status).toBe(400);

    expect(await bad({ logIds: [loose.uploadId, 999] })).toBe(404);
    expect(await bad({ logIds: [reportId] })).toBe(404);
    expect(await bad({ logIds: [loose.uploadId, assigned.uploadId] })).toBe(409);
  });
});

describe("streaming", () => {
  it("arrives in many chunks, none of them the whole zip, and still unzips", async () => {
    const { vehicleId } = await vehicleWithReport();
    const names = [
      "CSVLog_20260726_175556.csv",
      "CSVLog_20260726_221700.csv",
      "CSVLog_20260821_212246.csv",
      "CSVLog_20261002_175949.csv",
      "CSVLog_20261002_182500.csv",
      "CSVLog_20261002_204254.csv",
    ];
    for (const name of names) await upload(fixture("drive-logs", name), name, vehicleId);

    const res = await app.request(`/api/export?vehicle=${vehicleId}&from=2026-01-01&to=2026-12-31`);
    expect(res.status).toBe(200);
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    expect(total).toBeGreaterThan(500_000);
    expect(chunks.length).toBeGreaterThan(10);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThan(total / 4);

    const zip = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      zip.set(chunk, at);
      at += chunk.length;
    }
    const files = unzipSync(zip);
    for (const name of names)
      expect(
        Buffer.from(files[`drive-logs/${name}`] as Uint8Array).equals(fixture("drive-logs", name)),
      ).toBe(true);
  });
});

describe("a missing Original", () => {
  it("answers 409 as JSON before any zip is streamed", async () => {
    const { vehicleId } = await vehicleWithReport();
    const log = await upload(LOG, "log.csv", vehicleId);
    const stored = db.getUpload(log.uploadId as number)?.storedPath as string;
    rmSync(originalPath(dir, stored));

    const res = await app.request(`/api/export?vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    expect(res.status).toBe(409);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "An Original is missing on disk: log.csv" });
  });
});

describe("an empty range with uploads outside it", () => {
  it("answers 422 'Nothing in this range'", async () => {
    const { vehicleId } = await vehicleWithReport();
    await upload(LOG, "log.csv", vehicleId);
    const res = await app.request(`/api/export?vehicle=${vehicleId}&from=2026-11-01&to=2026-11-30`);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Nothing in this range" });
  });
});

describe("manifest Drive Log recordedAt", () => {
  it("carries each Drive Log's naive local recorded start", async () => {
    const { vehicleId } = await vehicleWithReport();
    await upload(LOG, "log.csv", vehicleId);
    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    expect(json(files, "manifest.json").driveLogs[0].recordedAt).toBe("2026-10-02T17:58:45.948");
  });
});

describe("pinned Note rawTimeSec", () => {
  it("keeps the raw Time (sec) beside the snapped row's elapsed seconds", async () => {
    const { vehicleId } = await vehicleWithReport();
    const { uploadId } = await upload(LOG, "log.csv", vehicleId);
    await addNote(uploadId as number, { text: "near five", pinnedAt: 5 });
    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    const [note] = json(files, "drive-logs/log.csv.notes.json");
    expect(note.pinned).toMatchObject({ rawTimeSec: 5, elapsedSec: 5.006, rowIndex: 6 });
  });
});

describe("Note text in README.md", () => {
  it("is blockquoted line by line, so it cannot add headings or list items", async () => {
    const { vehicleId } = await vehicleWithReport();
    const { uploadId } = await upload(LOG, "log.csv", vehicleId);
    await addNote(uploadId as number, { text: "first line\n## Not a heading\n- not an item" });
    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    const readme = new TextDecoder().decode(files["README.md"]);
    expect(readme.split("\n").filter((l) => l.startsWith("#"))).toEqual([
      "# OBD Garage Bundle",
      "## Timeline",
      "## Reference-only Reports",
    ]);
    expect(readme.split("\n").filter((l) => l.startsWith("- "))).toEqual([
      expect.stringContaining("Drive Log drive-logs/log.csv"),
      expect.stringContaining("Diagnostic Report reports/oct.html"),
    ]);
    expect(readme).toContain("  > first line\n  > ## Not a heading\n  > - not an item");
  });
});

describe("trailing newline", () => {
  it("ends README.md, manifest.json and every .json sidecar with exactly one newline", async () => {
    const { vehicleId } = await vehicleWithReport();
    await upload(LOG, "log.csv", vehicleId);
    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    const texts = Object.entries(files).filter(
      ([name]) => name === "README.md" || name.endsWith(".json"),
    );
    expect(texts.map(([name]) => name).sort()).toEqual([
      "README.md",
      "drive-logs/log.csv.events.json",
      "drive-logs/log.csv.notes.json",
      "manifest.json",
      "reports/oct.html.notes.json",
    ]);
    for (const [name, bytes] of texts) {
      const body = new TextDecoder().decode(bytes);
      expect(body.endsWith("\n"), `${name} ends with a newline`).toBe(true);
      expect(body.endsWith("\n\n"), `${name} ends with one newline only`).toBe(false);
    }
  });
});

describe("Notes nested in README bullets", () => {
  it("sit inside their upload's list item, indented two spaces, before the next bullet", async () => {
    const { vehicleId } = await vehicleWithReport();
    const { uploadId } = await upload(LOG, "log.csv", vehicleId);
    await addNote(uploadId as number, { text: "first line\n# Not a heading\n- not an item" });
    const files = await exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    const readme = new TextDecoder().decode(files["README.md"]);
    expect(readme).toContain(
      [
        "- 2026-10-02 17:58:45.948 Drive Log drive-logs/log.csv, 3 Events",
        "  > first line",
        "  > # Not a heading",
        "  > - not an item",
        "- 2026-10-02 21:32:14 Diagnostic Report reports/oct.html",
        "",
      ].join("\n"),
    );
  });
});

describe("Bundle entry names", () => {
  /** Distinct bytes per index (uploads with the same bytes are deduplicated). */
  const logBytes = (i: number) => Buffer.concat([LOG, Buffer.from("\n".repeat(i))]);
  const exportLogs = async (names: string[]) => {
    const { vehicleId } = await vehicleWithReport();
    for (const [i, name] of names.entries()) await upload(logBytes(i), name, vehicleId);
    return exportZip(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
  };

  it("keeps a path-traversal name inside drive-logs/ and the manifest keeps the original name", async () => {
    const files = await exportLogs(["../../evil.csv"]);
    for (const path of Object.keys(files)) expect(path.split("/")).not.toContain("..");
    const manifest = json(files, "manifest.json");
    expect(manifest.driveLogs[0].originalFilename).toBe("../../evil.csv");
    expect(manifest.driveLogs[0].file).toMatch(/^drive-logs\/[^/]+$/);
    expect(Buffer.from(files[manifest.driveLogs[0].file] as Uint8Array).equals(LOG)).toBe(true);
  });

  it("adds no line or heading to README.md for a name containing a newline", async () => {
    const files = await exportLogs(["a.csv\n# Injected\n- fake"]);
    const lines = new TextDecoder().decode(files["README.md"]).split("\n");
    const hits = lines.filter((l) => l.includes("Injected"));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^- /);
    expect(lines.filter((l) => l.includes("fake"))).toEqual(hits);
  });

  it("gives no duplicate entry names when an upload is named like another's sidecar", async () => {
    const files = await exportLogs(["trip.csv", "trip.csv.notes.json"]);
    const manifest = json(files, "manifest.json");
    const entry = (n: string) =>
      manifest.driveLogs.find((l: { originalFilename: string }) => l.originalFilename === n);
    // Each manifest entry points at its own Original's bytes, and every entry name is distinct.
    for (const [i, n] of ["trip.csv", "trip.csv.notes.json"].entries()) {
      const log = entry(n);
      expect(Buffer.from(files[log.file] as Uint8Array).equals(logBytes(i))).toBe(true);
      expect(log.sha256).toBe(sha256(logBytes(i)));
      expect(json(files, `${log.file}.notes.json`)).toEqual([]);
    }
    expect(entry("trip.csv").file).not.toBe(entry("trip.csv.notes.json").file);
  });

  it("falls back to 'upload' when a name is only separators and control characters", async () => {
    const files = await exportLogs(["/\\\u0001\u0007/"]);
    expect(json(files, "manifest.json").driveLogs[0].file).toBe("drive-logs/upload");
  });
});

const summaryOf = async (query: string) => {
  const res = await app.request(`/api/export/summary?${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as {
    driveLogs: number;
    reports: number;
    referenceOnly: number;
    firstDay: string | null;
    lastDay: string | null;
    missing: string[];
  };
};

describe("GET /api/export/summary", () => {
  it("counts what the zip for the same query holds, per its manifest", async () => {
    const aug = await upload(AUG, "aug.html");
    const vehicleId = aug.vehicleCreated?.id as number;
    await upload(OCT, "oct.html");
    const log = await upload(LOG, "log.csv", vehicleId);
    await app.request(`/api/drive-logs/${log.uploadId}/reference`, {
      method: "PUT",
      body: JSON.stringify({ reportId: aug.uploadId }),
      headers: { "content-type": "application/json" },
    });
    const query = `vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`;

    const summary = await summaryOf(query);
    const manifest = json(await exportZip(query), "manifest.json") as {
      driveLogs: unknown[];
      reports: { inRange: boolean }[];
    };

    expect(summary).toMatchObject({ driveLogs: 1, reports: 1, referenceOnly: 1 });
    expect(summary.driveLogs).toBe(manifest.driveLogs.length);
    expect(summary.reports).toBe(manifest.reports.filter((r) => r.inRange).length);
    expect(summary.referenceOnly).toBe(manifest.reports.filter((r) => !r.inRange).length);
  });

  it("lists the uploaded names of Originals missing on disk, a Reference Report included", async () => {
    const aug = await upload(AUG, "aug.html");
    const vehicleId = aug.vehicleCreated?.id as number;
    const log = await upload(LOG, "log.csv", vehicleId);
    await app.request(`/api/drive-logs/${log.uploadId}/reference`, {
      method: "PUT",
      body: JSON.stringify({ reportId: aug.uploadId }),
      headers: { "content-type": "application/json" },
    });
    for (const id of [log.uploadId, aug.uploadId])
      rmSync(originalPath(dir, db.getUpload(id as number)?.storedPath as string));

    const summary = await summaryOf(`vehicle=${vehicleId}&from=2026-10-02&to=2026-10-02`);
    expect(summary.missing.sort()).toEqual(["aug.html", "log.csv"]);
  });

  it("answers 200 with zero counts for an empty range, and 400 or 404 like the export for a bad query", async () => {
    const { vehicleId } = await vehicleWithReport();
    await upload(LOG, "log.csv", vehicleId);
    expect(await summaryOf(`vehicle=${vehicleId}&from=2026-11-01&to=2026-11-30`)).toMatchObject({
      driveLogs: 0,
      reports: 0,
      referenceOnly: 0,
    });
    const status = async (query: string) =>
      (await app.request(`/api/export/summary?${query}`)).status;
    expect(await status("from=2026-10-02&to=2026-10-02")).toBe(400);
    expect(await status(`vehicle=${vehicleId}&from=2026-10-03&to=2026-10-02`)).toBe(400);
    expect(await status("vehicle=999&from=2026-10-02&to=2026-10-02")).toBe(404);
  });

  it("gives the Vehicle's first and last recorded days whatever the range, and null for none", async () => {
    const aug = await upload(AUG, "aug.html");
    const vehicleId = aug.vehicleCreated?.id as number;
    await upload(LOG, "log.csv", vehicleId);
    const range = "from=2026-01-01&to=2026-01-02";
    expect(await summaryOf(`vehicle=${vehicleId}&${range}`)).toMatchObject({
      firstDay: "2026-08-21",
      lastDay: "2026-10-02",
    });

    const empty = db.addVehicle({
      vin: "TESTVIN0000000001",
      label: "Empty",
      profileId: "",
      packIds: [],
    });
    expect(await summaryOf(`vehicle=${empty.id}&${range}`)).toEqual({
      driveLogs: 0,
      reports: 0,
      referenceOnly: 0,
      firstDay: null,
      lastDay: null,
      missing: [],
    });
  });
});
