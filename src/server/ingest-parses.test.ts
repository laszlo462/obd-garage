import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { type Db, openDb } from "./db.ts";
import { createIngest, type UploadResult } from "./ingest.ts";
import { DEFAULT_REGISTRY as registry } from "./registry.ts";

// Pass-through spies: behaviour is unchanged, only the call counts are observed.
vi.mock("../core/report.ts", async (importActual) => {
  const actual = await importActual<typeof import("../core/report.ts")>();
  return { ...actual, parseReport: vi.fn(actual.parseReport) };
});
vi.mock("../core/derive.ts", async (importActual) => {
  const actual = await importActual<typeof import("../core/derive.ts")>();
  return { ...actual, derive: vi.fn(actual.derive) };
});
const { parseReport } = await import("../core/report.ts");
const { derive } = await import("../core/derive.ts");

const fixture = (folder: string, name: string) =>
  readFileSync(new URL(`../../test/fixtures/${folder}/${name}`, import.meta.url));
const OCT = fixture("reports", "Diagnostic_Report_2026-10-02_213218.html");
const LOG = fixture("drive-logs", "CSVLog_20261002_175845.csv");
const NOW = () => new Date("2026-10-12T10:00:00Z");

let dir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-parses-"));
  db = openDb(join(dir, "t.db"));
  app = createApp({ db, dataDir: dir, registry, now: NOW, appVersion: "test" });
  vi.mocked(parseReport).mockClear();
  vi.mocked(derive).mockClear();
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function upload(body: Uint8Array | string, vehicle?: number) {
  const params = new URLSearchParams({ filename: "file" });
  if (vehicle !== undefined) params.set("vehicle", String(vehicle));
  const res = await app.request(`/api/uploads?${params}`, {
    method: "POST",
    body: body as BodyInit,
  });
  return (await res.json()) as UploadResult;
}

describe("ingest does no redundant parsing", () => {
  it("builds no HTML DOM for a Drive Log and runs the rule engine once", async () => {
    const res = await upload(LOG);
    expect(res.kind).toBe("drive-log");
    expect(parseReport).toHaveBeenCalledTimes(0);
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("parses a Report once and never runs the rule engine for it", async () => {
    const res = await upload(OCT);
    expect(res.kind).toBe("report");
    expect(parseReport).toHaveBeenCalledTimes(1);
    expect(derive).toHaveBeenCalledTimes(0);
  });

  it("runs the rule engine once when a Drive Log is re-derived from disk", async () => {
    const { uploadId } = await upload(LOG);
    vi.mocked(derive).mockClear();
    createIngest({ db, dataDir: dir, registry, now: NOW, appVersion: "test" }).rederiveUpload(
      uploadId as number,
    );
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("parses a Report once when it is re-derived from disk", async () => {
    const { uploadId } = await upload(OCT);
    vi.mocked(parseReport).mockClear();
    createIngest({ db, dataDir: dir, registry, now: NOW, appVersion: "test" }).rederiveUpload(
      uploadId as number,
    );
    expect(parseReport).toHaveBeenCalledTimes(1);
  });
});
