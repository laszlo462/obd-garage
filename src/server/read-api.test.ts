import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { hc } from "hono/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SIX_SEVEN } from "../profiles/six-seven.ts";
import { type AppType, createApp } from "./app.ts";
import { type Db, openDb } from "./db.ts";
import type { UploadResult } from "./ingest.ts";
import { originalPath } from "./originals.ts";
import { DEFAULT_REGISTRY as registry } from "./registry.ts";

const fixture = (folder: string, name: string) =>
  readFileSync(new URL(`../../test/fixtures/${folder}/${name}`, import.meta.url));
const OCT = fixture("reports", "Diagnostic_Report_2026-10-02_213218.html");
const AUG = fixture("reports", "Diagnostic Report 2026-08-21 215710.html");
const LOG = fixture("drive-logs", "CSVLog_20261002_175845.csv");
/** The largest fixture log; it also has an annotation file. */
const BIG = fixture("drive-logs", "CSVLog_20261002_204254.csv");
const NOW = () => new Date("2026-10-12T10:00:00Z");

let dir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-read-"));
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

const send = (path: string, method = "GET", body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
const getJson = async (path: string) => (await send(path)).json();

/** A Vehicle with the August and October Reports and one Drive Log on 2026-10-02. */
async function setup() {
  const aug = await upload(AUG, "aug.html");
  const vehicleId = aug.vehicleCreated?.id as number;
  const oct = await upload(OCT, "oct.html");
  const log = await upload(LOG, "log.csv", vehicleId);
  return {
    vehicleId,
    augId: aug.uploadId as number,
    octId: oct.uploadId as number,
    logId: log.uploadId as number,
  };
}

/** A Drive Log with its byte order mark removed: a Failed Upload that keeps the Vehicle. */
const failedLog = (vehicle?: number) =>
  upload(LOG.toString("utf8").replace("﻿", ""), "bad.csv", vehicle);

describe("GET /api/uploads (Recent feed)", () => {
  it("lists both kinds newest first with Event and Note counts", async () => {
    const { vehicleId, augId, octId, logId } = await setup();
    await send(`/uploads/${logId}/notes`, "POST", { text: "ticking" });
    await send(`/uploads/${octId}/notes`, "POST", { text: "a" });
    await send(`/uploads/${octId}/notes`, "POST", { text: "b" });
    const { items, nextBefore } = (await getJson(`/uploads?vehicle=${vehicleId}`)) as {
      items: { id: number; kind: string; noteCount: number; eventCount: number }[];
      nextBefore: number | null;
    };
    // The October Report was recorded at 21:32, after the 17:58 drive.
    expect(items.map((i) => i.id)).toEqual([octId, logId, augId]);
    expect(items.map((i) => i.kind)).toEqual(["report", "drive-log", "report"]);
    expect(items.map((i) => i.noteCount)).toEqual([2, 1, 0]);
    expect(items[1]?.eventCount).toBe(db.getDerived(logId)?.events.length);
    expect(nextBefore).toBeNull();
  });

  it("gives Report rows their badge fields and Drive Log rows their skipped-row count", async () => {
    const { vehicleId, octId } = await setup();
    const skippy = await upload(
      `${LOG.toString("utf8").trimEnd()}
not,a,row
`,
      "skippy.csv",
      vehicleId,
    );
    const { items } = (await getJson(`/uploads?vehicle=${vehicleId}`)) as {
      items: Record<string, unknown>[];
    };
    expect(items.find((i) => i.id === octId)).toMatchObject({
      mil: "on",
      storedCodes: ["P0401", "B1B58-11", "P0401-00"],
      incompleteMonitors: 0,
      totalMonitors: 22,
    });
    expect(items.find((i) => i.id === skippy.uploadId)).toMatchObject({ skippedRows: 1 });
  });

  it("pages with limit and before", async () => {
    const { vehicleId, augId, octId, logId } = await setup();
    const first = (await getJson(`/uploads?vehicle=${vehicleId}&limit=2`)) as {
      items: { id: number }[];
      nextBefore: number | null;
    };
    expect(first.items.map((i) => i.id)).toEqual([octId, logId]);
    expect(first.nextBefore).toBe(logId);
    const second = (await getJson(`/uploads?vehicle=${vehicleId}&limit=2&before=${logId}`)) as {
      items: { id: number }[];
      nextBefore: number | null;
    };
    expect(second.items.map((i) => i.id)).toEqual([augId]);
    expect(second.nextBefore).toBeNull();
  });

  it("never lists Unassigned logs or Failed Uploads", async () => {
    const { vehicleId, logId } = await setup();
    const unassigned = await upload(BIG, "big.csv");
    const failed = await failedLog(vehicleId);
    const { items } = (await getJson(`/uploads?vehicle=${vehicleId}`)) as {
      items: { id: number }[];
    };
    const ids = items.map((i) => i.id);
    expect(ids).toContain(logId);
    expect(ids).not.toContain(unassigned.uploadId);
    expect(ids).not.toContain(failed.uploadId);
  });

  it("asks for a known Vehicle and a sane limit and cursor", async () => {
    const { vehicleId } = await setup();
    expect((await send("/uploads")).status).toBe(400);
    expect((await send("/uploads?vehicle=999")).status).toBe(400);
    expect((await send(`/uploads?vehicle=${vehicleId}&limit=0`)).status).toBe(400);
    expect((await send(`/uploads?vehicle=${vehicleId}&before=999`)).status).toBe(400);
  });
});

describe("GET /api/vehicles/:id/status", () => {
  it("reads the latest Report", async () => {
    const { vehicleId, octId } = await setup();
    const body = (await getJson(`/vehicles/${vehicleId}/status`)) as {
      report: {
        id: number;
        date: string;
        mil: string;
        storedCodes: string[];
        pendingCodes: string[];
        incompleteMonitors: number;
      };
    };
    expect(body.report.id).toBe(octId);
    expect(body.report.date).toBe(db.getUpload(octId)?.recordedAt);
    expect(["on", "off", "unknown"]).toContain(body.report.mil);
    expect(body.report.storedCodes).toContain("P0401");
    expect(Number.isInteger(body.report.incompleteMonitors)).toBe(true);
  });

  it("also returns the Report before it, with permanent codes and the monitor total", async () => {
    const { vehicleId, augId, octId } = await setup();
    const body = (await getJson(`/vehicles/${vehicleId}/status`)) as {
      report: Record<string, unknown>;
      previous: Record<string, unknown>;
    };
    expect(body.report).toMatchObject({
      id: octId,
      permanentCodes: ["P0401"],
      totalMonitors: 22,
    });
    expect(body.previous).toMatchObject({
      id: augId,
      mil: "on",
      storedCodes: ["P0401", "B1B58-11", "P0401-00"],
      permanentCodes: [],
      incompleteMonitors: 0,
      totalMonitors: 22,
    });
  });

  it("skips a newer Report that has no parsed data", async () => {
    const { vehicleId, augId, octId } = await setup();
    db.addUpload({
      kind: "report",
      storedPath: "reports/2026-12/unparsed.html",
      uploadedFilename: "unparsed.html",
      sha256: "f".repeat(64),
      uploadedAt: "2026-12-01T00:00:00Z",
      recordedAt: "2026-12-01T09:00:00",
      vehicleId,
    });
    const body = (await getJson(`/vehicles/${vehicleId}/status`)) as {
      report: { id: number };
      previous: { id: number };
    };
    expect(body.report.id).toBe(octId);
    expect(body.previous.id).toBe(augId);
  });

  it("has no previous Report when there is only one", async () => {
    const { vehicleId, augId } = await setup();
    await send(`/uploads/${augId}`, "DELETE");
    const body = (await getJson(`/vehicles/${vehicleId}/status`)) as { previous: unknown };
    expect(body.previous).toBeNull();
  });

  it("says there is no diagnostic report yet once the Reports are gone", async () => {
    const { vehicleId, augId, octId } = await setup();
    await send(`/uploads/${augId}`, "DELETE");
    await send(`/uploads/${octId}`, "DELETE");
    expect(await getJson(`/vehicles/${vehicleId}/status`)).toEqual({
      report: null,
      previous: null,
    });
  });

  it("404s an unknown Vehicle", async () => {
    expect((await send("/vehicles/999/status")).status).toBe(404);
  });
});

describe("GET /api/drive-logs?unassigned=1", () => {
  it("lists Unassigned logs newest first with Note counts, and not assigned ones", async () => {
    const { logId } = await setup();
    const big = await upload(BIG, "big.csv");
    await send(`/uploads/${big.uploadId}/notes`, "POST", { text: "n" });
    const items = (await getJson("/drive-logs?unassigned=1")) as {
      id: number;
      recordedAt: string;
      durationSec: number;
      noteCount: number;
    }[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: big.uploadId, noteCount: 1 });
    expect(items[0]?.durationSec).toBeGreaterThan(0);
    expect(items.map((i) => i.id)).not.toContain(logId);
  });

  it("lists a Vehicle's Drive Logs newest first with Event and skipped-row counts", async () => {
    const { vehicleId, logId } = await setup();
    const later = await upload(
      `${BIG.toString("utf8").trimEnd()}
not,a,row
`,
      "later.csv",
      vehicleId,
    );
    await upload(LOG, "loose.csv");
    await failedLog(vehicleId);
    const items = (await getJson(`/drive-logs?vehicle=${vehicleId}`)) as {
      id: number;
      eventCount: number;
      skippedRows: number;
      noteCount: number;
      durationSec: number;
    }[];
    expect(items.map((i) => i.id)).toEqual([later.uploadId, logId]);
    expect(items[0]?.skippedRows).toBe(1);
    expect(items[1]?.skippedRows).toBe(0);
    expect(items[1]?.eventCount).toBe(db.getDerived(logId)?.events.length);
    expect(items[1]?.durationSec).toBeGreaterThan(0);
  });

  it("404s an unknown Vehicle", async () => {
    expect((await send("/drive-logs?vehicle=999")).status).toBe(400);
  });

  it("requires unassigned=1 or a vehicle", async () => {
    expect((await send("/drive-logs")).status).toBe(400);
  });
});

describe("GET /api/drive-logs/:id", () => {
  it("returns metadata, Channels, Events, outcomes, notices, warnings and the Reference Report", async () => {
    const { logId, octId } = await setup();
    const body = (await getJson(`/drive-logs/${logId}`)) as {
      id: number;
      filename: string;
      metadata: { startTime: string; duration: number };
      channels: {
        t: number[];
        channels: Record<string, { label: string; values: (number | null)[] }>;
        hidden: string[];
      };
      events: { ruleId: string; title: string; category: string }[];
      ruleOutcomes: { ruleId: string; status: string }[];
      decodeNotices: string[];
      warnings: string[];
      referenceReport: { id: number | null; state: string };
    };
    expect(body.id).toBe(logId);
    expect(body.filename).toBe("log.csv");
    expect(body.metadata.startTime).toBe(db.getUpload(logId)?.recordedAt);
    const keys = Object.keys(body.channels.channels);
    expect(keys.length).toBeGreaterThan(0);
    for (const ch of Object.values(body.channels.channels))
      expect(ch.values).toHaveLength(body.channels.t.length);
    expect(body.events).toHaveLength(db.getDerived(logId)?.events.length as number);
    expect(body.ruleOutcomes.length).toBeGreaterThan(0);
    expect(Array.isArray(body.decodeNotices)).toBe(true);
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.referenceReport).toEqual({ id: octId, state: "default" });
  });

  it("hides the 6.7 Profile's hidden Channels that occur in the log", async () => {
    const { logId } = await setup();
    const { channels } = (await getJson(`/drive-logs/${logId}`)) as {
      channels: { channels: Record<string, unknown>; hidden: string[] };
    };
    expect(channels.hidden.length).toBeGreaterThan(0);
    const profileHidden = SIX_SEVEN.hiddenColumns as readonly string[];
    for (const key of channels.hidden) {
      expect(profileHidden).toContain(key);
      expect(Object.keys(channels.channels)).toContain(key);
    }
    expect(channels.hidden).toEqual(profileHidden.filter((k) => k in channels.channels));
  });

  it("hides nothing once the Vehicle uses the Generic Profile", async () => {
    const { logId, vehicleId } = await setup();
    await send(`/vehicles/${vehicleId}`, "PATCH", { profileId: "generic" });
    const body = (await getJson(`/drive-logs/${logId}`)) as { channels: { hidden: string[] } };
    expect(body.channels.hidden).toEqual([]);
  });

  it("hides nothing in an Unassigned log", async () => {
    const big = await upload(BIG, "big.csv");
    const body = (await getJson(`/drive-logs/${big.uploadId}`)) as {
      channels: { hidden: string[] };
    };
    expect(body.channels.hidden).toEqual([]);
  });

  describe("chartPreset", () => {
    type Panels = { title: string; series: { key: string }[] }[];
    const presetOf = async (id: number) =>
      ((await getJson(`/drive-logs/${id}`)) as { chartPreset: Panels }).chartPreset;
    const keysOf = (panels: Panels) => panels.flatMap((p) => p.series.map((s) => s.key));

    it("is the 6.7 Profile's panels, cut down to the Channels the log has", async () => {
      const { logId } = await setup();
      const body = (await getJson(`/drive-logs/${logId}`)) as {
        chartPreset: Panels;
        channels: { channels: Record<string, unknown> };
      };
      expect(body.chartPreset.length).toBeGreaterThan(0);
      const wanted = SIX_SEVEN.defaultChartPreset.flatMap((p) => p.series.map((s) => s.key));
      for (const key of keysOf(body.chartPreset)) {
        expect(wanted).toContain(key);
        expect(Object.keys(body.channels.channels)).toContain(key);
      }
      expect(body.chartPreset.every((p) => p.series.length > 0)).toBe(true);
    });

    it("is Speed, RPM, Load and ECT once the Vehicle uses the Generic Profile", async () => {
      const { logId, vehicleId } = await setup();
      await send(`/vehicles/${vehicleId}`, "PATCH", { profileId: "generic" });
      expect(keysOf(await presetOf(logId))).toEqual(["speed", "rpm", "load", "ect"]);
    });

    it("uses the Generic Profile for an Unassigned log", async () => {
      const big = await upload(BIG, "big.csv");
      expect(keysOf(await presetOf(big.uploadId as number))).toEqual([
        "speed",
        "rpm",
        "load",
        "ect",
      ]);
    });
  });

  it("reports the Reference Report state: default, set, cleared", async () => {
    const { logId, augId, octId } = await setup();
    const ref = async () =>
      ((await getJson(`/drive-logs/${logId}`)) as { referenceReport: unknown }).referenceReport;
    expect(await ref()).toEqual({ id: octId, state: "default" });
    await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: augId });
    expect(await ref()).toEqual({ id: augId, state: "set" });
    await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: null });
    expect(await ref()).toEqual({ id: null, state: "cleared" });
    await send(`/drive-logs/${logId}/reference`, "DELETE");
    expect(await ref()).toEqual({ id: octId, state: "default" });
  });

  it("serves an Unassigned log with no Reference Report", async () => {
    const big = await upload(BIG, "big.csv");
    const body = (await getJson(`/drive-logs/${big.uploadId}`)) as {
      referenceReport: unknown;
    };
    expect(body.referenceReport).toEqual({ id: null, state: "default" });
  });

  it("404s a Report id and an unknown id, and 409s a Failed Upload", async () => {
    const { octId, vehicleId } = await setup();
    expect((await send(`/drive-logs/${octId}`)).status).toBe(404);
    expect((await send("/drive-logs/999")).status).toBe(404);
    const failed = await failedLog(vehicleId);
    expect((await send(`/drive-logs/${failed.uploadId}`)).status).toBe(409);
  });
});

describe("GET /api/reports", () => {
  it("lists a Vehicle's Reports newest first and returns a ParsedReport", async () => {
    const { vehicleId, augId, octId } = await setup();
    const list = (await getJson(`/reports?vehicle=${vehicleId}`)) as { id: number }[];
    expect(list.map((r) => r.id)).toEqual([octId, augId]);
    const one = (await getJson(`/reports/${octId}`)) as {
      id: number;
      filename: string;
      report: { header: { vin: string; date: string } };
    };
    expect(one.id).toBe(octId);
    expect(one.filename).toBe("oct.html");
    expect(one.report.header.date).toBe(db.getUpload(octId)?.recordedAt);
  });

  it("gives each Report row its badge fields", async () => {
    const { vehicleId, octId } = await setup();
    const list = (await getJson(`/reports?vehicle=${vehicleId}`)) as Record<string, unknown>[];
    expect(list.find((r) => r.id === octId)).toMatchObject({
      mil: "on",
      storedCodes: ["P0401", "B1B58-11", "P0401-00"],
      pendingCodes: ["P0401", "B1B58-11", "P0401-00"],
      incompleteMonitors: 0,
      totalMonitors: 22,
    });
  });

  it("404s a Drive Log id, 409s a failed Report, 400s an unknown Vehicle", async () => {
    const { logId } = await setup();
    expect((await send(`/reports/${logId}`)).status).toBe(404);
    expect((await send("/reports?vehicle=999")).status).toBe(400);
    const failed = await upload(
      OCT.toString("utf8").replace("<b>VIN:</b>", "<b>Vin</b>"),
      "x.html",
    );
    expect((await send(`/reports/${failed.uploadId}`)).status).toBe(409);
    expect(((await getJson("/reports")) as unknown[]).length).toBe(2);
  });
});

describe("GET /api/uploads/:id/original", () => {
  it("returns the Original's bytes with its uploaded filename, as a download", async () => {
    const { octId } = await setup();
    const res = await send(`/uploads/${octId}/original`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain('filename="oct.html"');
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(OCT)).toBe(true);
  });

  it("404s an unknown upload and a missing file", async () => {
    const { octId } = await setup();
    expect((await send("/uploads/999/original")).status).toBe(404);
    rmSync(originalPath(dir, db.getUpload(octId)?.storedPath as string));
    expect((await send(`/uploads/${octId}/original`)).status).toBe(404);
  });
});

describe("DELETE /api/uploads/:id", () => {
  it("removes the Original, derived data and Notes", async () => {
    const { logId } = await setup();
    const note = (await (
      await send(`/uploads/${logId}/notes`, "POST", { text: "gone" })
    ).json()) as {
      id: number;
    };
    const path = originalPath(dir, db.getUpload(logId)?.storedPath as string);
    expect(existsSync(path)).toBe(true);
    expect((await send(`/uploads/${logId}`, "DELETE")).status).toBe(200);
    expect(existsSync(path)).toBe(false);
    expect(db.getUpload(logId)).toBeUndefined();
    expect(db.getDerived(logId)).toBeUndefined();
    expect(db.getNote(note.id)).toBeUndefined();
    expect(db.listNotes(logId)).toEqual([]);
    expect((await send(`/uploads/${logId}/notes`)).status).toBe(404);
    expect((await send(`/uploads/${logId}`, "DELETE")).status).toBe(404);
  });

  it("moves the logs' default Reference Report to the next closest when a Report is deleted", async () => {
    const { logId, augId, octId } = await setup();
    const ref = async () =>
      ((await getJson(`/drive-logs/${logId}`)) as { referenceReport: unknown }).referenceReport;
    expect(await ref()).toEqual({ id: octId, state: "default" });
    await send(`/uploads/${octId}`, "DELETE");
    expect(await ref()).toEqual({ id: augId, state: "default" });
    await send(`/uploads/${augId}`, "DELETE");
    expect(await ref()).toEqual({ id: null, state: "default" });
  });

  it("drops a hand-set choice that pointed at the deleted Report, keeps a hand-cleared one", async () => {
    const { logId, augId, octId } = await setup();
    await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: augId });
    await send(`/uploads/${augId}`, "DELETE");
    expect(
      ((await getJson(`/drive-logs/${logId}`)) as { referenceReport: unknown }).referenceReport,
    ).toEqual({
      id: octId,
      state: "default",
    });
    await send(`/drive-logs/${logId}/reference`, "PUT", { reportId: null });
    await send(`/uploads/${octId}`, "DELETE");
    expect(
      ((await getJson(`/drive-logs/${logId}`)) as { referenceReport: unknown }).referenceReport,
    ).toEqual({
      id: null,
      state: "cleared",
    });
  });
});

describe("Failed Uploads", () => {
  it("lists a Failed Upload, serves its Original and deletes it", async () => {
    const { vehicleId } = await setup();
    const failed = await failedLog(vehicleId);
    const list = (await getJson("/failed-uploads")) as {
      id: number;
      kind: string;
      filename: string;
      error: string;
      uploadedAt: string;
    }[];
    expect(list).toEqual([
      {
        id: failed.uploadId,
        kind: "drive-log",
        filename: "bad.csv",
        error: failed.reason,
        uploadedAt: NOW().toISOString(),
      },
    ]);
    const dl = await send(`/uploads/${failed.uploadId}/original`);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toContain("bad.csv");
    expect((await send(`/uploads/${failed.uploadId}`, "DELETE")).status).toBe(200);
    expect(await getJson("/failed-uploads")).toEqual([]);
  });

  it("does not list healthy uploads", async () => {
    await setup();
    expect(await getJson("/failed-uploads")).toEqual([]);
  });
});

describe("routes next to the Notes sub-app", () => {
  it("keeps /uploads/:id/notes and /notes/:id working beside /uploads/:id routes", async () => {
    const { logId } = await setup();
    const created = await send(`/uploads/${logId}/notes`, "POST", { text: "hi" });
    expect(created.status).toBe(201);
    const note = (await created.json()) as { id: number };
    expect(((await getJson(`/uploads/${logId}/notes`)) as unknown[]).length).toBe(1);
    expect((await send(`/uploads/${logId}/original`)).status).toBe(200);
    expect((await send(`/notes/${note.id}`, "DELETE")).status).toBe(200);
    expect(db.getUpload(logId)).toBeDefined();
  });
});

describe("compression and types", () => {
  it("gzips the largest Drive Log payload when the client accepts it", async () => {
    const big = await upload(BIG, "big.csv");
    const res = await app.request(`/api/drive-logs/${big.uploadId}`, {
      headers: { "accept-encoding": "gzip" },
    });
    expect(res.headers.get("content-encoding")).toBe("gzip");
    const bytes = Buffer.from(await res.arrayBuffer());
    const parsed = JSON.parse(gunzipSync(bytes).toString("utf8")) as { id: number };
    expect(parsed.id).toBe(big.uploadId);
    const plain = await app.request(`/api/drive-logs/${big.uploadId}`);
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(bytes.length).toBeLessThan((await plain.arrayBuffer()).byteLength);
  });

  it("flows response types through AppType", async () => {
    const { vehicleId, logId, octId } = await setup();
    const client = hc<AppType>("http://localhost", {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => app.request(input as string, init),
    });

    const feed = await (
      await client.api.uploads.$get({ query: { vehicle: String(vehicleId) } })
    ).json();
    if ("error" in feed) throw new Error(feed.error);
    const firstId: number | undefined = feed.items[0]?.id;
    expect(firstId).toBe(octId);

    const log = await (
      await client.api["drive-logs"][":id"].$get({ param: { id: String(logId) } })
    ).json();
    if ("error" in log) throw new Error(log.error);
    const state: "default" | "set" | "cleared" = log.referenceReport.state;
    const t: number[] = log.channels.t;
    expect(state).toBe("default");
    expect(t.length).toBeGreaterThan(0);

    const status = await (
      await client.api.vehicles[":id"].status.$get({ param: { id: String(vehicleId) } })
    ).json();
    if ("error" in status) throw new Error(status.error);
    expect(status.report?.id).toBe(octId);

    const failed = await (await client.api["failed-uploads"].$get()).json();
    const kind: "report" | "drive-log" | undefined = failed[0]?.kind;
    expect(kind).toBeUndefined();
  });
});
