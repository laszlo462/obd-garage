import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { type Db, openDb } from "./db.ts";
import type { UploadResult } from "./ingest.ts";
import { DEFAULT_REGISTRY as registry } from "./registry.ts";

const fixture = (folder: string, name: string) =>
  readFileSync(new URL(`../../test/fixtures/${folder}/${name}`, import.meta.url));
const OCT = fixture("reports", "Diagnostic_Report_2026-10-02_213218.html");
const AUG = fixture("reports", "Diagnostic Report 2026-08-21 215710.html");
const LOG = fixture("drive-logs", "CSVLog_20261002_175845.csv");
const OTHER_LOG = fixture("drive-logs", "CSVLog_20261002_204254.csv");
const NOW = () => new Date("2026-10-12T10:00:00Z");

let dir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-light-"));
  db = openDb(join(dir, "t.db"));
  app = createApp({ db, dataDir: dir, registry, now: NOW, appVersion: "test" });
});
afterEach(() => {
  vi.restoreAllMocks();
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
const get = async (path: string) => (await app.request(`/api${path}`)).json();

/** A Vehicle with two Reports, a Drive Log, an Unassigned Drive Log and a Failed Upload. */
async function setup() {
  const aug = await upload(AUG, "aug.html");
  const vehicleId = aug.vehicleCreated?.id as number;
  await upload(OCT, "oct.html");
  await upload(LOG, "log.csv", vehicleId);
  await upload(LOG.toString("utf8").replace("﻿", ""), "bad.csv", vehicleId);
  await upload(OTHER_LOG, "loose.csv");
  return vehicleId;
}

describe("list routes read only the light derived summary", () => {
  it("does not load whole derived rows for the Recent feed", async () => {
    const vehicleId = await setup();
    const spy = vi.spyOn(db, "getDerived");
    const body = (await get(`/uploads?vehicle=${vehicleId}`)) as { items: unknown[] };
    expect(body.items.length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not load whole derived rows for the Reports list", async () => {
    const vehicleId = await setup();
    const spy = vi.spyOn(db, "getDerived");
    expect(((await get(`/reports?vehicle=${vehicleId}`)) as unknown[]).length).toBe(2);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not load whole derived rows for the Failed Uploads list", async () => {
    await setup();
    const spy = vi.spyOn(db, "getDerived");
    expect(((await get("/failed-uploads")) as unknown[]).length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not load whole derived rows for the Unassigned Drive Logs list", async () => {
    await setup();
    const spy = vi.spyOn(db, "getDerived");
    expect(((await get("/drive-logs?unassigned=1")) as unknown[]).length).toBe(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("loads only the latest Report's row for the Vehicle status, and none for the list", async () => {
    const vehicleId = await setup();
    const spy = vi.spyOn(db, "getDerived");
    await get("/vehicles");
    expect(spy).not.toHaveBeenCalled();
    await get(`/vehicles/${vehicleId}/status`);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("does not load a whole derived row to check a chosen Reference Report", async () => {
    const vehicleId = await setup();
    const logs = (await get(`/uploads?vehicle=${vehicleId}`)) as {
      items: { id: number; kind: string }[];
    };
    const log = logs.items.find((i) => i.kind === "drive-log");
    const report = logs.items.find((i) => i.kind === "report");
    const spy = vi.spyOn(db, "getDerived");
    const res = await app.request(`/api/drive-logs/${log?.id}/reference`, {
      method: "PUT",
      body: JSON.stringify({ reportId: report?.id }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBeLessThan(400);
    // Only the re-derive's Reference Report parse may load a whole row.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
