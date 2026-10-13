import type { ComponentChildren } from "preact";
import { createContext } from "preact";
import { useContext, useEffect, useMemo } from "preact/hooks";
import { useApi } from "./api.tsx";
import { type AppState, createAppState } from "./app-state.ts";

const StateContext = createContext<AppState | null>(null);

export function AppStateProvider(props: { storage: Storage; children: ComponentChildren }) {
  const api = useApi();
  const state = useMemo(() => createAppState(api, props.storage), [api, props.storage]);
  useEffect(() => {
    state.refresh();
  }, [state]);
  return <StateContext.Provider value={state}>{props.children}</StateContext.Provider>;
}

export function useAppState(): AppState {
  const state = useContext(StateContext);
  if (!state) throw new Error("useAppState needs an AppStateProvider");
  return state;
}
