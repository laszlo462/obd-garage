import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Db, Upload } from "../db.ts";
import { type Ingest, MAX_UPLOAD_BYTES, tooLargeResult } from "../ingest.ts";
import { originalPath, removeOriginal } from "../originals.ts";
import { type ReportBadges, storedReportBadges } from "../report-badges.ts";

const parseId = (text: string) => (/^\d+$/.test(text) ? Number(text) : Number.NaN);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** One row of the Vehicle's Recent feed. */
type FeedBase = {
  id: number;
  filename: string;
  recordedAt: string | null;
  uploadedAt: string;
  eventCount: number;
  noteCount: number;
  warningCount: number;
  /** Drive Logs only. */
  durationSec: number | null;
};

/** A Report row carries its badge fields; a Drive Log row carries its skipped-row count. */
export type FeedItem =
  | (FeedBase & { kind: "report" } & ReportBadges)
  | (FeedBase & { kind: "drive-log"; skippedRows: number });

/** Newest recording first; the id breaks a tie so the order is total. */
export const newestFirst = (a: Upload, b: Upload) =>
  (b.recordedAt ?? b.uploadedAt).localeCompare(a.recordedAt ?? a.uploadedAt) || b.id - a.id;

/** Uploads: ingest, the Vehicle feed, the Original and delete. */
export function uploadsRoute(deps: { db: Db; ingest: Ingest }) {
  const { db, ingest } = deps;
  // Refuses on the declared size without reading the body, or stops reading a streamed body at the limit.
  // The refusal is a normal 200 upload result, like every other outcome.
  const limit = bodyLimit({ maxSize: MAX_UPLOAD_BYTES, onError: (c) => c.json(tooLargeResult()) });
  return new Hono()
    .post("/", limit, async (c) => {
      const vehicleParam = c.req.query("vehicle") ?? "unassigned";
      let vehicleId: number | null = null;
      if (vehicleParam !== "unassigned") {
        vehicleId = parseId(vehicleParam);
        if (!db.getVehicle(vehicleId)) return c.json({ error: "Unknown vehicle." }, 400);
      }
      const filename = c.req.query("filename") || "upload";
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      return c.json(ingest.ingest({ bytes, filename, vehicleId }));
    })
    .get("/", (c) => {
      const vehicleId = parseId(c.req.query("vehicle") ?? "");
      if (!db.getVehicle(vehicleId)) return c.json({ error: "Expected ?vehicle=<id>." }, 400);
      const limitText = c.req.query("limit");
      const count = limitText === undefined ? DEFAULT_LIMIT : parseId(limitText);
      if (!(count >= 1)) return c.json({ error: "limit must be a positive integer." }, 400);

      // Failed Uploads have their own screen; Unassigned logs have no Vehicle, so neither is here.
      const failed = (u: Upload) => Boolean(db.getDerivedSummary(u.id)?.failedError);
      const sorted = db
        .listUploads({ vehicleId })
        .filter((u) => !failed(u))
        .sort(newestFirst);
      let start = 0;
      const beforeText = c.req.query("before");
      if (beforeText !== undefined) {
        const at = sorted.findIndex((u) => u.id === parseId(beforeText));
        if (at < 0) return c.json({ error: "Unknown before cursor." }, 400);
        start = at + 1;
      }
      const page = sorted.slice(start, start + Math.min(count, MAX_LIMIT));
      const notes = db.noteCounts();
      const events = db.eventCounts();
      const items = page.map((u): FeedItem => {
        const d = db.getDerivedSummary(u.id);
        const meta = d?.metadata as { duration?: number; rows?: { skipped?: number } } | null;
        const duration = meta?.duration;
        const base: FeedBase = {
          id: u.id,
          filename: u.uploadedFilename,
          recordedAt: u.recordedAt,
          uploadedAt: u.uploadedAt,
          eventCount: events.get(u.id) ?? 0,
          noteCount: notes.get(u.id) ?? 0,
          warningCount: d?.warningCount ?? 0,
          durationSec: u.kind === "drive-log" ? (duration ?? null) : null,
        };
        return u.kind === "report"
          ? { ...base, kind: "report", ...storedReportBadges(db, u.id) }
          : { ...base, kind: "drive-log", skippedRows: meta?.rows?.skipped ?? 0 };
      });
      const last = page.at(-1);
      const more = last !== undefined && start + page.length < sorted.length;
      return c.json({ items, nextBefore: more ? last.id : null });
    })
    .get("/:id/original", (c) => {
      const upload = db.getUpload(parseId(c.req.param("id")));
      if (!upload) return c.json({ error: "Unknown upload." }, 404);
      let bytes: Buffer;
      try {
        bytes = readFileSync(originalPath(ingest.dataDir, upload.storedPath));
      } catch {
        return c.json({ error: "The Original is missing from disk." }, 404);
      }
      // A download, never rendered: report text is untrusted.
      const name = upload.uploadedFilename;
      const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
      return c.body(new Uint8Array(bytes), 200, {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "x-content-type-options": "nosniff",
      });
    })
    .delete("/:id", (c) => {
      const upload = db.getUpload(parseId(c.req.param("id")));
      if (!upload) return c.json({ error: "Unknown upload." }, 404);
      db.transaction(() => {
        // Cascades to Notes, hand-set Reference Reports pointing here, and derived data.
        db.deleteUpload(upload.id);
        if (upload.kind === "report" && upload.vehicleId !== null)
          ingest.rederiveChangedDefaults(upload.vehicleId);
      });
      removeOriginal(ingest.dataDir, upload.storedPath);
      return c.json({ deleted: upload.id });
    });
}
