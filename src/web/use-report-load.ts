import { useEffect, useRef, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import type { ReportDetail, ReportRow } from "./api-types.ts";
import { type DetailLoad, useDetailLoad } from "./use-detail-load.ts";
import { okJson } from "./use-vehicle-load.ts";

/**
 * The Reports of one Vehicle, newest first, for the compare bar. Null until loaded; a failure goes to the
 * shell banner like any other load and leaves the list empty.
 */
export function useVehicleReports(vehicleId: number | null): ReportRow[] | null {
  const api = useApi();
  const state = useAppState();
  const revision = state.revision.value;
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const owner = useRef({});
  useEffect(() => () => state.reportLoad(owner.current, false), [state]);
  useEffect(() => {
    if (vehicleId === null) return setRows([]);
    let stale = false;
    api.api.reports
      .$get({ query: { vehicle: String(vehicleId) } })
      .then(okJson)
      .then(
        (loaded) => {
          if (stale) return;
          state.reportLoad(owner.current, false);
          setRows(loaded);
        },
        () => {
          if (stale) return;
          state.reportLoad(owner.current, true);
          setRows((prev) => prev ?? []);
        },
      );
    return () => {
      stale = true;
    };
  }, [vehicleId, revision]);
  return rows;
}

/** Load one Report by id; see `useDetailLoad`. */
export function useReportLoad(id: number, enabled = true): DetailLoad<ReportDetail> {
  const api = useApi();
  return useDetailLoad<ReportDetail>(
    id,
    enabled,
    (reportId) => api.api.reports[":id"].$get({ param: { id: String(reportId) } }),
    "This Report has no data.",
  );
}
