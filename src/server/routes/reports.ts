import { Hono } from "hono";
import type { ParsedReport } from "../../core/report.ts";
import type { Db } from "../db.ts";
import { newestFirst } from "./uploads.ts";

const parseId = (text: string) => (/^\d+$/.test(text) ? Number(text) : Number.NaN);

/** One row of a Vehicle's Report list. */
export type ReportListItem = {
  id: number;
  filename: string;
  vehicleId: number | null;
  recordedAt: string | null;
  uploadedAt: string;
  noteCount: number;
};

/** Diagnostic Reports: the list, and one parsed Report (the client fetches both sides of a comparison). */
export function reportsRoute(deps: { db: Db }) {
  const { db } = deps;
  return new Hono()
    .get("/", (c) => {
      const vehicleText = c.req.query("vehicle");
      const vehicleId = vehicleText === undefined ? undefined : parseId(vehicleText);
      if (vehicleId !== undefined && !db.getVehicle(vehicleId))
        return c.json({ error: "Unknown vehicle." }, 400);
      const notes = db.noteCounts();
      const items = db
        .listUploads({ kind: "report", ...(vehicleId === undefined ? {} : { vehicleId }) })
        .filter((u) => !db.getDerived(u.id)?.failedError)
        .sort(newestFirst)
        .map(
          (u): ReportListItem => ({
            id: u.id,
            filename: u.uploadedFilename,
            vehicleId: u.vehicleId,
            recordedAt: u.recordedAt,
            uploadedAt: u.uploadedAt,
            noteCount: notes.get(u.id) ?? 0,
          }),
        );
      return c.json(items);
    })
    .get("/:id", (c) => {
      const upload = db.getUpload(parseId(c.req.param("id")));
      if (upload?.kind !== "report") return c.json({ error: "Unknown Report." }, 404);
      const derived = db.getDerived(upload.id);
      if (!derived || derived.failedError !== null || !derived.parsedReport)
        return c.json({ error: derived?.failedError ?? "This Report has no data." }, 409);
      return c.json({
        id: upload.id,
        filename: upload.uploadedFilename,
        vehicleId: upload.vehicleId,
        recordedAt: upload.recordedAt,
        uploadedAt: upload.uploadedAt,
        report: derived.parsedReport as ParsedReport,
      });
    });
}
