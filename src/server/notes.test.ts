import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { type Db, openDb } from "./db.ts";
import { createIngest, type UploadResult } from "./ingest.ts";
import { DEFAULT_REGISTRY as registry } from "./registry.ts";

const fixture = (folder: string, name: string) =>
  readFileSync(new URL(`../../test/fixtures/${folder}/${name}`, import.meta.url));
const OCT = fixture("reports", "Diagnostic_Report_2026-10-02_213218.html");
const LOG = fixture("drive-logs", "CSVLog_20261002_175845.csv");
const NOW = () => new Date("2026-10-12T10:00:00Z");

let dir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-notes-"));
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

const send = (path: string, method: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });

async function setup() {
  const report = await upload(OCT, "oct.html");
  const vehicleId = report.vehicleCreated?.id as number;
  const log = await upload(LOG, "log.csv", vehicleId);
  return { vehicleId, reportId: report.uploadId as number, logId: log.uploadId as number };
}

const axisOf = (id: number): { t: number[] } =>
  JSON.parse(new TextDecoder().decode(db.getDerived(id)?.channels as Uint8Array));
const durationOf = (id: number) =>
  ((db.getDerived(id)?.metadata ?? { duration: 0 }) as { duration: number }).duration;

describe("Notes CRUD", () => {
  it("creates, lists, edits and deletes Notes on a Drive Log and on a Report", async () => {
    const { logId, reportId } = await setup();

    const made = await send(`/uploads/${logId}/notes`, "POST", { text: "whole drive" });
    expect(made.status).toBe(201);
    const note = await made.json();
    expect(note).toMatchObject({
      uploadId: logId,
      text: "whole drive",
      pinnedTimeSec: null,
      snappedTimeSec: null,
      createdAt: "2026-10-12T10:00:00.000Z",
    });
    await send(`/uploads/${reportId}/notes`, "POST", { text: "on the report" });

    expect(await (await send(`/uploads/${logId}/notes`, "GET")).json()).toEqual([note]);
    const onReport = (await (await send(`/uploads/${reportId}/notes`, "GET")).json()) as unknown[];
    expect(onReport).toHaveLength(1);

    const edited = await send(`/notes/${note.id}`, "PATCH", { text: "edited" });
    expect(await edited.json()).toEqual({ ...note, text: "edited" });
    expect(db.getNote(note.id)?.text).toBe("edited");

    expect(await (await send(`/notes/${note.id}`, "DELETE")).json()).toEqual({ deleted: note.id });
    expect(await (await send(`/uploads/${logId}/notes`, "GET")).json()).toEqual([]);
  });

  it("stores Note text verbatim as plain text", async () => {
    const { logId } = await setup();
    const text = "<img src=x onerror=alert(1)> & more";
    const note = await (await send(`/uploads/${logId}/notes`, "POST", { text })).json();
    expect(note.text).toBe(text);
  });

  it("answers 404 for unknown uploads and Notes, 400 for bad bodies", async () => {
    const { logId } = await setup();
    expect((await send("/uploads/999/notes", "GET")).status).toBe(404);
    expect((await send("/uploads/999/notes", "POST", { text: "x" })).status).toBe(404);
    expect((await send("/uploads/abc/notes", "GET")).status).toBe(404);
    expect((await send("/notes/999", "PATCH", { text: "x" })).status).toBe(404);
    expect((await send("/notes/999", "DELETE")).status).toBe(404);
    expect((await send(`/uploads/${logId}/notes`, "POST", {})).status).toBe(400);
    expect((await send(`/uploads/${logId}/notes`, "POST", { text: "  " })).status).toBe(400);
    const badPin = await send(`/uploads/${logId}/notes`, "POST", { text: "x", pinnedAt: "1" });
    expect(badPin.status).toBe(400);
    const note = await (await send(`/uploads/${logId}/notes`, "POST", { text: "x" })).json();
    expect((await send(`/notes/${note.id}`, "PATCH", { text: 5 })).status).toBe(400);
  });
});

describe("pinned Notes", () => {
  it("rejects pinnedAt on a Report and outside the log's time range", async () => {
    const { logId, reportId } = await setup();
    const first = axisOf(logId).t[0] as number;
    const pin = (id: number, pinnedAt: number) =>
      send(`/uploads/${id}/notes`, "POST", { text: "x", pinnedAt });
    expect((await pin(reportId, 1)).status).toBe(400);
    expect((await pin(logId, first - 1)).status).toBe(400);
    expect((await pin(logId, first + durationOf(logId) + 1)).status).toBe(400);
    expect(db.listNotes(logId)).toEqual([]);
    expect(db.listNotes(reportId)).toEqual([]);
  });

  it("accepts pins at both ends of the log's time range", async () => {
    const { logId } = await setup();
    const first = axisOf(logId).t[0] as number;
    for (const pinnedAt of [first, first + durationOf(logId)]) {
      const res = await send(`/uploads/${logId}/notes`, "POST", { text: "e", pinnedAt });
      expect(res.status).toBe(201);
    }
  });

  it("returns the nearest displayed row's Time (sec) for a pinned Note", async () => {
    const { logId } = await setup();
    const { t } = axisOf(logId);
    const a = t[3] as number;
    const b = t[4] as number;
    const near = a + (b - a) * 0.25;
    const res = await send(`/uploads/${logId}/notes`, "POST", { text: "here", pinnedAt: near });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ pinnedTimeSec: near, snappedTimeSec: a });
    const listed = await (await send(`/uploads/${logId}/notes`, "GET")).json();
    expect(listed[0].snappedTimeSec).toBe(a);
  });

  it("snaps from the current derived data, so it follows a change to collapse", async () => {
    const { logId } = await setup();
    const { t } = axisOf(logId);
    const pinned = (t[3] as number) + 0.0001;
    await send(`/uploads/${logId}/notes`, "POST", { text: "here", pinnedAt: pinned });

    // Different collapse: row 3 is no longer displayed, so the pin moves to a neighbour.
    const derived = db.getDerived(logId);
    if (!derived) throw new Error("no derived data");
    const kept = t.filter((_, i) => i !== 3);
    db.saveDerived(logId, {
      ...derived,
      channels: new TextEncoder().encode(JSON.stringify({ t: kept, channels: {} })),
    });
    const [after] = await (await send(`/uploads/${logId}/notes`, "GET")).json();
    expect(after.pinnedTimeSec).toBe(pinned);
    expect(kept).toContain(after.snappedTimeSec);
    expect(after.snappedTimeSec).not.toBe(t[3]);
  });
});

describe("Notes are owner data", () => {
  it("survive reassign, a Profile change and a full re-derive", async () => {
    const { logId, vehicleId } = await setup();
    const t = axisOf(logId).t[5] as number;
    await send(`/uploads/${logId}/notes`, "POST", { text: "pinned", pinnedAt: t });
    await send(`/uploads/${logId}/notes`, "POST", { text: "whole" });
    const before = db.listNotes(logId);

    await send("/drive-logs/assign", "POST", { logIds: [logId], vehicleId: null });
    expect(db.listNotes(logId)).toEqual(before);
    await send("/drive-logs/assign", "POST", { logIds: [logId], vehicleId });
    await send(`/vehicles/${vehicleId}`, "PATCH", { profileId: "generic" });
    expect(db.listNotes(logId)).toEqual(before);

    db.wipeDerived();
    createIngest({ db, dataDir: dir, registry, now: NOW, appVersion: "test" }).rederiveUploads(
      db.listUploads().map((u) => u.id),
    );
    expect(db.listNotes(logId)).toEqual(before);
    const listed = (await (await send(`/uploads/${logId}/notes`, "GET")).json()) as {
      text: string;
      snappedTimeSec: number | null;
    }[];
    expect(listed.map((n) => [n.text, n.snappedTimeSec])).toEqual([
      ["pinned", t],
      ["whole", null],
    ]);
  });

  it("are deleted with their upload (database layer; the route belongs to #47)", async () => {
    const { logId } = await setup();
    await send(`/uploads/${logId}/notes`, "POST", { text: "x" });
    db.deleteUpload(logId);
    expect(db.listNotes(logId)).toEqual([]);
  });
});
