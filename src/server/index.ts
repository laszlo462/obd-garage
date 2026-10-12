import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { createIngest } from "./ingest.ts";
import { sweepTmp } from "./originals.ts";
import { DEFAULT_REGISTRY } from "./registry.ts";
import { readAppVersion } from "./version.ts";

const config = loadConfig();

// Startup: make the data directory, sweep stale temp files (only tmp), open and migrate the database.
mkdirSync(config.dataDir, { recursive: true });
sweepTmp(config.dataDir);
export const db = openDb(join(config.dataDir, "obd-garage.db"));

const appVersion = readAppVersion();
const api = createApp({
  db,
  dataDir: config.dataDir,
  appVersion,
  registry: DEFAULT_REGISTRY,
});

// A new app version re-derives every upload in the background. Stale data is served until each swap.
createIngest({ db, dataDir: config.dataDir, appVersion, registry: DEFAULT_REGISTRY })
  .rederiveStale()
  .then((n) => n > 0 && console.log(`Re-derived ${n} uploads for app version ${appVersion}`))
  .catch((err) => console.error("Background re-derive failed:", err));

// One process serves the API and the built web bundle (`dist/web`).
const server = new Hono()
  .route("/", api)
  .use("*", serveStatic({ root: "./dist/web" }))
  .get("*", serveStatic({ path: "./dist/web/index.html" }));

serve({ fetch: server.fetch, port: config.port }, (info) => {
  console.log(`obd-garage listening on port ${info.port}`);
});
