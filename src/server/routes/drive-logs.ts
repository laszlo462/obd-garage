import { Hono } from "hono";
import type { Db } from "../db.ts";
import type { Ingest } from "../ingest.ts";

const parseId = (text: string) => (/^\d+$/.test(text) ? Number(text) : Number.NaN);

/** Assignment and Reference Report state of Drive Logs. Each change re-derives the log. */
export function driveLogsRoute(deps: { db: Db; ingest: Ingest }) {
  const { db, ingest } = deps;
  const driveLog = (idText: string) => {
    const u = db.getUpload(parseId(idText));
    return u?.kind === "drive-log" ? u : undefined;
  };

  return new Hono()
    .post("/assign", async (c) => {
      const body = (await c.req.json().catch(() => null)) as {
        logIds?: unknown;
        vehicleId?: unknown;
      } | null;
      const logIds = body?.logIds;
      const vehicleId = body?.vehicleId;
      if (
        !Array.isArray(logIds) ||
        !logIds.every((id) => Number.isInteger(id)) ||
        !(vehicleId === null || Number.isInteger(vehicleId))
      )
        return c.json({ error: "Expected { logIds: number[], vehicleId: number | null }." }, 400);
      if (vehicleId !== null && !db.getVehicle(vehicleId as number))
        return c.json({ error: "Unknown vehicle." }, 404);
      const logs = (logIds as number[]).map((id) => driveLog(String(id)));
      if (logs.some((l) => !l)) return c.json({ error: "Unknown Drive Log." }, 404);

      db.transaction(() => {
        for (const log of logs) {
          if (!log) continue;
          // A Reference Report set or cleared by hand belongs to the old Vehicle.
          if (log.vehicleId !== vehicleId) db.clearReferenceChoice(log.id);
          db.assignVehicle(log.id, vehicleId as number | null);
        }
        ingest.rederiveUploads(logs.flatMap((l) => l?.id ?? []));
      });
      return c.json({ assigned: logs.length });
    })
    .put("/:id/reference", async (c) => {
      const log = driveLog(c.req.param("id"));
      if (!log) return c.json({ error: "Unknown Drive Log." }, 404);
      const body = (await c.req.json().catch(() => null)) as { reportId?: unknown } | null;
      const reportId = body?.reportId;
      if (!(reportId === null || Number.isInteger(reportId)))
        return c.json({ error: "Expected { reportId: number | null }." }, 400);
      if (log.vehicleId === null)
        return c.json({ error: "An Unassigned Drive Log has no Reference Report." }, 409);
      if (reportId !== null) {
        const report = db.getUpload(reportId as number);
        if (report?.kind !== "report" || report.vehicleId !== log.vehicleId)
          return c.json({ error: "That Report does not belong to the Drive Log's Vehicle." }, 400);
      }
      db.transaction(() => {
        db.setReferenceReport(log.id, reportId as number | null);
        ingest.rederiveUpload(log.id);
      });
      return c.json({ state: reportId === null ? "cleared" : "set", reportId });
    })
    .delete("/:id/reference", (c) => {
      const log = driveLog(c.req.param("id"));
      if (!log) return c.json({ error: "Unknown Drive Log." }, 404);
      db.transaction(() => {
        db.clearReferenceChoice(log.id);
        ingest.rederiveUpload(log.id);
      });
      return c.json({ state: "default" });
    });
}
