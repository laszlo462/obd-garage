import { Hono } from "hono";
import { health } from "./routes/health.ts";

/**
 * Each area is a sub-app, chained so Hono infers the route types. The web client builds its
 * `hc<AppType>` client from this type, so it is the API contract.
 */
export const app = new Hono().basePath("/api").route("/health", health);

export type AppType = typeof app;
