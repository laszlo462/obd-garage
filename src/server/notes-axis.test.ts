import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { type Db, openDb } from "./db.ts";
import type { UploadResult } from "./ingest.ts";
import { DEFAULT_REGISTRY as registry } from "./registry.ts";

const LOG = readFileSync(
  new URL("../../test/fixtures/drive-logs/CSVLog_20261002_175845.csv", import.meta.url),
);
const NOW = () => new Date("2026-10-12T10:00:00Z");

let dir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-axis-"));
  db = openDb(join(dir, "t.db"));
  app = createApp({ db, dataDir: dir, registry, now: NOW, appVersion: "test" });
});
afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const send = (path: string, method: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });

async function logWithNotes(pinned: number) {
  const res = await app.request("/api/uploads?filename=log.csv", {
    method: "POST",
    body: LOG as BodyInit,
  });
  const { uploadId } = (await res.json()) as UploadResult;
  const { t } = JSON.parse(
    new TextDecoder().decode(db.getDerived(uploadId as number)?.channels as Uint8Array),
  ) as { t: number[] };
  for (let i = 0; i < pinned; i++)
    await send(`/uploads/${uploadId}/notes`, "POST", { text: `n${i}`, pinnedAt: t[i] });
  await send(`/uploads/${uploadId}/notes`, "POST", { text: "whole drive" });
  return uploadId as number;
}

describe("Notes view decodes the Channels blob at most once per request", () => {
  it("loads the derived row once for several pinned Notes", async () => {
    const id = await logWithNotes(4);
    const spy = vi.spyOn(db, "getDerived");
    const notes = (await (await send(`/uploads/${id}/notes`, "GET")).json()) as {
      snappedTimeSec: number | null;
    }[];
    expect(notes.filter((n) => n.snappedTimeSec !== null)).toHaveLength(4);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not load the derived row when no Note is pinned", async () => {
    const id = await logWithNotes(0);
    const spy = vi.spyOn(db, "getDerived");
    await send(`/uploads/${id}/notes`, "GET");
    expect(spy).not.toHaveBeenCalled();
  });
});
