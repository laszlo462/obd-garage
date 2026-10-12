import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Db, openDb } from "./db.ts";
import { createIngest } from "./ingest.ts";
import { originalPath } from "./originals.ts";
import { DEFAULT_REGISTRY as registry } from "./registry.ts";
import { main } from "./reparse.ts";

const fixture = (folder: string, name: string) =>
  readFileSync(new URL(`../../test/fixtures/${folder}/${name}`, import.meta.url));
const OCT = fixture("reports", "Diagnostic_Report_2026-10-02_213218.html");
const LOG = fixture("drive-logs", "CSVLog_20261002_175845.csv");
const NOW = () => new Date("2026-10-12T10:00:00Z");

let dir: string;
let db: Db;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-reparse-"));
  db = openDb(join(dir, "obd-garage.db"));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const ingestFor = (appVersion: string, extra: { yieldToRequests?: () => Promise<void> } = {}) =>
  createIngest({ db, dataDir: dir, registry, now: NOW, appVersion, ...extra });

/** A Report and a Drive Log on its Vehicle, derived under version "1", each with a Note. */
function seed() {
  const ingest = ingestFor("1");
  const report = ingest.ingest({ bytes: OCT, filename: "r.html", vehicleId: null });
  const vehicle = db.listVehicles()[0]?.id as number;
  const log = ingest.ingest({ bytes: LOG, filename: "l.csv", vehicleId: vehicle });
  const ids = { report: report.uploadId as number, log: log.uploadId as number, vehicle };
  for (const uploadId of [ids.report, ids.log])
    db.addNote({ uploadId, text: "keep", pinnedTimeSec: null, createdAt: "2026-10-12T10:00:00Z" });
  return ids;
}
const pathOf = (id: number) => originalPath(dir, db.getUpload(id)?.storedPath as string);
const failedOf = (id: number) => db.getDerived(id)?.failedError;

describe("app-version re-derive", () => {
  it("serves the old data until each upload is swapped, Reports first", async () => {
    const { report, log } = seed();
    const seen: string[][] = [];
    const next = ingestFor("2", {
      yieldToRequests: async () => {
        seen.push([report, log].map((id) => db.getDerived(id)?.appVersion as string));
      },
    });
    expect(db.staleUploadIds("2")).toEqual([report, log]);
    expect(await next.rederiveStale()).toBe(2);
    expect(seen).toEqual([
      ["1", "1"], // nothing swapped yet: old data served
      ["2", "1"], // the Report is swapped, the Drive Log is still old
    ]);
    expect(db.staleUploadIds("2")).toEqual([]);
    expect(await next.rederiveStale()).toBe(0);
  });

  it("skips an upload that throws, keeps its old data, and carries on", async () => {
    const { report, log } = seed();
    rmSync(pathOf(report));
    mkdirSync(pathOf(report)); // reading a directory throws EISDIR, which is not "missing"
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await ingestFor("2").rederiveStale()).toBe(1);
    error.mockRestore();
    expect(db.getDerived(report)?.appVersion).toBe("1");
    expect(db.getDerived(log)?.appVersion).toBe("2");
  });
});

describe("hash check and Failed Uploads", () => {
  it("fails a missing or edited Original, keeps owner data, and restores when the bytes return", () => {
    const { report, log, vehicle } = seed();
    const ingest = ingestFor("2");
    const logBytes = readFileSync(pathOf(log));
    const owner = db.ownerSnapshot();

    rmSync(pathOf(report));
    writeFileSync(pathOf(log), `${logBytes.toString("utf8")}9999.0, 1, 1\n`);
    ingest.rederiveUploads([report, log]);

    expect(failedOf(report)).toBe("Original missing");
    expect(failedOf(log)).toBe("Original changed on disk");
    expect(db.ownerSnapshot()).toEqual(owner);
    expect(db.listNotes(report)).toHaveLength(1);
    expect(db.listNotes(log)).toHaveLength(1);
    expect(db.getUpload(log)?.vehicleId).toBe(vehicle);

    // Failed Uploads are retried on every re-parse: put the bytes back.
    writeFileSync(pathOf(report), OCT);
    writeFileSync(pathOf(log), logBytes);
    ingest.rederiveUploads([report, log]);
    expect(failedOf(report)).toBeNull();
    expect(failedOf(log)).toBeNull();
    expect(db.getDerived(log)?.channels).not.toBeNull();
    expect(db.ownerSnapshot()).toEqual(owner);
  });

  it("makes a Report whose VIN changed a Failed Upload and does not move it", () => {
    const { report } = seed();
    const other = db.addVehicle({
      vin: "1FT7W2BT5CE000002",
      label: "Other",
      profileId: "generic",
      packIds: [],
    });
    db.assignVehicle(report, other.id); // the stored VIN no longer matches the parsed one
    ingestFor("2").rederiveUpload(report);
    expect(failedOf(report)).toMatch(/VIN changed/);
    expect(db.getUpload(report)?.vehicleId).toBe(other.id);
    expect(db.listNotes(report)).toHaveLength(1);
  });

  it("restores a Report that failed before and now parses, creating its Vehicle", () => {
    const { report, vehicle } = seed();
    // As a Report that failed at upload leaves things: no Vehicle, no recorded time, a failed row.
    db.assignVehicle(report, null);
    db.setRecordedAt(report, null);
    const derived = db.getDerived(report);
    if (!derived) throw new Error("no derived data");
    db.saveDerived(report, {
      ...derived,
      failedError: "old parser bug",
      metadata: null,
      parsedReport: null,
    });
    ingestFor("2").rederiveUpload(report);
    expect(failedOf(report)).toBeNull();
    expect(db.getUpload(report)?.vehicleId).toBe(vehicle);
    expect(db.getUpload(report)?.recordedAt).not.toBeNull();
  });

  it("restores a Drive Log that failed before, filling in its recorded time", () => {
    const { log } = seed();
    db.setRecordedAt(log, null);
    const derived = db.getDerived(log);
    if (!derived) throw new Error("no derived data");
    db.saveDerived(log, { ...derived, failedError: "old parser bug", channels: null, events: [] });
    ingestFor("2").rederiveUpload(log);
    expect(failedOf(log)).toBeNull();
    expect(db.getUpload(log)?.recordedAt).not.toBeNull();
    expect(db.getDerived(log)?.metadata).toMatchObject({ referenceReportId: expect.any(Number) });
  });
});

describe("npm run reparse", () => {
  const capture = () => {
    const lines: string[] = [];
    return {
      lines,
      out: { log: (l: string) => lines.push(l), error: (l: string) => lines.push(l) },
    };
  };

  it("re-derives everything, stamping the running version", () => {
    const { report, log } = seed();
    db.close();
    const { lines, out } = capture();
    expect(main([], { dataDir: dir }, out, "9.9.9")).toBe(0);
    db = openDb(join(dir, "obd-garage.db"));
    expect(db.getDerived(report)?.appVersion).toBe("9.9.9");
    expect(db.getDerived(log)?.appVersion).toBe("9.9.9");
    expect(lines[0]).toBe("Re-derived 2 uploads.");
  });

  it("re-derives one upload and leaves the others", () => {
    const { report, log } = seed();
    db.close();
    expect(main([String(log)], { dataDir: dir }, capture().out, "9.9.9")).toBe(0);
    db = openDb(join(dir, "obd-garage.db"));
    expect(db.getDerived(log)?.appVersion).toBe("9.9.9");
    expect(db.getDerived(report)?.appVersion).toBe("1");
  });

  it("exits non-zero for an unknown id, a bad argument, no database and an unexpected error", () => {
    const { report } = seed();
    db.close();
    expect(main(["999"], { dataDir: dir }, capture().out)).toBe(1);
    expect(main(["abc"], { dataDir: dir }, capture().out)).toBe(1);
    expect(main(["1", "2"], { dataDir: dir }, capture().out)).toBe(1);
    expect(main([], { dataDir: join(dir, "nope") }, capture().out)).toBe(1);

    db = openDb(join(dir, "obd-garage.db"));
    const path = pathOf(report);
    db.close();
    rmSync(path);
    mkdirSync(path); // unreadable, not missing
    const { lines, out } = capture();
    expect(main([], { dataDir: dir }, out)).toBe(1);
    expect(lines.at(-1)).toMatch(/^Re-parse failed:/);
    db = openDb(join(dir, "obd-garage.db"));
  });

  it("runs as a script against DATA_DIR", () => {
    seed();
    db.close();
    const script = fileURLToPath(new URL("./reparse.ts", import.meta.url));
    const run = spawnSync(process.execPath, [script], {
      env: { ...process.env, DATA_DIR: dir },
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Re-derived 2 uploads.");
    db = openDb(join(dir, "obd-garage.db"));
  });
});
