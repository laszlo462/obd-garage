import { ChevronDown, ChevronLeft, Menu } from "lucide-preact";
import { useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { useAppState } from "./AppState.tsx";
import { MenuSheet } from "./MenuSheet.tsx";
import { AddButton, isTabPath, Tabs } from "./TabBar.tsx";
import { VehicleSwitcherSheet } from "./VehicleSwitcherSheet.tsx";
import { useIsDesktop } from "./viewport.ts";

export function AppBar() {
  const state = useAppState();
  const { path } = useLocation();
  const desktop = useIsDesktop();
  const [sheet, setSheet] = useState<"switcher" | "menu" | null>(null);
  return (
    <>
      <header class="app-bar">
        {isTabPath(path) ? (
          <button type="button" class="bar-control switcher" onClick={() => setSheet("switcher")}>
            <span class="switcher-label">{state.currentVehicle.value?.label}</span>
            <ChevronDown aria-hidden="true" />
          </button>
        ) : (
          <a class="bar-control" href="/">
            <ChevronLeft aria-hidden="true" />
            Back
          </a>
        )}
        {desktop && isTabPath(path) && (
          <>
            <Tabs />
            <AddButton label="+ Add" />
          </>
        )}
        <span class="spacer" />
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
