import { Route, Router, useLocation } from "preact-iso";
import { useAppState } from "./AppState.tsx";
import { NoVehicles } from "./NoVehicles.tsx";
import { isTabPath } from "./TabBar.tsx";

const Recent = () => <p>Recent uploads</p>;
const Reports = () => <p>Reports list</p>;
const DriveLogs = () => <p>Drive Logs list</p>;

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
      </Router>
    </main>
  );
}
