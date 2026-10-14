import { ChevronDown, ChevronLeft, Menu } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { useAppState } from "./AppState.tsx";
import { MenuSheet } from "./MenuSheet.tsx";
import { screenName } from "./screen-name.ts";
import { AddButton, isTabPath, Tabs } from "./TabBar.tsx";
import { VehicleSwitcherSheet } from "./VehicleSwitcherSheet.tsx";
import { useIsDesktop } from "./viewport.ts";

export function AppBar() {
  const state = useAppState();
  const { path } = useLocation();
  const desktop = useIsDesktop();
  const [sheet, setSheet] = useState<"switcher" | "menu" | null>(null);
  const last = useRef(path);
  useEffect(() => {
    if (path === last.current) return;
    state.previousPath.value = last.current;
    last.current = path;
  }, [path]);
  const back = state.previousPath.value ?? "/";
  return (
    <>
      <header class="app-bar">
        {isTabPath(path) ? (
          <button type="button" class="bar-control switcher" onClick={() => setSheet("switcher")}>
            <span class="switcher-label">{state.currentVehicle.value?.label}</span>
            <ChevronDown aria-hidden="true" />
          </button>
        ) : (
          <a
            class="bar-control"
            href={back}
            onClick={(e) => {
              if (state.previousPath.value === null) return;
              e.preventDefault();
              history.back();
            }}
          >
            <ChevronLeft aria-hidden="true" />
            {screenName(back)}
          </a>
        )}
        {desktop && isTabPath(path) && (
          <>
            <Tabs />
            <AddButton label="+ Add" />
          </>
        )}
        {isTabPath(path) ? <span class="spacer" /> : <h1 class="bar-title">{screenName(path)}</h1>}
        <button
          type="button"
          class="bar-control menu-button"
          aria-label={state.needsAttention.value ? "Menu, needs attention" : "Menu"}
          onClick={() => setSheet("menu")}
        >
          <Menu aria-hidden="true" />
          {state.needsAttention.value && <span class="dot" />}
        </button>
      </header>
      {sheet === "menu" && <MenuSheet onClose={() => setSheet(null)} />}
      {sheet === "switcher" && <VehicleSwitcherSheet onClose={() => setSheet(null)} />}
    </>
  );
}
