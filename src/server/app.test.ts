import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDb } from "./db.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obd-app-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("GET /api/health", () => {
  it("answers ok without a network", async () => {
    const db = openDb(join(dir, "t.db"));
    try {
      const res = await createApp({ db, dataDir: dir }).request("/api/health");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });
    } finally {
      db.close();
    }
  });
});
