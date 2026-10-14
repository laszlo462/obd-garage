import type { VehicleProfile } from "./types.ts";

export const GENERIC_PROFILE_ID = "generic";

/** Matches nothing, adds nothing, suggests no packs. The registry falls back to it. */
export const GENERIC: VehicleProfile = {
  id: GENERIC_PROFILE_ID,
  name: "Generic",
  matchesVin: () => false,
  hiddenColumns: [],
  defaultChartPreset: [
    { title: "Vehicle speed", unit: "mph", series: [{ key: "speed", label: "Speed" }] },
    { title: "Engine speed", unit: "rpm", series: [{ key: "rpm", label: "RPM" }] },
    { title: "Engine load", unit: "%", series: [{ key: "load", label: "Load" }] },
    { title: "Coolant temperature", unit: "°F", series: [{ key: "ect", label: "ECT" }] },
  ],
  lookAlikeTolerances: {},
  suggestedPackIds: [],
};
