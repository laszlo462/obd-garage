import type { InferResponseType } from "hono/client";
import type { ParsedReport } from "../core/report.ts";
import type { Api } from "./api.tsx";
import type {
  DriveLogDetail,
  DriveLogRow,
  FeedRow,
  NoteView,
  ProfileRow,
  ReportDetail,
  ReportRow,
  RulePackRow,
  StatusData,
  VehicleRow,
} from "./api-types.ts";
import { nearestRow } from "./chart/nearest-row.ts";
import type { UploadResult } from "./upload-batch.ts";

export type UnassignedRow = InferResponseType<Api["api"]["drive-logs"]["$get"], 200>[number];
export type FailedRow = InferResponseType<Api["api"]["failed-uploads"]["$get"]>[number];
/** The stub routes that `StubData.fail` can break. `olderUploads` is the Recent feed with `before`. */
export type FailRoute =
  | "health"
  | "vehicles"
  | "status"
  | "uploads"
  | "olderUploads"
  | "reports"
  | "reportDetail"
  | "driveLogDetail"
  | "driveLogs"
  | "failedUploads"
  | "deleteUpload"
  | "deleteVehicle"
  | "patchVehicle"
  | "assign"
  | "reference"
  | "profiles"
  | "rulePacks"
  | "notes";

export type StubData = {
  vehicles?: VehicleRow[];
  unassigned?: UnassignedRow[];
  failed?: FailedRow[];
  /** `DELETE /api/uploads/:id` records the id here and drops it from `failed`, like the server. */
  deletedUploads?: number[];
  /** The Recent feed per Vehicle id, newest first. The stub pages it with `before` like the server. */
  uploads?: Record<number, FeedRow[]>;
  /** Rows per page of the Recent feed. */
  pageSize?: number;
  reports?: Record<number, ReportRow[]>;
  /** `GET /api/reports/:id` answers from this map by id; an unknown id answers 404. */
  reportDetails?: Record<number, ReportDetail>;
  /** `GET /api/reports/:id` answers 409 with this error for the id, like a Failed Upload. */
  reportConflicts?: Record<number, string>;
  /** Each `GET /api/reports/:id` pushes the id here. */
  reportDetailLoads?: number[];
  driveLogs?: Record<number, DriveLogRow[]>;
  /** `GET /api/drive-logs/:id` answers from this map by id; an unknown id answers 404. */
  driveLogDetails?: Record<number, DriveLogDetail>;
  status?: Record<number, StatusData>;
  version?: string;
  profiles?: ProfileRow[];
  rulePacks?: RulePackRow[];
  /** Each `POST /api/uploads` is pushed here as { query, body }. */
  uploadCalls?: unknown[];
  /** The upload result per filename; a file not listed is added as a Drive Log. */
  uploadResults?: Record<string, UploadResult>;
  /** An upload waits for the promise under its filename before it answers. */
  uploadGates?: Record<string, Promise<unknown>>;
  /** Answer every upload with an error status. */
  uploadError?: { status: number; error: string };
  /** Each `POST /api/drive-logs/assign` body is pushed here. */
  assignCalls?: unknown[];
  /**
   * Each `PUT` / `DELETE /api/drive-logs/:id/reference` pushes { method, id, reportId } here (`reportId` only
   * for a PUT) and, like the server, moves the log's `referenceReport` in `driveLogDetails` to the new
   * state, reading the Report's `recordedAt` from `reports`.
   */
  referenceCalls?: { method: "PUT" | "DELETE"; id: number; reportId?: number | null }[];
  /** Each `DELETE /api/vehicles/:id` pushes { param, query } here and drops the Vehicle from `vehicles`. */
  vehicleDeletes?: unknown[];
  /** Each `PATCH /api/vehicles/:id` pushes { param, json } here and updates the Vehicle in `vehicles`. */
  vehiclePatches?: unknown[];
  /** A PATCH waits for this promise before it answers. */
  vehiclePatchGate?: Promise<unknown>;
  /**
   * The Notes per upload id. `POST /api/uploads/:id/notes`, `PATCH` and `DELETE /api/notes/:id` change this
   * map like the server; a pinned Note snaps to the nearest row of the Drive Log in `driveLogDetails`.
   */
  notes?: Record<number, NoteView[]>;
  /** Every Notes call is pushed here: `uploadId` for the list routes, `id` for a Note. */
  noteCalls?: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    uploadId?: number;
    id?: number;
    text?: string;
    pinnedAt?: number | null;
  }[];
  /** Each `GET /api/vehicles` pushes a marker here. */
  vehicleLoads?: unknown[];
  /**
   * Break a route: "status" answers 500, "throw" rejects like a dead network. Mutable, so a test can
   * mend a route between a failed load and a Retry.
   */
  fail?: Partial<Record<FailRoute, "status" | "throw">>;
  /** Never answer `GET /api/vehicles`, to see the screen before the first load. */
  pending?: boolean;
};

const json = (body: unknown) => Promise.resolve(Response.json(body));

/** Wraps a route so it fails the way `data.fail` says, and answers normally otherwise. */
const route =
  <A extends unknown[]>(
    data: StubData,
    name: FailRoute,
    answer: (...args: A) => Promise<Response>,
  ) =>
  (...args: A): Promise<Response> => {
    const mode = data.fail?.[name];
    if (mode === "throw") return Promise.reject(new TypeError("Failed to fetch"));
    if (mode === "status")
      return Promise.resolve(Response.json({ error: "Stub failure." }, { status: 500 }));
    return answer(...args);
  };

/** The `recordedAt` of a Report listed in `data.reports`, or null. */
const reportRecordedAt = (data: StubData, reportId: number | null): string | null =>
  Object.values(data.reports ?? {})
    .flat()
    .find((r) => r.id === reportId)?.recordedAt ?? null;

/** A stand-in for the `hc<AppType>` client. Row types come from the real client type. */
export function stubApi(data: StubData = {}): Api {
  return {
    api: {
      health: {
        $get: route(data, "health", () => json({ status: "ok", version: data.version ?? "0.0.0" })),
      },
      vehicles: Object.assign(
        {
          $get: route(data, "vehicles", () => {
            data.vehicleLoads?.push(1);
            return data.pending ? new Promise<Response>(() => {}) : json(data.vehicles ?? []);
          }),
        },
        {
          ":id": {
            $patch: route(
              data,
              "patchVehicle",
              async (args: {
                param: { id: string };
                json: { profileId?: string; packIds?: string[] };
              }) => {
                await data.vehiclePatchGate;
                data.vehiclePatches?.push(args);
                const row = data.vehicles?.find((v) => v.id === Number(args.param.id));
                if (row) Object.assign(row, args.json);
                return json(row);
              },
            ),
            $delete: route(
              data,
              "deleteVehicle",
              (args: { param: { id: string }; query: { deleteLogs?: string } }) => {
                data.vehicleDeletes?.push(args);
                data.vehicles = data.vehicles?.filter((v) => v.id !== Number(args.param.id));
                return json({ reportsDeleted: 0, driveLogsDeleted: 0, driveLogsUnassigned: 0 });
              },
            ),
            status: {
              $get: route(data, "status", (args: { param: { id: string } }) =>
                json(data.status?.[Number(args.param.id)] ?? { report: null, previous: null }),
              ),
            },
          },
        },
      ),
      "drive-logs": {
        ":id": {
          $get: route(data, "driveLogDetail", (args: { param: { id: string } }) => {
            const detail = data.driveLogDetails?.[Number(args.param.id)];
            if (!detail)
              return Promise.resolve(
                Response.json({ error: "Unknown Drive Log." }, { status: 404 }),
              );
            return json(detail);
          }),
          reference: {
            $put: route(
              data,
              "reference",
              (args: { param: { id: string }; json: { reportId: number | null } }) => {
                const id = Number(args.param.id);
                const { reportId } = args.json;
                data.referenceCalls?.push({ method: "PUT", id, reportId });
                const detail = data.driveLogDetails?.[id];
                if (detail)
                  detail.referenceReport = {
                    ...detail.referenceReport,
                    id: reportId,
                    state: reportId === null ? "cleared" : "set",
                    recordedAt: reportRecordedAt(data, reportId),
                  };
                return json({ state: reportId === null ? "cleared" : "set", reportId });
              },
            ),
            $delete: route(data, "reference", (args: { param: { id: string } }) => {
              const id = Number(args.param.id);
              data.referenceCalls?.push({ method: "DELETE", id });
              const detail = data.driveLogDetails?.[id];
              if (detail)
                detail.referenceReport = {
                  ...detail.referenceReport,
                  id: detail.referenceReport.defaultId,
                  state: "default",
                  recordedAt: reportRecordedAt(data, detail.referenceReport.defaultId),
                };
              return json({ state: "default" });
            }),
          },
        },
        assign: {
          $post: route(data, "assign", (args: { json: unknown }) => {
            data.assignCalls?.push(args.json);
            return json({ assigned: 0 });
          }),
        },
        $get: (args?: { query?: { unassigned?: string; vehicle?: string } }) => {
          if (args?.query?.vehicle !== undefined)
            return route(data, "driveLogs", () =>
              json(data.driveLogs?.[Number(args?.query?.vehicle)] ?? []),
            )();
          return args?.query?.unassigned === "1"
            ? json(data.unassigned ?? [])
            : Promise.resolve(
                Response.json(
                  { error: "Expected ?unassigned=1 or ?vehicle=<id>." },
                  { status: 400 },
                ),
              );
        },
      },
      uploads: Object.assign(
        {
          $post: async (
            args: { query: { vehicle?: string; filename?: string } },
            opts?: { init?: { body?: unknown } },
          ) => {
            data.uploadCalls?.push({ query: args.query, body: opts?.init?.body });
            await data.uploadGates?.[args.query.filename ?? ""];
            if (data.uploadError)
              return Promise.resolve(
                Response.json(
                  { error: data.uploadError.error },
                  { status: data.uploadError.status },
                ),
              );
            const fallback: UploadResult = { outcome: "added", kind: "drive-log", warnings: [] };
            const result = data.uploadResults?.[args.query.filename ?? ""] ?? fallback;
            // Like the server, a new VIN adds a Vehicle that the next `GET /api/vehicles` lists.
            const made = result.vehicleCreated;
            if (made && data.vehicles)
              data.vehicles.push(
                vehicleRow({
                  id: made.id,
                  label: made.label,
                  vin: made.vin,
                  profileId: made.profile,
                }),
              );
            return json(result);
          },
          $get: (args: { query: { vehicle: string; before?: string } }) =>
            route(data, args.query.before === undefined ? "uploads" : "olderUploads", () => {
              const all = data.uploads?.[Number(args.query.vehicle)] ?? [];
              const before = args.query.before;
              const start =
                before === undefined ? 0 : all.findIndex((r) => r.id === Number(before)) + 1;
              const items = all.slice(start, start + (data.pageSize ?? 50));
              const more = start + items.length < all.length;
              return json({ items, nextBefore: more ? (items.at(-1)?.id ?? null) : null });
            })(),
        },
        {
          ":id": {
            $delete: route(data, "deleteUpload", (args: { param: { id: string } }) => {
              const id = Number(args.param.id);
              data.deletedUploads?.push(id);
              data.failed = data.failed?.filter((f) => f.id !== id);
              return json({ deleted: id });
            }),
            original: {
              $path: (args: { param: { id: string } }) => `/api/uploads/${args.param.id}/original`,
            },
            notes: {
              $get: route(data, "notes", (args: { param: { id: string } }) => {
                const uploadId = Number(args.param.id);
                data.noteCalls?.push({ method: "GET", uploadId });
                return json(data.notes?.[uploadId] ?? []);
              }),
              $post: route(
                data,
                "notes",
                (args: {
                  param: { id: string };
                  json: { text: string; pinnedAt?: number | null };
                }) => {
                  const uploadId = Number(args.param.id);
                  const { text, pinnedAt = null } = args.json;
                  data.noteCalls?.push({ method: "POST", uploadId, text, pinnedAt });
                  const t = data.driveLogDetails?.[uploadId]?.channels.t;
                  const all = Object.values(data.notes ?? {}).flat();
                  const note = noteRow({
                    id: Math.max(0, ...all.map((n) => n.id)) + 1,
                    uploadId,
                    text,
                    pinnedTimeSec: pinnedAt,
                    snappedTimeSec:
                      pinnedAt === null ? null : (t?.[nearestRow(t, pinnedAt)] ?? pinnedAt),
                  });
                  data.notes = {
                    ...data.notes,
                    [uploadId]: [...(data.notes?.[uploadId] ?? []), note],
                  };
                  return Promise.resolve(Response.json(note, { status: 201 }));
                },
              ),
            },
          },
        },
      ),
      reports: Object.assign(
        {
          $get: route(data, "reports", (args: { query: { vehicle?: string } }) =>
            json(data.reports?.[Number(args.query.vehicle)] ?? []),
          ),
        },
        {
          ":id": {
            $get: route(data, "reportDetail", (args: { param: { id: string } }) => {
              const id = Number(args.param.id);
              data.reportDetailLoads?.push(id);
              const conflict = data.reportConflicts?.[id];
              if (conflict !== undefined)
                return Promise.resolve(Response.json({ error: conflict }, { status: 409 }));
              const detail = data.reportDetails?.[id];
              if (!detail)
                return Promise.resolve(
                  Response.json({ error: "Unknown Report." }, { status: 404 }),
                );
              return json(detail);
            }),
          },
        },
      ),
      notes: {
        ":id": {
          $patch: route(
            data,
            "notes",
            (args: { param: { id: string }; json: { text: string } }) => {
              const id = Number(args.param.id);
              data.noteCalls?.push({ method: "PATCH", id, text: args.json.text });
              const note = Object.values(data.notes ?? {})
                .flat()
                .find((n) => n.id === id);
              if (!note)
                return Promise.resolve(Response.json({ error: "Unknown Note." }, { status: 404 }));
              note.text = args.json.text;
              return json(note);
            },
          ),
          $delete: route(data, "notes", (args: { param: { id: string } }) => {
            const id = Number(args.param.id);
            data.noteCalls?.push({ method: "DELETE", id });
            for (const [uploadId, list] of Object.entries(data.notes ?? {}))
              if (data.notes) data.notes[Number(uploadId)] = list.filter((n) => n.id !== id);
            return json({ deleted: id });
          }),
        },
      },
      profiles: { $get: route(data, "profiles", () => json(data.profiles ?? [])) },
      "rule-packs": { $get: route(data, "rulePacks", () => json(data.rulePacks ?? [])) },
      "failed-uploads": { $get: route(data, "failedUploads", () => json(data.failed ?? [])) },
    },
  } as unknown as Api;
}

export const vehicleRow = (over: Partial<VehicleRow> = {}): VehicleRow => ({
  id: 1,
  label: "2012 Ford F-250",
  vin: "TEST-VIN-00001234",
  profileId: "generic",
  packIds: [],
  reportCount: 0,
  driveLogCount: 0,
  latestReportDate: null,
  ...over,
});

const badgeFields = {
  mil: "off" as "on" | "off" | "unknown",
  storedCodes: [] as string[],
  pendingCodes: [] as string[],
  permanentCodes: [] as string[],
  incompleteMonitors: 0,
  totalMonitors: 11,
};

export const statusReport = (over: Partial<NonNullable<StatusData["report"]>> = {}) => ({
  id: 1,
  date: "2026-10-02T21:32:14" as string | null,
  ...badgeFields,
  ...over,
});

const feedBase = {
  filename: "x",
  recordedAt: "2026-10-04T17:22:05" as string | null,
  uploadedAt: "2026-10-12T10:00:00.000Z",
  eventCount: 0,
  noteCount: 0,
  warningCount: 0,
};

export const feedLog = (over: Partial<Extract<FeedRow, { kind: "drive-log" }>> = {}): FeedRow => ({
  ...feedBase,
  id: 1,
  kind: "drive-log",
  durationSec: 2460,
  skippedRows: 0,
  ...over,
});

export const feedReport = (over: Partial<Extract<FeedRow, { kind: "report" }>> = {}): FeedRow => ({
  ...feedBase,
  ...badgeFields,
  id: 2,
  kind: "report",
  durationSec: null,
  ...over,
});

export const reportRow = (over: Partial<ReportRow> = {}): ReportRow => ({
  id: 2,
  filename: "x",
  vehicleId: 1,
  recordedAt: "2026-10-02T21:32:14",
  uploadedAt: "2026-10-12T10:00:00.000Z",
  noteCount: 0,
  ...badgeFields,
  ...over,
});

export const driveLogRow = (over: Partial<DriveLogRow> = {}): DriveLogRow => ({
  id: 1,
  filename: "x",
  recordedAt: "2026-10-04T17:22:05",
  durationSec: 2460,
  noteCount: 0,
  eventCount: 0,
  skippedRows: 0,
  ...over,
});

/** A whole-upload Note of upload 1; pass `pinnedTimeSec` and `snappedTimeSec` to pin it. */
export const noteRow = (over: Partial<NoteView> = {}): NoteView => ({
  id: 1,
  uploadId: 1,
  text: "A note",
  pinnedTimeSec: null,
  snappedTimeSec: null,
  createdAt: "2026-10-04T09:00:00.000Z",
  ...over,
});

/** A small parsed Report: one stored code, one pending code, two monitors, two Mode $06 tests. */
export const parsedReport = (over: Partial<ParsedReport> = {}): ParsedReport => ({
  header: { vin: "TEST-VIN-00001234", date: "2026-10-02T21:32:14" },
  overview: {
    mil: "on",
    ready: false,
    reasons: [],
    additional: [
      { description: "Distance traveled since DTCs cleared", value: "6303.81", units: "miles" },
    ],
  },
  dtcs: [
    {
      ecu: "ECM",
      code: "P0401",
      type: "",
      description: "EGR flow insufficient",
      statuses: ["Confirmed", "Pending"],
      uds: [],
    },
  ],
  monitors: [
    {
      ecu: "ECM",
      tests: [
        { name: "Catalyst", continuous: false, status: "Complete", state: "complete" },
        { name: "Boost Pressure", continuous: false, status: "Incomplete", state: "incomplete" },
      ],
    },
  ],
  mode06: [
    {
      mid: "$01",
      midName: "Exhaust Gas Sensor Monitor",
      tid: "$90",
      tidName: "Manufacturer Defined",
      valueText: "9",
      minText: "0",
      maxText: "10",
      value: 9,
      min: 0,
      max: 10,
      units: "sec",
      result: "Pass",
    },
    {
      mid: "$02",
      midName: "NOx Monitor",
      tid: "$91",
      tidName: "Manufacturer Defined",
      valueText: "50",
      minText: "0",
      maxText: "100",
      value: 50,
      min: 0,
      max: 100,
      units: "ppm",
      result: "Pass",
    },
  ],
  ...over,
});

export const reportDetail = (over: Partial<ReportDetail> = {}): ReportDetail =>
  ({
    id: 2,
    filename: "x",
    vehicleId: 1,
    recordedAt: "2026-10-02T21:32:14",
    uploadedAt: "2026-10-12T10:00:00.000Z",
    report: parsedReport(),
    ...over,
  }) as ReportDetail;

/**
 * A small synthetic Drive Log of 11 rows (with a generic span at 20 to 30 s, a generic point at 45 s, a pack span at 60 to 80 s and a Look-alike at 90 to 100 s), 10 s apart (0 to 100 s): Speed climbs 0 to 100 mph by 10, RPM climbs
 * from 800 by 100, Load is 20 then 25.5. Two panels, Speed and RPM; Load is charted by no panel.
 */
export const driveLogDetail = (over: Partial<DriveLogDetail> = {}): DriveLogDetail => {
  const t = Array.from({ length: 11 }, (_, i) => i * 10);
  return {
    id: 1,
    filename: "x",
    vehicleId: 1,
    recordedAt: "2026-10-02T17:58:45",
    uploadedAt: "2026-10-12T10:00:00.000Z",
    metadata: { startTime: "2026-10-02T17:58:45.9486", duration: 100, rows: {} },
    channels: {
      t,
      channels: {
        speed: { label: "Vehicle speed", unit: "mph", values: t.map((_, i) => i * 10) },
        rpm: { label: "Engine speed", unit: "rpm", values: t.map((_, i) => 800 + i * 100) },
        load: { label: "Engine load", unit: "%", values: t.map((_, i) => (i === 0 ? 20 : 25.5)) },
      },
      hidden: [],
    },
    chartPreset: [
      { title: "Vehicle speed", unit: "mph", series: [{ key: "speed", label: "Speed" }] },
      { title: "Engine speed", unit: "rpm", series: [{ key: "rpm", label: "RPM" }] },
    ],
    events: [
      {
        ruleId: "core.idle",
        startSec: 20,
        endSec: 30,
        kind: "span",
        title: "Idle",
        text: "Engine at idle, 10 s",
        packId: null,
        category: "generic",
      },
      {
        ruleId: "core.engine-start",
        startSec: 45,
        endSec: 45,
        kind: "point",
        title: "Engine start",
        text: "RPM rose past 400",
        packId: null,
        category: "generic",
      },
      {
        ruleId: "p0401.entry-window",
        startSec: 60,
        endSec: 80,
        kind: "span",
        title: "P0401 entry window",
        text: "Conditions for the EGR flow test are met",
        packId: "p0401",
        category: "pack",
      },
      {
        ruleId: "core.look-alike",
        startSec: 90,
        endSec: 100,
        kind: "span",
        title: "Looks like the freeze frame (P0401, 2026-10-02 report)",
        text: "All 3 Channels shared with the freeze frame stayed within their tolerance bands for 10 s.",
        packId: null,
        category: "look-alike",
      },
    ],
    ruleOutcomes: [
      { ruleId: "core.idle", packId: null, name: "Idle", status: "ran", events: 1 },
      {
        ruleId: "core.regen",
        packId: null,
        name: "Regen",
        status: "not-applicable",
        missing: [],
        reason: "no DPF regen status in this log",
      },
    ],
    decodeNotices: [],
    warnings: [],
    referenceReport: {
      id: 2,
      defaultId: 2,
      state: "default",
      recordedAt: "2026-10-02T21:32:14",
      freezeFrame: [],
    },
    ...over,
  } as DriveLogDetail;
};
