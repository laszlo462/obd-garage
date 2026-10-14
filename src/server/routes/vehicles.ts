import { Hono } from "hono";
import { validator } from "hono/validator";
import type { ParsedReport } from "../../core/report.ts";
import type { Db, Upload, Vehicle } from "../db.ts";
import type { Ingest } from "../ingest.ts";
import { removeOriginal } from "../originals.ts";
import type { ProfileRegistry } from "../registry.ts";
import { type ReportBadges, reportBadges } from "../report-badges.ts";

const parseId = (text: string) => (/^\d+$/.test(text) ? Number(text) : Number.NaN);
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** The Vehicles screen row: owner data plus counts worked out from the uploads. */
function summary(db: Db, v: Vehicle) {
  const uploads = db.listUploads({ vehicleId: v.id });
  const reports = uploads.filter((u) => u.kind === "report");
  const dates = reports.flatMap((r) => r.recordedAt ?? []).sort();
  return {
    id: v.id,
    label: v.label,
    vin: v.vin,
    profileId: v.profileId,
    packIds: v.packIds,
    reportCount: reports.length,
    driveLogCount: uploads.length - reports.length,
    latestReportDate: dates.at(-1) ?? null,
  };
}

/** One Report as the status strip shows it. */
export type StatusReport = ReportBadges & { id: number; date: string | null };

/** The Recent tab's status card. A `null` report is "No diagnostic report yet". */
export type VehicleStatus = {
  report: StatusReport | null;
  /** The Report before the latest one, for the change line; `null` if there is none. */
  previous: StatusReport | null;
};

/** The status card, from the Vehicle's latest two Reports. */
function status(db: Db, vehicleId: number): VehicleStatus {
  const shape = (u: Upload): StatusReport | null => {
    const parsed = db.getParsedReport(u.id) as ParsedReport | null;
    return parsed ? { id: u.id, date: u.recordedAt, ...reportBadges(parsed) } : null;
  };
  // Shape before taking two, so a Report with no parsed data never leaves `report` empty.
  const shaped: StatusReport[] = [];
  for (const u of db
    .listUploads({ kind: "report", vehicleId })
    .filter((u) => !db.getDerivedSummary(u.id)?.failedError)
    .sort((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") || b.id - a.id)) {
    const s = shape(u);
    if (s) shaped.push(s);
    if (shaped.length === 2) break;
  }
  return { report: shaped[0] ?? null, previous: shaped[1] ?? null };
}

/** Vehicles, their settings and delete. */
export function vehiclesRoute(deps: { db: Db; ingest: Ingest; registry: ProfileRegistry }) {
  const { db, ingest, registry } = deps;
  return (
    new Hono()
      .get("/", (c) => c.json(db.listVehicles().map((v) => summary(db, v))))
      .get("/:id/status", (c) => {
        const vehicle = db.getVehicle(parseId(c.req.param("id")));
        if (!vehicle) return c.json({ error: "Unknown vehicle." }, 404);
        return c.json(status(db, vehicle.id));
      })
      // Type-only: the typed client sees the body; the handler still validates it.
      .patch(
        "/:id",
        validator("json", (b) => b as { profileId?: string; packIds?: string[] }),
        async (c) => {
          const vehicle = db.getVehicle(parseId(c.req.param("id")));
          if (!vehicle) return c.json({ error: "Unknown vehicle." }, 404);
          const body: unknown = await c.req.json().catch(() => null);
          if (typeof body !== "object" || body === null)
            return c.json({ error: "Expected a JSON object." }, 400);
          const { profileId, packIds } = body as { profileId?: unknown; packIds?: unknown };
          if (
            profileId !== undefined &&
            (typeof profileId !== "string" || !registry.profile(profileId))
          )
            return c.json({ error: "Unknown Profile." }, 400);
          if (
            packIds !== undefined &&
            (!isStringArray(packIds) || packIds.some((id) => !registry.pack(id)))
          )
            return c.json({ error: "Unknown Rule Pack." }, 400);
          // Only what was sent changes: a Profile change never rewrites the pack toggles.
          db.transaction(() => {
            db.updateVehicle(vehicle.id, {
              ...(profileId !== undefined ? { profileId: profileId as string } : {}),
              ...(packIds !== undefined ? { packIds: [...new Set(packIds as string[])] } : {}),
            });
            ingest.rederiveVehicleLogs(vehicle.id);
          });
          return c.json(summary(db, db.getVehicle(vehicle.id) as Vehicle));
        },
      )
      // Type-only: the typed client sees `deleteLogs`; the handler still reads the query itself.
      .delete(
        "/:id",
        validator("query", (q) => q as { deleteLogs?: string }),
        (c) => {
          const vehicle = db.getVehicle(parseId(c.req.param("id")));
          if (!vehicle) return c.json({ error: "Unknown vehicle." }, 404);
          const deleteLogs = ["1", "true"].includes(c.req.query("deleteLogs") ?? "");
          const uploads = db.listUploads({ vehicleId: vehicle.id });
          const reports = uploads.filter((u) => u.kind === "report");
          const logs = uploads.filter((u) => u.kind === "drive-log");
          const gone = deleteLogs ? uploads : reports;
          db.transaction(() => {
            // Unassigned logs keep no Reference Report choice, whatever the owner had set.
            if (!deleteLogs)
              for (const log of logs) {
                db.assignVehicle(log.id, null);
                db.clearReferenceChoice(log.id);
              }
            for (const u of gone) db.deleteUpload(u.id);
            db.deleteVehicle(vehicle.id);
            if (!deleteLogs) ingest.rederiveUploads(logs.map((l) => l.id));
          });
          for (const u of gone) removeOriginal(ingest.dataDir, u.storedPath);
          return c.json({
            reportsDeleted: reports.length,
            driveLogsDeleted: deleteLogs ? logs.length : 0,
            driveLogsUnassigned: deleteLogs ? 0 : logs.length,
          });
        },
      )
  );
}

/** `GET /api/profiles`, for the settings picker. */
export const profilesRoute = (deps: { registry: ProfileRegistry }) =>
  new Hono().get("/", (c) => c.json(deps.registry.profiles()));

/** `GET /api/rule-packs`, for the settings picker. */
export const rulePacksRoute = (deps: { registry: ProfileRegistry }) =>
  new Hono().get("/", (c) => c.json(deps.registry.packs()));
