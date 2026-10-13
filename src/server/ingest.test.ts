import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { P0401_PACK } from "../rule-packs/6.7-p0401/index.ts";
import { createApp } from "./app.ts";
import { type Db, openDb } from "./db.ts";
import { createIngest, MAX_UPLOAD_BYTES, type UploadResult } from "./ingest.ts";
import { DEFAULT_REGISTRY as registry } from "./registry.ts";

const fixture = (folder: string, name: string) =>
  readFileSync(new URL(`../../test/fixtures/${folder}/${name}`, import.meta.url));
const OCT = fixture("reports", "Diagnostic_Report_2026-10-02_213218.html");
const AUG = fixture("reports", "Diagnostic Report 2026-08-21 215710.html");
const LOG = fixture("drive-logs", "CSVLog_20261002_175845.csv");
const text = (b: Buffer) => b.toString("utf8");

const NOW = () => new Date("2026-10-12T10:00:00Z");

let dir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-ingest-"));
  db = openDb(join(dir, "t.db"));
  app = createApp({ db, dataDir: dir, registry, now: NOW, appVersion: "test" });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function upload(
  body: Uint8Array | string,
  query: { filename?: string; vehicle?: string | number; headers?: Record<string, string> } = {},
) {
  const params = new URLSearchParams({ filename: query.filename ?? "file" });
  if (query.vehicle !== undefined) params.set("vehicle", String(query.vehicle));
  const res = await app.request(`/api/uploads?${params}`, {
    method: "POST",
    body: body as BodyInit,
    ...(query.headers ? { headers: query.headers } : {}),
  });
  return { status: res.status, body: (await res.json()) as UploadResult };
}

const originalsFiles = () =>
  existsSync(join(dir, "originals"))
    ? readdirSync(join(dir, "originals"), { recursive: true, withFileTypes: true }).filter((e) =>
        e.isFile(),
      )
    : [];

describe("POST /api/uploads with real files", () => {
  it("creates the Vehicle from a Report, refuses a duplicate, and gives a Drive Log Events and its Reference Report", async () => {
    const first = await upload(OCT, { filename: "report.html" });
    expect(first.body.outcome).toBe("added");
    expect(first.body.kind).toBe("report");
    expect(first.body.vehicleCreated).toMatchObject({
      label: "2012 Ford S-Duty F250-F550",
      profile: "6.7",
      packs: ["p0401"],
      sameDayUnassigned: [],
    });
    // The suggestion is stored, and with the real registry it resolves to the real pack.
    expect(db.listVehicles()[0]?.packIds).toEqual(["p0401"]);
    expect(registry.pack("p0401")).toBe(P0401_PACK);

    const again = await upload(OCT, { filename: "again.html" });
    expect(again.body).toMatchObject({
      outcome: "refused",
      kind: "report",
      uploadId: first.body.uploadId,
    });
    expect(db.listUploads()).toHaveLength(1);

    const vehicleId = first.body.vehicleCreated?.id;
    const log = await upload(LOG, { filename: "log.csv", vehicle: vehicleId });
    expect(log.body.outcome).toBe("added");
    expect(log.body.kind).toBe("drive-log");
    const derived = db.getDerived(log.body.uploadId as number);
    expect(derived?.events.length).toBeGreaterThan(0);
    expect(derived?.channels?.length).toBeGreaterThan(0);
    expect(derived?.metadata).toMatchObject({ referenceReportId: first.body.uploadId });
    expect(db.getUpload(log.body.uploadId as number)).toMatchObject({
      vehicleId,
      recordedAt: "2026-10-02T17:58:45.948",
    });
  });

  it("lists same-day Unassigned Drive Logs on the new Vehicle, and not other days", async () => {
    const log = await upload(LOG, { filename: "log.csv" });
    expect(db.getUpload(log.body.uploadId as number)?.vehicleId).toBeNull();

    const aug = await upload(AUG);
    expect(aug.body.vehicleCreated?.sameDayUnassigned).toEqual([]);

    // A second Vehicle (new VIN) on the log's day.
    const oct = await upload(text(OCT).replaceAll("1FT7W2BT5CE000001", "1FT7W2BT5CE000002"));
    expect(oct.body.vehicleCreated?.sameDayUnassigned).toMatchObject([
      { uploadId: log.body.uploadId },
    ]);
  });

  it("re-derives a Vehicle's Drive Logs whose default Reference Report changes", async () => {
    const aug = await upload(AUG);
    const vehicle = aug.body.vehicleCreated?.id;
    const log = await upload(LOG, { vehicle });
    const refOf = () => {
      const meta = db.getDerived(log.body.uploadId as number)?.metadata as {
        referenceReportId: number;
      };
      return meta.referenceReportId;
    };
    expect(refOf()).toBe(aug.body.uploadId);

    const oct = await upload(OCT);
    expect(oct.body.vehicleCreated).toBeUndefined(); // known VIN attaches silently
    expect(db.getUpload(oct.body.uploadId as number)?.vehicleId).toBe(vehicle);
    expect(refOf()).toBe(oct.body.uploadId);
  });

  describe("the default Reference Report on a tie", () => {
    const reportAt = (time: string) =>
      text(OCT).replace(/(<b>Date:<\/b> 10\/2\/2026 )9:32:14\s?PM/, `$1${time}`);
    // Recorded 17:58:45, exactly two hours from 3:58:45 PM and from 7:58:45 PM.
    const logAtFivePm = () =>
      text(LOG).replace("10/02/2026 05:58:45.9486 PM", "10/02/2026 05:58:45.0000 PM");
    const refOf = (id: number | undefined) =>
      (db.getDerived(id as number)?.metadata as { referenceReportId: number } | null)
        ?.referenceReportId;

    it("goes to the earlier-recorded Report, not the first uploaded", async () => {
      const later = await upload(reportAt("7:58:45 PM"));
      const earlier = await upload(reportAt("3:58:45 PM"));
      expect(earlier.body.outcome).toMatch(/added|warned/);
      const vehicle = later.body.vehicleCreated?.id;
      const log = await upload(logAtFivePm(), { vehicle });
      expect(db.getUpload(log.body.uploadId as number)?.recordedAt).toBe("2026-10-02T17:58:45.000");
      expect(refOf(log.body.uploadId)).toBe(earlier.body.uploadId);
    });

    it("goes to the lower id when the Reports were recorded at the same time", async () => {
      const first = await upload(reportAt("3:58:45 PM"));
      const second = await upload(`${reportAt("3:58:45 PM")}<!-- re-export -->`);
      expect(second.body.outcome).toBe("warned"); // stored, flagged as the same recording
      const log = await upload(logAtFivePm(), { vehicle: first.body.vehicleCreated?.id });
      expect(refOf(log.body.uploadId)).toBe(first.body.uploadId);
    });
  });
});

describe("POST /api/uploads with synthetic files", () => {
  it("fails a Report with no VIN: Original kept, error stored, no Vehicle", async () => {
    const noVin = text(OCT).replace("<b>VIN:</b>", "<b>Vin number</b>");
    const r = await upload(noVin);
    expect(r.body.outcome).toBe("failed");
    expect(r.body.kind).toBe("report");
    expect(r.body.reason).toMatch(/VIN/);
    expect(db.listVehicles()).toEqual([]);
    expect(originalsFiles()).toHaveLength(1);
    expect(db.getDerived(r.body.uploadId as number)?.failedError).toMatch(/VIN/);
  });

  it("fails a Drive Log without a byte order mark but keeps the chosen Vehicle", async () => {
    const aug = await upload(AUG);
    const vehicle = aug.body.vehicleCreated?.id as number;
    const r = await upload(text(LOG).replace("﻿", ""), { vehicle });
    expect(r.body.outcome).toBe("failed");
    expect(r.body.kind).toBe("drive-log");
    expect(db.getUpload(r.body.uploadId as number)?.vehicleId).toBe(vehicle);
  });

  it("refuses random bytes and keeps nothing on disk", async () => {
    const r = await upload(new Uint8Array([1, 2, 3, 250, 251, 7, 7, 7]));
    expect(r.body).toMatchObject({ outcome: "refused", kind: "unknown" });
    expect(originalsFiles()).toEqual([]);
    expect(db.listUploads()).toEqual([]);
  });

  it("refuses a file over 25 MB by declared size without reading the body", async () => {
    const byHeader = await upload("tiny", {
      headers: { "content-length": String(MAX_UPLOAD_BYTES + 1) },
    });
    expect(byHeader.body).toMatchObject({ outcome: "refused", reason: /25 MB/ });
    expect(originalsFiles()).toEqual([]);
  });

  it("stops reading a streamed body with no declared size once it passes 25 MB", async () => {
    const MB = 1024 * 1024;
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled > 40) controller.close();
        else controller.enqueue(new Uint8Array(MB));
      },
    });
    const res = await app.request("/api/uploads?filename=big", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await res.json()).toMatchObject({ outcome: "refused", reason: /25 MB/ });
    expect(pulled).toBeLessThan(30);
    expect(originalsFiles()).toEqual([]);
  });

  it("refuses an oversized file passed straight to ingest, skipping the route", () => {
    const r = createIngest({ db, dataDir: dir, registry, now: NOW }).ingest({
      bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1),
      filename: "big",
      vehicleId: null,
    });
    expect(r).toMatchObject({ outcome: "refused", reason: /25 MB/ });
    expect(originalsFiles()).toEqual([]);
  });

  it("answers 400 for an unknown Vehicle", async () => {
    expect((await upload(LOG, { vehicle: 99 })).status).toBe(400);
    expect((await upload(LOG, { vehicle: "abc" })).status).toBe(400);
  });

  it("appends the VIN's last 4 when two Vehicles would share a label", async () => {
    const a = await upload(OCT);
    const b = await upload(text(OCT).replaceAll("1FT7W2BT5CE000001", "1FT7W2BT5CE001234"));
    expect(a.body.vehicleCreated?.label).toBe("2012 Ford S-Duty F250-F550");
    expect(b.body.vehicleCreated?.label).toBe("2012 Ford S-Duty F250-F550 · …1234");
  });

  it("uses the VIN as the label when Year, Make or Model is missing", async () => {
    const r = await upload(text(OCT).replace("<b>Make:</b> Ford", ""));
    expect(r.body.vehicleCreated?.label).toBe("1FT7W2BT5CE000001");
  });
});

describe("warnings", () => {
  it("warns, without blocking, about an overlapping Drive Log on the same Vehicle", async () => {
    const oct = await upload(OCT);
    const vehicle = oct.body.vehicleCreated?.id;
    await upload(LOG, { vehicle });
    const r = await upload(`${text(LOG)}1000.0, 1, 1\n`, { vehicle });
    expect(r.body.outcome).toBe("warned");
    expect(r.body.warnings.join(" ")).toMatch(/overlaps/);
    expect(r.body.uploadId).toBeDefined();
  });

  it("warns about a Report with the same VIN and timestamp as an existing one", async () => {
    await upload(OCT);
    const r = await upload(`${text(OCT)}<!-- re-export -->`);
    expect(r.body.outcome).toBe("warned");
    expect(r.body.warnings.join(" ")).toMatch(/timestamp/);
  });
});

describe("wipe and re-derive", () => {
  it("re-derives data equal to what ingest wrote, leaving owner data alone", async () => {
    const aug = await upload(AUG);
    const vehicle = aug.body.vehicleCreated?.id;
    const log = await upload(LOG, { vehicle });
    await upload(OCT);
    await upload(text(LOG).replace("﻿", ""), { vehicle }); // a Failed Upload
    db.addNote({
      uploadId: log.body.uploadId as number,
      text: "n",
      pinnedTimeSec: 1.5,
      createdAt: "2026-10-12T10:00:00Z",
    });

    const snapshotDerived = () =>
      db.listUploads().map((u) => {
        const d = db.getDerived(u.id);
        return { id: u.id, d: d && { ...d, channels: Array.from(d.channels ?? []) } };
      });
    const owner = db.ownerSnapshot();
    const before = snapshotDerived();
    expect(before.some((x) => (x.d?.events.length ?? 0) > 0)).toBe(true);

    db.wipeDerived();
    createIngest({ db, dataDir: dir, registry, now: NOW, appVersion: "test" }).rederiveUploads(
      db.listUploads().map((u) => u.id),
    );

    expect(db.ownerSnapshot()).toEqual(owner);
    expect(snapshotDerived()).toEqual(before);
  });
});
