import { Hono } from "hono";
import { compress } from "hono/compress";
import type { Db } from "./db.ts";
import { createIngest, type IngestDeps } from "./ingest.ts";
import { GENERIC_ONLY_REGISTRY } from "./registry.ts";
import { driveLogsRoute } from "./routes/drive-logs.ts";
import { exportRoute } from "./routes/export.ts";
import { failedUploadsRoute } from "./routes/failed-uploads.ts";
import { health } from "./routes/health.ts";
import { notesRoute } from "./routes/notes.ts";
import { reportsRoute } from "./routes/reports.ts";
import { uploadsRoute } from "./routes/uploads.ts";
import { profilesRoute, rulePacksRoute, vehiclesRoute } from "./routes/vehicles.ts";

export type AppDeps = IngestDeps & { db: Db };

/**
 * Each area is a sub-app, chained so Hono infers the route types. The web client builds its
 * `hc<AppType>` client from this type, so it is the API contract.
 */
export function createApp(deps: AppDeps) {
  const ingest = createIngest(deps);
  const { db } = deps;
  const registry = deps.registry ?? GENERIC_ONLY_REGISTRY;
  return new Hono()
    .basePath("/api")
    .use(compress())
    .route("/health", health)
    .route("/uploads", uploadsRoute({ db, ingest }))
    .route("/vehicles", vehiclesRoute({ db, ingest, registry }))
    .route("/profiles", profilesRoute({ registry }))
    .route("/rule-packs", rulePacksRoute({ registry }))
    .route("/drive-logs", driveLogsRoute({ db, ingest }))
    .route("/reports", reportsRoute({ db }))
    .route("/failed-uploads", failedUploadsRoute({ db }))
    .route(
      "/export",
      exportRoute({
        db,
        dataDir: deps.dataDir,
        registry,
        appVersion: deps.appVersion ?? "0.0.0",
        now: deps.now ?? (() => new Date()),
      }),
    )
    .route("/", notesRoute({ db, ...(deps.now ? { now: deps.now } : {}) }));
}

export type AppType = ReturnType<typeof createApp>;
