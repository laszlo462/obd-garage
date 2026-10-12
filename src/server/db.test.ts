import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db, openDb } from "./db.ts";
import { originalPath, saveOriginal } from "./originals.ts";

const MIGRATIONS = fileURLToPath(new URL("./migrations", import.meta.url));
let dir: string;
let open: Db[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-db-"));
  open = [];
});
afterEach(() => {
  for (const db of open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

function open_(file = join(dir, "test.db"), migrationsDir?: string): Db {
  const db = openDb(file, migrationsDir ? { migrationsDir } : {});
  open.push(db);
  return db;
}

const NOW = "2026-03-14T10:00:00Z";
let shaCounter = 0;
const sha = () => String(++shaCounter).padStart(64, "0");

function seed(db: Db) {
  const vehicle = db.addVehicle({
    vin: "TESTVIN0000000001",
    label: "2020 Test Truck",
    profileId: "generic",
    packIds: ["p1"],
  });
  const report = db.addUpload({
    kind: "report",
    storedPath: "reports/2026-03/r.html",
    uploadedFilename: "r.html",
    sha256: sha(),
    uploadedAt: NOW,
    recordedAt: "2026-03-14T09:00:00",
    vehicleId: vehicle.id,
  });
  const log = db.addUpload({
    kind: "drive-log",
    storedPath: "drive-logs/2026-03/l.csv",
    uploadedFilename: "l.csv",
    sha256: sha(),
    uploadedAt: NOW,
    recordedAt: "2026-03-14T09:30:00",
    vehicleId: null,
  });
  db.assignVehicle(log.id, vehicle.id);
  db.setReferenceReport(log.id, report.id);
  db.addNote({ uploadId: log.id, text: "hesitation here", pinnedTimeSec: 12.5, createdAt: NOW });
  return { vehicle, report, log };
}

function derive(db: Db, uploadId: number, appVersion = "1.0.0") {
  db.saveDerived(uploadId, {
    appVersion,
    derivedAt: NOW,
    failedError: null,
    metadata: { rows: 2 },
    channels: new Uint8Array([9, 8, 7]),
    parsedReport: null,
    ruleOutcomes: [{ rule: "r1", fired: true }],
    decodeNotices: [],
    warnings: ["row 3 skipped"],
    warningCount: 1,
    events: [{ ruleId: "r1", startSec: 1, endSec: 2, data: { k: 1 } }],
  });
}

describe("migrations", () => {
  it("migrates a fresh database to the latest user_version and is a no-op on re-open", () => {
    const file = join(dir, "test.db");
    const db = open_(file);
    const latest = db.userVersion();
    expect(latest).toBeGreaterThanOrEqual(1);
    const { vehicle } = seed(db);
    db.close();
    open.length = 0;
    const again = open_(file);
    expect(again.userVersion()).toBe(latest);
    expect(again.listVehicles().map((v) => v.id)).toEqual([vehicle.id]);
  });

  it("applies a new migration on top and keeps owner rows", () => {
    const file = join(dir, "test.db");
    const first = open_(file);
    seed(first);
    const before = first.userVersion();
    first.close();
    open.length = 0;

    const migrations = join(dir, "migrations");
    mkdirSync(migrations);
    for (const f of readdirSync(MIGRATIONS)) {
      copyFileSync(join(MIGRATIONS, f), join(migrations, f));
    }
    writeFileSync(
      join(migrations, `${String(before + 1).padStart(4, "0")}_extra.sql`),
      "ALTER TABLE vehicles ADD COLUMN colour TEXT;",
    );

    const db = open_(file, migrations);
    expect(db.userVersion()).toBe(before + 1);
    expect(db.listVehicles()).toHaveLength(1);
    expect(db.listUploads()).toHaveLength(2);
  });

  it("rolls back a failing migration and leaves user_version alone", () => {
    const file = join(dir, "test.db");
    const migrations = join(dir, "migrations");
    mkdirSync(migrations);
    writeFileSync(join(migrations, "0001_ok.sql"), "CREATE TABLE a (x);");
    writeFileSync(
      join(migrations, "0002_bad.sql"),
      "CREATE TABLE b (x); SELECT nope FROM missing;",
    );
    expect(() => openDb(file, { migrationsDir: migrations })).toThrow();
    writeFileSync(join(migrations, "0002_bad.sql"), "CREATE TABLE b (x);");
    const db = open_(file, migrations);
    expect(db.userVersion()).toBe(2);
  });
});

describe("owner data", () => {
  it("refuses a duplicate SHA-256", () => {
    const db = open_();
    const s = sha();
    const base = {
      kind: "report" as const,
      uploadedFilename: "a",
      uploadedAt: NOW,
      recordedAt: null,
      vehicleId: null,
    };
    db.addUpload({ ...base, storedPath: "reports/2026-03/a", sha256: s });
    expect(() => db.addUpload({ ...base, storedPath: "reports/2026-03/b", sha256: s })).toThrow();
    expect(db.findUploadBySha(s)?.storedPath).toBe("reports/2026-03/a");
  });

  it("stores a Reference Report choice, including a cleared one", () => {
    const db = open_();
    const { report, log } = seed(db);
    expect(db.getReferenceReport(log.id)).toEqual({ reportId: report.id });
    db.setReferenceReport(log.id, null);
    expect(db.getReferenceReport(log.id)).toEqual({ reportId: null });
    db.clearReferenceChoice(log.id);
    expect(db.getReferenceReport(log.id)).toBeUndefined();
  });

  it("keeps Notes with an optional pinned Time (sec)", () => {
    const db = open_();
    const { log } = seed(db);
    db.addNote({ uploadId: log.id, text: "whole log", pinnedTimeSec: null, createdAt: NOW });
    expect(db.listNotes(log.id).map((n) => [n.text, n.pinnedTimeSec])).toEqual([
      ["hesitation here", 12.5],
      ["whole log", null],
    ]);
  });

  it("has no owner table that references a derived table", () => {
    const db = open_();
    expect(db.ownerReferencesToDerived()).toEqual([]);
  });
});

describe("derived data", () => {
  it("saves, reads back and replaces a derive result", () => {
    const db = open_();
    const { log } = seed(db);
    derive(db, log.id);
    const d = db.getDerived(log.id);
    expect(d?.metadata).toEqual({ rows: 2 });
    expect(Array.from(d?.channels ?? [])).toEqual([9, 8, 7]);
    expect(d?.events).toEqual([
      expect.objectContaining({ ruleId: "r1", startSec: 1, data: { k: 1 } }),
    ]);
    derive(db, log.id, "2.0.0");
    expect(db.getDerived(log.id)?.events).toHaveLength(1);
    expect(db.getDerived(log.id)?.appVersion).toBe("2.0.0");
  });

  it("lists uploads whose derived data is missing or stamped with another app version", () => {
    const db = open_();
    const { report, log } = seed(db);
    derive(db, log.id, "1.0.0");
    expect(db.staleUploadIds("1.0.0")).toEqual([report.id]);
    expect(db.staleUploadIds("2.0.0").sort()).toEqual([report.id, log.id].sort());
  });

  it("wipes all derived data and leaves owner data intact", () => {
    const db = open_();
    const { log, report } = seed(db);
    derive(db, log.id);
    const ownerBefore = db.ownerSnapshot();
    db.wipeDerived();
    expect(db.getDerived(log.id)).toBeUndefined();
    expect(db.ownerSnapshot()).toEqual(ownerBefore);
    expect(ownerBefore.uploads).toHaveLength(2);
    expect(ownerBefore.notes).toHaveLength(1);
    expect(db.staleUploadIds("1.0.0").sort()).toEqual([report.id, log.id].sort());
  });

  it("removes derived rows when their upload is deleted", () => {
    const db = open_();
    const { log } = seed(db);
    derive(db, log.id);
    db.deleteUpload(log.id);
    expect(db.getDerived(log.id)).toBeUndefined();
    expect(db.listNotes(log.id)).toEqual([]);
  });
});

describe("Originals with the database", () => {
  it("leaves no file and no row when the commit fails (duplicate SHA-256)", () => {
    const db = open_();
    const s = sha();
    const add = (name: string) =>
      saveOriginal(
        dir,
        { kind: "drive-log", filename: name, bytes: new Uint8Array([1]), uploadedAt: NOW },
        (storedPath) =>
          db.addUpload({
            kind: "drive-log",
            storedPath,
            uploadedFilename: name,
            sha256: s,
            uploadedAt: NOW,
            recordedAt: null,
            vehicleId: null,
          }),
      );
    const first = add("a.csv");
    expect(() => add("b.csv")).toThrow();
    expect(db.listUploads()).toHaveLength(1);
    expect(existsSync(originalPath(dir, first.storedPath))).toBe(true);
    expect(existsSync(join(dir, "originals", "drive-logs", "2026-03", "b.csv"))).toBe(false);
  });
});
