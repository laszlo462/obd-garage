import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { type Db, openDb } from "./db.ts";
import { createIngest, type UploadResult } from "./ingest.ts";
import { originalPath } from "./originals.ts";
import { DEFAULT_REGISTRY as registry } from "./registry.ts";

const fixture = (folder: string, name: string) =>
  readFileSync(new URL(`../../test/fixtures/${folder}/${name}`, import.meta.url));
const OCT = fixture("reports", "Diagnostic_Report_2026-10-02_213218.html");
const AUG = fixture("reports", "Diagnostic Report 2026-08-21 215710.html");
const LOG = fixture("drive-logs", "CSVLog_20261002_175845.csv");
const NOW = () => new Date("2026-10-12T10:00:00Z");

let dir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-vehicles-"));
  db = openDb(join(dir, "t.db"));
  app = createApp({ db, dataDir: dir, registry, now: NOW, appVersion: "test" });
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

const send = (path: string, method: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });

/** A Vehicle from the October Report, plus the August Report on it, and one Drive Log on 2026-10-02. */
async function setup(assigned = true) {
  const aug = await upload(AUG, "aug.html");
  const vehicleId = aug.vehicleCreated?.id as number;
  const oct = await upload(OCT, "oct.html");
  const log = await upload(LOG, "log.csv", assigned ? vehicleId : undefined);
  return {
    vehicleId,
    augId: aug.uploadId as number,
    octId: oct.uploadId as number,
    logId: log.uploadId as number,
  };
}

const metaOf = (id: number) =>
  db.getDerived(id)?.metadata as { referenceReportId: number | null } | null;
const outcomeRules = (id: number) =>
  ((db.getDerived(id)?.ruleOutcomes ?? []) as { ruleId: string }[]).map((o) => o.ruleId);

describe("GET /api/vehicles, /api/profiles, /api/rule-packs", () => {
  it("lists each Vehicle with its Profile, packs, counts and latest Report date", async () => {
    const { vehicleId } = await setup();
    const res = await send("/vehicles", "GET");
    expect(await res.json()).toEqual([
      {
        id: vehicleId,
        label: "2012 Ford S-Duty F250-F550",
        vin: expect.any(String),
        profileId: "6.7",
        packIds: ["p0401"],
        reportCount: 2,
        driveLogCount: 1,
        latestReportDate: expect.stringMatching(/^2026-10-02T/),
      },
    ]);
  });

  it("lists Profiles and Rule Packs for the pickers", async () => {
    expect(await (await send("/profiles", "GET")).json()).toEqual([
      { id: "6.7", name: expect.any(String) },
      { id: "generic", name: expect.any(String) },
    ]);
    expect(await (await send("/rule-packs", "GET")).json()).toEqual([
      { id: "p0401", name: "6.7 P0401" },
    ]);
  });
});

describe("PATCH /api/vehicles/:id", () => {
  it("re-derives the Vehicle's logs when a pack is toggled, and keeps Notes", async () => {
    const { vehicleId, logId } = await setup();
    db.addNote({ uploadId: logId, text: "n", pinnedTimeSec: 2, createdAt: "2026-10-12T10:00:00Z" });
    expect(outcomeRules(logId)).toContain("p0401.entry-window");

    const res = await send(`/vehicles/${vehicleId}`, "PATCH", { packIds: [] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ packIds: [], profileId: "6.7" });
    expect(outcomeRules(logId)).not.toContain("p0401.entry-window");
    expect(db.listNotes(logId)).toHaveLength(1);
  });

  it("keeps the pack toggles when only the Profile changes", async () => {
    const { vehicleId, logId } = await setup();
    const res = await send(`/vehicles/${vehicleId}`, "PATCH", { profileId: "generic" });
    expect(await res.json()).toMatchObject({ profileId: "generic", packIds: ["p0401"] });
    expect(db.getVehicle(vehicleId)).toMatchObject({ profileId: "generic", packIds: ["p0401"] });
    expect(db.getDerived(logId)?.failedError).toBeNull();
  });

  it("rejects an unknown Vehicle, Profile or pack without changing anything", async () => {
    const { vehicleId } = await setup();
    expect((await send("/vehicles/999", "PATCH", { packIds: [] })).status).toBe(404);
    expect((await send(`/vehicles/${vehicleId}`, "PATCH", { profileId: "nope" })).status).toBe(400);
    expect((await send(`/vehicles/${vehicleId}`, "PATCH", { packIds: ["nope"] })).status).toBe(400);
    expect((await send(`/vehicles/${vehicleId}`, "PATCH", { packIds: "p0401" })).status).toBe(400);
    expect(db.getVehicle(vehicleId)).toMatchObject({ profileId: "6.7", packIds: ["p0401"] });
  });
});

describe("POST /api/drive-logs/assign", () => {
  it("gives an Unassigned log the Vehicle's closest Report and its pack Events, and unassigning removes them", async () => {
    const { vehicleId, octId, logId } = await setup(false);
    expect(metaOf(logId)?.referenceReportId).toBeNull();
    expect(outcomeRules(logId)).not.toContain("p0401.entry-window");
    const unassignedEvents = db.getDerived(logId)?.events;

    db.addNote({ uploadId: logId, text: "n", pinnedTimeSec: 2, createdAt: "2026-10-12T10:00:00Z" });
    const assign = await send("/drive-logs/assign", "POST", { logIds: [logId], vehicleId });
    expect(assign.status).toBe(200);
    expect(db.getUpload(logId)?.vehicleId).toBe(vehicleId);
    expect(metaOf(logId)?.referenceReportId).toBe(octId);
    expect(outcomeRules(logId)).toContain("p0401.entry-window");
    expect(db.getDerived(logId)?.events.length).toBeGreaterThanOrEqual(
      unassignedEvents?.length ?? 0,
    );

    const unassign = await send("/drive-logs/assign", "POST", { logIds: [logId], vehicleId: null });
    expect(unassign.status).toBe(200);
    expect(db.getUpload(logId)?.vehicleId).toBeNull();
    expect(metaOf(logId)?.referenceReportId).toBeNull();
    expect(outcomeRules(logId)).not.toContain("p0401.entry-window");
    expect(db.getDerived(logId)?.events).toEqual(unassignedEvents);
    expect(db.listNotes(logId)).toHaveLength(1);
  });

  it("clears a hand-set Reference Report when the log changes Vehicle", async () => {
    const { vehicleId, augId, logId } = await setup();
    await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: augId });
    expect(db.getReferenceReport(logId)).toEqual({ reportId: augId });
    await send("/drive-logs/assign", "POST", { logIds: [logId], vehicleId: null });
    expect(db.getReferenceReport(logId)).toBeUndefined();
    await send("/drive-logs/assign", "POST", { logIds: [logId], vehicleId });
    expect(metaOf(logId)?.referenceReportId).not.toBe(augId);
  });

  it("rejects bad input and changes nothing when any log is unknown", async () => {
    const { vehicleId, logId } = await setup();
    expect((await send("/drive-logs/assign", "POST", { logIds: "x", vehicleId })).status).toBe(400);
    expect((await send("/drive-logs/assign", "POST", { logIds: [logId] })).status).toBe(400);
    expect(
      (await send("/drive-logs/assign", "POST", { logIds: [logId], vehicleId: 99 })).status,
    ).toBe(404);
    const bad = await send("/drive-logs/assign", "POST", { logIds: [logId, 999], vehicleId: null });
    expect(bad.status).toBe(404);
    expect(db.getUpload(logId)?.vehicleId).toBe(vehicleId);
  });

  it("does not take a Report as a Drive Log", async () => {
    const { vehicleId, octId } = await setup();
    const res = await send("/drive-logs/assign", "POST", { logIds: [octId], vehicleId: null });
    expect(res.status).toBe(404);
    expect(db.getUpload(octId)?.vehicleId).toBe(vehicleId);
  });
});

describe("Reference Report routes", () => {
  it("sets, clears and reverts the Reference Report, re-deriving each time", async () => {
    const { augId, octId, logId } = await setup();
    expect(metaOf(logId)?.referenceReportId).toBe(octId);

    const set = await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: augId });
    expect(await set.json()).toEqual({ state: "set", reportId: augId });
    expect(metaOf(logId)?.referenceReportId).toBe(augId);

    const cleared = await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: null });
    expect(await cleared.json()).toEqual({ state: "cleared", reportId: null });
    expect(metaOf(logId)?.referenceReportId).toBeNull();
    expect(db.getReferenceReport(logId)).toEqual({ reportId: null });

    const reverted = await send(`/drive-logs/${logId}/reference`, "DELETE");
    expect(await reverted.json()).toEqual({ state: "default" });
    expect(metaOf(logId)?.referenceReportId).toBe(octId);
    expect(db.getReferenceReport(logId)).toBeUndefined();
  });

  it("keeps hand-set and hand-cleared states, and the default, through a full re-derive", async () => {
    const { vehicleId, augId, logId } = await setup();
    const second = await upload(`${LOG.toString("utf8")}1000.0, 1, 1\n`, "log2.csv", vehicleId);
    const secondId = second.uploadId as number;

    await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: augId });
    await send(`/drive-logs/${secondId}/reference`, "PUT", { reportId: null });
    const before = [logId, secondId].map((id) => metaOf(id)?.referenceReportId);
    const owner = db.ownerSnapshot();

    db.wipeDerived();
    createIngest({ db, dataDir: dir, registry, now: NOW, appVersion: "test" }).rederiveUploads(
      db.listUploads().map((u) => u.id),
    );

    expect([logId, secondId].map((id) => metaOf(id)?.referenceReportId)).toEqual(before);
    expect(before).toEqual([augId, null]);
    expect(db.ownerSnapshot()).toEqual(owner);
  });

  it("rejects an unknown log, a foreign Report, a non-Report and an Unassigned log", async () => {
    const { logId, octId } = await setup();
    const other = await upload(
      OCT.toString("utf8").replaceAll("1FT7W2BT5CE000001", "1FT7W2BT5CE000002"),
      "other.html",
    );
    expect((await send("/drive-logs/999/reference", "PUT", { reportId: null })).status).toBe(404);
    expect((await send("/drive-logs/999/reference", "DELETE")).status).toBe(404);
    expect((await send(`/drive-logs/${octId}/reference`, "DELETE")).status).toBe(404);
    expect((await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: "x" })).status).toBe(
      400,
    );
    const foreign = await send(`/drive-logs/${logId}/reference`, "PUT", {
      reportId: other.uploadId,
    });
    expect(foreign.status).toBe(400);
    const notReport = await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: logId });
    expect(notReport.status).toBe(400);

    await send("/drive-logs/assign", "POST", { logIds: [logId], vehicleId: null });
    expect((await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: octId })).status).toBe(
      409,
    );
  });
});

describe("DELETE /api/vehicles/:id", () => {
  it("removes Reports and their Notes, and leaves the Drive Logs Unassigned", async () => {
    const { vehicleId, octId, logId } = await setup();
    db.addNote({
      uploadId: octId,
      text: "r",
      pinnedTimeSec: null,
      createdAt: "2026-10-12T10:00:00Z",
    });
    db.addNote({ uploadId: logId, text: "l", pinnedTimeSec: 2, createdAt: "2026-10-12T10:00:00Z" });
    await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: octId });
    const reportPath = originalPath(dir, db.getUpload(octId)?.storedPath as string);
    expect(existsSync(reportPath)).toBe(true);

    const res = await send(`/vehicles/${vehicleId}`, "DELETE");
    expect(await res.json()).toEqual({
      reportsDeleted: 2,
      driveLogsDeleted: 0,
      driveLogsUnassigned: 1,
    });
    expect(db.getVehicle(vehicleId)).toBeUndefined();
    expect(db.getUpload(octId)).toBeUndefined();
    expect(existsSync(reportPath)).toBe(false);
    expect(db.getUpload(logId)).toMatchObject({ vehicleId: null });
    expect(db.listNotes(logId)).toHaveLength(1);
    expect(db.getReferenceReport(logId)).toBeUndefined();
    expect(metaOf(logId)?.referenceReportId).toBeNull();
    expect(outcomeRules(logId)).not.toContain("p0401.entry-window");
  });

  it("also deletes the Drive Logs, with their files, when deleteLogs is set", async () => {
    const { vehicleId, logId } = await setup();
    const logPath = originalPath(dir, db.getUpload(logId)?.storedPath as string);
    const res = await send(`/vehicles/${vehicleId}?deleteLogs=true`, "DELETE");
    expect(await res.json()).toEqual({
      reportsDeleted: 2,
      driveLogsDeleted: 1,
      driveLogsUnassigned: 0,
    });
    expect(db.listUploads()).toEqual([]);
    expect(existsSync(logPath)).toBe(false);
  });

  it("makes a fresh Vehicle when the same VIN arrives again, and 404s an unknown id", async () => {
    const { vehicleId } = await setup();
    await send(`/vehicles/${vehicleId}`, "DELETE");
    const again = await upload(OCT, "oct-again.html");
    expect(again.vehicleCreated).toMatchObject({ label: "2012 Ford S-Duty F250-F550" });
    expect(db.listVehicles()).toHaveLength(1);
    expect(db.listUploads()).toHaveLength(2); // the new Report and the Unassigned log
    expect((await send("/vehicles/999", "DELETE")).status).toBe(404);
  });

  it("lets a Vehicle survive losing all its Reports, then picks up a new Report as the default", async () => {
    const { vehicleId, augId, octId, logId } = await setup();
    // Reports go one at a time through the upload delete slice; here the rows go directly.
    db.deleteUpload(augId);
    db.deleteUpload(octId);
    const ingest = createIngest({ db, dataDir: dir, registry, now: NOW, appVersion: "test" });
    ingest.rederiveVehicleLogs(vehicleId);
    expect(db.getVehicle(vehicleId)).toBeDefined();
    expect(metaOf(logId)?.referenceReportId).toBeNull();

    const fresh = await upload(OCT, "oct-new.html");
    expect(fresh.vehicleCreated).toBeUndefined();
    expect(metaOf(logId)?.referenceReportId).toBe(fresh.uploadId);
  });
});

describe("re-derive seam", () => {
  it("rederiveUpload re-derives one upload and answers false for an unknown id", async () => {
    const { logId } = await setup();
    const ingest = createIngest({
      db,
      dataDir: dir,
      registry,
      now: () => new Date("2027-01-01T00:00:00Z"),
      appVersion: "next",
    });
    expect(ingest.rederiveUpload(logId)).toBe(true);
    expect(db.getDerived(logId)).toMatchObject({ appVersion: "next" });
    expect(ingest.rederiveUpload(999)).toBe(false);
  });
});
