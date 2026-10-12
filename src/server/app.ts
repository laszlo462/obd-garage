import { Hono } from "hono";
import type { Db } from "./db.ts";
import { createIngest, type IngestDeps } from "./ingest.ts";
import { health } from "./routes/health.ts";
import { uploadsRoute } from "./routes/uploads.ts";

export type AppDeps = IngestDeps & { db: Db };

/**
 * Each area is a sub-app, chained so Hono infers the route types. The web client builds its
 * `hc<AppType>` client from this type, so it is the API contract.
 */
export function createApp(deps: AppDeps) {
  const ingest = createIngest(deps);
  return new Hono()
    .basePath("/api")
    .route("/health", health)
    .route("/uploads", uploadsRoute({ db: deps.db, ingest }));
}

export type AppType = ReturnType<typeof createApp>;
