import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "../db.ts";
import { type Ingest, MAX_UPLOAD_BYTES, tooLargeResult } from "../ingest.ts";

/** `POST /api/uploads?filename=…&vehicle=<id>|unassigned`: raw body, one file per request. */
export function uploadsRoute(deps: { db: Db; ingest: Ingest }) {
  // Refuses on the declared size without reading the body, or stops reading a streamed body at the limit.
  // The refusal is a normal 200 upload result, like every other outcome.
  const limit = bodyLimit({ maxSize: MAX_UPLOAD_BYTES, onError: (c) => c.json(tooLargeResult()) });
  return new Hono().post("/", limit, async (c) => {
    const vehicleParam = c.req.query("vehicle") ?? "unassigned";
    let vehicleId: number | null = null;
    if (vehicleParam !== "unassigned") {
      vehicleId = /^\d+$/.test(vehicleParam) ? Number(vehicleParam) : Number.NaN;
      if (!deps.db.getVehicle(vehicleId)) return c.json({ error: "Unknown vehicle." }, 400);
    }
    const filename = c.req.query("filename") || "upload";
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    return c.json(deps.ingest.ingest({ bytes, filename, vehicleId }));
  });
}
