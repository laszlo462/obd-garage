import { Hono } from "hono";
import { resolveChartPreset } from "../chart-preset.ts";
import type { Db } from "../db.ts";
import type { Ingest } from "../ingest.ts";
import { GENERIC_PROFILE_ID, type ProfileRegistry } from "../registry.ts";
import { newestFirst } from "./uploads.ts";

const parseId = (text: string) => (/^\d+$/.test(text) ? Number(text) : Number.NaN);

/** One row of the Unassigned list, and of a Vehicle's Drive Logs list. */
export type DriveLogListItem = {
  id: number;
  filename: string;
  recordedAt: string | null;
  durationSec: number | null;
  noteCount: number;
  eventCount: number;
  /** Rows the parser tolerated and dropped. */
  skippedRows: number;
};

/** One Event as the viewer draws it. */
export type EventView = {
  ruleId: string;
  startSec: number | null;
  endSec: number | null;
  kind: string;
  title: string;
  text: string;
  packId: string | null;
  category: string;
};

type ChannelView = { label: string; unit?: string; values: (number | null)[] };

/** The Channels payload: column-oriented; a value is `null` where the Original had no number. */
export type ChannelsPayload = {
  t: number[];
  channels: Record<string, ChannelView>;
  /** Channels the Vehicle Profile hides by default; only keys present in `channels`. Empty when Unassigned. */
  hidden: string[];
};

export type ReferenceState = "default" | "set" | "cleared";

/** Reading, assignment and Reference Report state of Drive Logs. Each change re-derives the log. */
export function driveLogsRoute(deps: { db: Db; ingest: Ingest; registry: ProfileRegistry }) {
  const { db, ingest, registry } = deps;
  const driveLog = (idText: string) => {
    const u = db.getUpload(parseId(idText));
    return u?.kind === "drive-log" ? u : undefined;
  };

  return new Hono()
    .get("/", (c) => {
      const vehicleText = c.req.query("vehicle");
      let vehicleId: number | null = null;
      if (vehicleText !== undefined) {
        vehicleId = parseId(vehicleText);
        if (!db.getVehicle(vehicleId)) return c.json({ error: "Unknown vehicle." }, 400);
      } else if (c.req.query("unassigned") !== "1")
        return c.json({ error: "Expected ?unassigned=1 or ?vehicle=<id>." }, 400);
      const notes = db.noteCounts();
      const events = db.eventCounts();
      const items = db
        .listUploads({ kind: "drive-log", vehicleId })
        .filter((u) => !db.getDerivedSummary(u.id)?.failedError)
        .sort(newestFirst)
        .map((u): DriveLogListItem => {
          const meta = db.getDerivedSummary(u.id)?.metadata as {
            duration?: number;
            rows?: { skipped?: number };
          } | null;
          return {
            id: u.id,
            filename: u.uploadedFilename,
            recordedAt: u.recordedAt,
            durationSec: meta?.duration ?? null,
            noteCount: notes.get(u.id) ?? 0,
            eventCount: events.get(u.id) ?? 0,
            skippedRows: meta?.rows?.skipped ?? 0,
          };
        });
      return c.json(items);
    })
    .get("/:id", (c) => {
      const log = driveLog(c.req.param("id"));
      const derived = log && db.getDerived(log.id);
      if (!log || !derived) return c.json({ error: "Unknown Drive Log." }, 404);
      if (derived.failedError !== null || !derived.channels)
        return c.json({ error: derived.failedError ?? "This Drive Log has no data." }, 409);
      const blob = JSON.parse(new TextDecoder().decode(derived.channels)) as {
        t: number[];
        channels: Record<string, ChannelView>;
      };
      const channels: ChannelsPayload["channels"] = {};
      for (const [key, ch] of Object.entries(blob.channels))
        channels[key] = {
          label: ch.label,
          ...(ch.unit === undefined ? {} : { unit: ch.unit }),
          values: ch.values,
        };
      const chosen = db.getReferenceReport(log.id);
      const meta = derived.metadata as {
        startTime: string;
        duration: number;
        rows: unknown;
        referenceReportId: number | null;
      };
      // A chosen Report that is a Failed Upload is kept but not used: derive fell back to the default.
      const state: ReferenceState = !chosen
        ? "default"
        : chosen.reportId === null
          ? "cleared"
          : chosen.reportId === meta.referenceReportId
            ? "set"
            : "default";
      const vehicle = log.vehicleId === null ? undefined : db.getVehicle(log.vehicleId);
      const profile = vehicle && registry.profile(vehicle.profileId);
      const hidden = (profile?.hiddenColumns ?? []).filter((key) => key in channels);
      // An Unassigned log charts the Generic Profile's preset.
      const preset = (profile ?? registry.profile(GENERIC_PROFILE_ID))?.defaultChartPreset ?? [];
      const payload: ChannelsPayload = { t: blob.t, channels, hidden };
      return c.json({
        id: log.id,
        filename: log.uploadedFilename,
        vehicleId: log.vehicleId,
        recordedAt: log.recordedAt,
        uploadedAt: log.uploadedAt,
        metadata: { startTime: meta.startTime, duration: meta.duration, rows: meta.rows },
        channels: payload,
        chartPreset: resolveChartPreset(preset, channels, hidden),
        events: derived.events.map((e): EventView => {
          const d = e.data as Omit<EventView, "ruleId" | "startSec" | "endSec">;
          return { ruleId: e.ruleId, startSec: e.startSec, endSec: e.endSec, ...d };
        }),
        ruleOutcomes: derived.ruleOutcomes as unknown[],
        decodeNotices: derived.decodeNotices as string[],
        warnings: derived.warnings as string[],
        referenceReport: { id: meta.referenceReportId, state },
      });
    })
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
        if (db.getDerivedSummary(report.id)?.failedError !== null)
          return c.json(
            { error: "That Report is a Failed Upload, so it cannot be the Reference Report." },
            400,
          );
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
