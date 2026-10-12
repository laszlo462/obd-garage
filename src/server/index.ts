import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { sweepTmp } from "./originals.ts";

const config = loadConfig();

// Startup: make the data directory, sweep stale temp files (only tmp), open and migrate the database.
mkdirSync(config.dataDir, { recursive: true });
sweepTmp(config.dataDir);
export const db = openDb(join(config.dataDir, "obd-garage.db"));

const appVersion = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;
const api = createApp({ db, dataDir: config.dataDir, appVersion });

// One process serves the API and the built web bundle (`dist/web`).
const server = new Hono()
  .route("/", api)
  .use("*", serveStatic({ root: "./dist/web" }))
  .get("*", serveStatic({ path: "./dist/web/index.html" }));

serve({ fetch: server.fetch, port: config.port }, (info) => {
  console.log(`obd-garage listening on port ${info.port}`);
});
