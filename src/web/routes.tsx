import { Route, Router, useLocation } from "preact-iso";
import { useAppState } from "./AppState.tsx";
import { DriveLogs } from "./DriveLogs.tsx";
import { FailedUploads } from "./FailedUploads.tsx";
import { NoVehicles } from "./NoVehicles.tsx";
import { Recent } from "./Recent.tsx";
import { Reports } from "./Reports.tsx";
import { isTabPath } from "./TabBar.tsx";

/** Placeholders until the viewer slices land. */
const ReportViewer = () => <p class="list-note">Report viewer</p>;
const DriveLogViewer = () => <p class="list-note">Drive Log viewer</p>;
const VehicleSettings = () => <p class="list-note">Vehicle settings</p>;

export function Routes() {
  const state = useAppState();
  const { path } = useLocation();
  const noVehicles = state.loaded.value && state.vehicles.value.length === 0;
  return (
    <main>
      {noVehicles && isTabPath(path) && <NoVehicles />}
      <Router>
        <Route path="/" component={Recent} />
        <Route path="/reports" component={Reports} />
        <Route path="/drive-logs" component={DriveLogs} />
        <Route path="/failed-uploads" component={FailedUploads} />
        <Route path="/reports/:id" component={ReportViewer} />
        <Route path="/drive-logs/:id" component={DriveLogViewer} />
        <Route path="/vehicles/:id/settings" component={VehicleSettings} />
      </Router>
    </main>
  );
}
