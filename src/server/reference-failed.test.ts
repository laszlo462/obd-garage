import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { type Db, openDb } from "./db.ts";
import type { UploadResult } from "./ingest.ts";
import { createIngest } from "./ingest.ts";
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
  dir = mkdtempSync(join(tmpdir(), "obd-reffail-"));
  db = openDb(join(dir, "t.db"));
  app = createApp({ db, dataDir: dir, registry, now: NOW, appVersion: "test" });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function upload(body: Uint8Array, filename: string, vehicle?: number) {
  const params = new URLSearchParams({ filename });
  if (vehicle !== undefined) params.set("vehicle", String(vehicle));
  const res = await app.request(`/api/uploads?${params}`, {
    method: "POST",
    body: body as BodyInit,
  });
  return (await res.json()) as UploadResult;
}
const send = (path: string, method = "GET", body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });

/** The August and October Reports and a Drive Log on 2026-10-02; October is the default. */
async function setup() {
  const aug = await upload(AUG, "aug.html");
  const vehicleId = aug.vehicleCreated?.id as number;
  const oct = await upload(OCT, "oct.html");
  const log = await upload(LOG, "log.csv", vehicleId);
  return {
    augId: aug.uploadId as number,
    octId: oct.uploadId as number,
    logId: log.uploadId as number,
  };
}
const reference = async (logId: number) =>
  ((await (await send(`/drive-logs/${logId}`)).json()) as { referenceReport: unknown })
    .referenceReport;
const derivedReference = (logId: number) =>
  (db.getDerived(logId)?.metadata as { referenceReportId: number | null } | undefined)
    ?.referenceReportId;
const pathOf = (id: number) => originalPath(dir, db.getUpload(id)?.storedPath as string);
const reparse = (id: number) =>
  createIngest({ db, dataDir: dir, registry, now: NOW, appVersion: "test" }).rederiveUpload(id);

describe("a Failed Upload as the Reference Report", () => {
  it("is rejected by PUT, and the earlier choice stays", async () => {
    const { augId, octId, logId } = await setup();
    await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: augId });
    rmSync(pathOf(octId));
    reparse(octId);

    const res = await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: octId });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/failed/i);
    expect(await reference(logId)).toMatchObject({ id: augId, state: "set" });
  });

  it("keeps a chosen Report that fails on re-parse, and resolves to the default meanwhile", async () => {
    const { augId, octId, logId } = await setup();
    await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: augId });
    expect(derivedReference(logId)).toBe(augId);

    rmSync(pathOf(augId));
    reparse(augId);

    expect(await reference(logId)).toMatchObject({ id: octId, state: "default" });
    expect(derivedReference(logId)).toBe(octId);
    expect(db.getReferenceReport(logId)?.reportId).toBe(augId);
  });

  it("brings the choice back when the Report re-parses", async () => {
    const { augId, logId } = await setup();
    await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: augId });
    rmSync(pathOf(augId));
    reparse(augId);

    writeFileSync(pathOf(augId), AUG);
    reparse(augId);

    expect(await reference(logId)).toMatchObject({ id: augId, state: "set" });
    expect(derivedReference(logId)).toBe(augId);
  });
});
