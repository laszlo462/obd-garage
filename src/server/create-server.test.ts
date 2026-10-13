import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "./create-server.ts";

let webRoot: string;
beforeEach(() => {
  webRoot = mkdtempSync(join(tmpdir(), "obd-web-"));
  writeFileSync(join(webRoot, "index.html"), "<!doctype html><title>shell</title>");
  mkdirSync(join(webRoot, "assets"));
  writeFileSync(join(webRoot, "assets", "app.js"), "console.log(1)");
});
afterEach(() => rmSync(webRoot, { recursive: true, force: true }));

const api = new Hono().basePath("/api").get("/ping", (c) => c.json({ pong: true }));

describe("createServer", () => {
  it("serves index.html for a deep link", async () => {
    const res = await createServer(api, webRoot).request("/logs/abc");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>shell</title>");
  });

  it("serves a static asset", async () => {
    const res = await createServer(api, webRoot).request("/assets/app.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("console.log(1)");
  });

  it("answers an unknown /api path with 404, not index.html", async () => {
    const server = createServer(api, webRoot);
    const res = await server.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("<title>shell</title>");
    expect((await server.request("/api/ping")).status).toBe(200);
  });
});
