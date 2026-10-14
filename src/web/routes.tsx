import { Route, Router, useLocation } from "preact-iso";
import { useAppState } from "./AppState.tsx";
import { DriveLogs } from "./DriveLogs.tsx";
import { DriveLogViewer } from "./DriveLogViewer.tsx";
import { FailedUploads } from "./FailedUploads.tsx";
import { NoVehicles } from "./NoVehicles.tsx";
import { Recent } from "./Recent.tsx";
import { Reports } from "./Reports.tsx";
import { ReportViewer } from "./ReportViewer.tsx";
import { isTabPath } from "./TabBar.tsx";
import { VehicleSettings } from "./VehicleSettings.tsx";
import { Vehicles } from "./Vehicles.tsx";

/** The viewers get the wide container on desktop; the lists stay narrow. */
const VIEWER_PATH = /^\/(reports|drive-logs)\/\d+\/?$/;

export function Routes() {
  const state = useAppState();
  const { path } = useLocation();
  const noVehicles = state.loaded.value && state.vehicles.value.length === 0;
  return (
    <main class={VIEWER_PATH.test(path) ? "viewer" : undefined}>
      {noVehicles && isTabPath(path) && <NoVehicles />}
      <Router>
        <Route path="/" component={Recent} />
        <Route path="/reports" component={Reports} />
        <Route path="/drive-logs" component={DriveLogs} />
        <Route path="/failed-uploads" component={FailedUploads} />
        <Route path="/vehicles" component={Vehicles} />
        <Route path="/reports/:id" component={ReportViewer} />
        <Route path="/drive-logs/:id" component={DriveLogViewer} />
        <Route path="/vehicles/:id/settings" component={VehicleSettings} />
      </Router>
    </main>
  );
}
