import type { InferResponseType } from "hono/client";
import type { Api } from "./api.tsx";
import type { DriveLogRow, FeedRow, ReportRow, StatusData } from "./api-types.ts";

export type VehicleRow = InferResponseType<Api["api"]["vehicles"]["$get"]>[number];
export type UnassignedRow = InferResponseType<Api["api"]["drive-logs"]["$get"], 200>[number];
export type FailedRow = InferResponseType<Api["api"]["failed-uploads"]["$get"]>[number];
export type StubData = {
  vehicles?: VehicleRow[];
  unassigned?: UnassignedRow[];
  failed?: FailedRow[];
  /** The Recent feed per Vehicle id, newest first. The stub pages it with `before` like the server. */
  uploads?: Record<number, FeedRow[]>;
  /** Rows per page of the Recent feed. */
  pageSize?: number;
  reports?: Record<number, ReportRow[]>;
  driveLogs?: Record<number, DriveLogRow[]>;
  status?: Record<number, StatusData>;
  version?: string;
  /** Never answer `GET /api/vehicles`, to see the screen before the first load. */
  pending?: boolean;
};

const json = (body: unknown) => Promise.resolve(Response.json(body));

/** A stand-in for the `hc<AppType>` client. Row types come from the real client type. */
export function stubApi(data: StubData = {}): Api {
  return {
    api: {
      health: { $get: () => json({ status: "ok", version: data.version ?? "0.0.0" }) },
      vehicles: Object.assign(
        {
          $get: () => (data.pending ? new Promise<Response>(() => {}) : json(data.vehicles ?? [])),
        },
        {
          ":id": {
            status: {
              $get: (args: { param: { id: string } }) =>
                json(data.status?.[Number(args.param.id)] ?? { report: null, previous: null }),
            },
          },
        },
      ),
      "drive-logs": {
        $get: (args?: { query?: { unassigned?: string; vehicle?: string } }) => {
          if (args?.query?.vehicle !== undefined)
            return json(data.driveLogs?.[Number(args.query.vehicle)] ?? []);
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
      uploads: {
        $get: (args: { query: { vehicle: string; before?: string } }) => {
          const all = data.uploads?.[Number(args.query.vehicle)] ?? [];
          const before = args.query.before;
          const start =
            before === undefined ? 0 : all.findIndex((r) => r.id === Number(before)) + 1;
          const items = all.slice(start, start + (data.pageSize ?? 50));
          const more = start + items.length < all.length;
          return json({ items, nextBefore: more ? (items.at(-1)?.id ?? null) : null });
        },
      },
      reports: {
        $get: (args: { query: { vehicle?: string } }) =>
          json(data.reports?.[Number(args.query.vehicle)] ?? []),
      },
      "failed-uploads": { $get: () => json(data.failed ?? []) },
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
