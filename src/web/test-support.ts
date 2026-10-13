import type { InferResponseType } from "hono/client";
import type { Api } from "./api.tsx";

export type VehicleRow = InferResponseType<Api["api"]["vehicles"]["$get"]>[number];
export type UnassignedRow = InferResponseType<Api["api"]["drive-logs"]["$get"], 200>[number];
export type FailedRow = InferResponseType<Api["api"]["failed-uploads"]["$get"]>[number];

export type StubData = {
  vehicles?: VehicleRow[];
  unassigned?: UnassignedRow[];
  failed?: FailedRow[];
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
      vehicles: {
        $get: () => (data.pending ? new Promise<Response>(() => {}) : json(data.vehicles ?? [])),
      },
      // Like the real route, only the Unassigned list exists.
      "drive-logs": {
        $get: (args?: { query?: { unassigned?: string } }) =>
          args?.query?.unassigned === "1"
            ? json(data.unassigned ?? [])
            : Promise.resolve(Response.json({ error: "Expected ?unassigned=1." }, { status: 400 })),
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
