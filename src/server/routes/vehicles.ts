import { Hono } from "hono";
import type { ParsedReport } from "../../core/report.ts";
import type { Db, Vehicle } from "../db.ts";
import type { Ingest } from "../ingest.ts";
import { removeOriginal } from "../originals.ts";
import type { ProfileRegistry } from "../registry.ts";

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

/** The Recent tab's status card. A `null` report is "No diagnostic report yet". */
export type VehicleStatus = {
  report: null | {
    id: number;
    date: string | null;
    mil: "on" | "off" | "unknown";
    storedCodes: string[];
    pendingCodes: string[];
    incompleteMonitors: number;
  };
};

const hasStatus = (statuses: string[], word: string) =>
  statuses.some((s) => s.toLowerCase().includes(word));

/** The status card, from the Vehicle's latest Report. */
function status(db: Db, vehicleId: number): VehicleStatus {
  const latest = db
    .listUploads({ kind: "report", vehicleId })
    .filter((u) => !db.getDerived(u.id)?.failedError)
    .sort((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") || b.id - a.id)[0];
  const parsed = latest && (db.getDerived(latest.id)?.parsedReport as ParsedReport | null);
  if (!latest || !parsed) return { report: null };
  const codes = (word: string) => [
    ...new Set((parsed.dtcs ?? []).filter((d) => hasStatus(d.statuses, word)).map((d) => d.code)),
  ];
  return {
    report: {
      id: latest.id,
      date: latest.recordedAt,
      mil: parsed.overview?.mil ?? "unknown",
      storedCodes: codes("confirmed"),
      pendingCodes: codes("pending"),
      incompleteMonitors: (parsed.monitors ?? []).reduce(
        (n, e) => n + e.tests.filter((t) => t.state === "incomplete").length,
        0,
      ),
    },
  };
}

/** Vehicles, their settings and delete. */
export function vehiclesRoute(deps: { db: Db; ingest: Ingest; registry: ProfileRegistry }) {
  const { db, ingest, registry } = deps;
  return new Hono()
    .get("/", (c) => c.json(db.listVehicles().map((v) => summary(db, v))))
    .get("/:id/status", (c) => {
      const vehicle = db.getVehicle(parseId(c.req.param("id")));
      if (!vehicle) return c.json({ error: "Unknown vehicle." }, 404);
      return c.json(status(db, vehicle.id));
    })
    .patch("/:id", async (c) => {
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
    })
    .delete("/:id", (c) => {
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
    });
}

/** `GET /api/profiles`, for the settings picker. */
export const profilesRoute = (deps: { registry: ProfileRegistry }) =>
  new Hono().get("/", (c) => c.json(deps.registry.profiles()));

/** `GET /api/rule-packs`, for the settings picker. */
export const rulePacksRoute = (deps: { registry: ProfileRegistry }) =>
  new Hono().get("/", (c) => c.json(deps.registry.packs()));
