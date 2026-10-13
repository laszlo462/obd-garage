import { LocationProvider, useLocation } from "preact-iso";
import { AppBar } from "./AppBar.tsx";
import { AppStateProvider } from "./AppState.tsx";
import { Routes } from "./routes.tsx";
import { isTabPath, TabBar } from "./TabBar.tsx";
import { safeStorage } from "./vehicle-store.ts";
import { useIsDesktop } from "./viewport.ts";

function Chrome() {
  const { path } = useLocation();
  const desktop = useIsDesktop();
  return isTabPath(path) && !desktop ? <TabBar /> : null;
}

export function App(props: { storage?: Storage }) {
  return (
    <LocationProvider>
      <AppStateProvider storage={props.storage ?? safeStorage()}>
        <AppBar />
        <Routes />
        <Chrome />
      </AppStateProvider>
    </LocationProvider>
  );
}
