import { Hono } from "hono";
import type { Db } from "./db.ts";
import { createIngest, type IngestDeps } from "./ingest.ts";
import { GENERIC_ONLY_REGISTRY } from "./registry.ts";
import { driveLogsRoute } from "./routes/drive-logs.ts";
import { health } from "./routes/health.ts";
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
    .route("/health", health)
    .route("/uploads", uploadsRoute({ db, ingest }))
    .route("/vehicles", vehiclesRoute({ db, ingest, registry }))
    .route("/profiles", profilesRoute({ registry }))
    .route("/rule-packs", rulePacksRoute({ registry }))
    .route("/drive-logs", driveLogsRoute({ db, ingest }));
}

export type AppType = ReturnType<typeof createApp>;
