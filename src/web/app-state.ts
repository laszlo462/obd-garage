import { computed, signal } from "@preact/signals";
import type { Api } from "./api.tsx";
import { pickCurrentVehicle } from "./current-vehicle.ts";
import { readStoredVehicleId, writeStoredVehicleId } from "./vehicle-store.ts";

export function createAppState(api: Api, storage: Storage) {
  const vehicles = signal<Awaited<ReturnType<typeof loadVehicles>>>([]);
  const storedId = signal<number | null>(readStoredVehicleId(storage));
  const currentVehicle = computed(() => pickCurrentVehicle(vehicles.value, storedId.value));
  const unassignedCount = signal(0);
  const failedCount = signal(0);
  const loaded = signal(false);
  const version = signal<string | null>(null);
  const needsAttention = computed(() => unassignedCount.value > 0 || failedCount.value > 0);

  async function loadVehicles() {
    return (await api.api.vehicles.$get()).json();
  }

  return {
    vehicles,
    currentVehicle,
    unassignedCount,
    failedCount,
    needsAttention,
    version,
    loaded,
    selectVehicle(id: number) {
      storedId.value = id;
      writeStoredVehicleId(storage, id);
    },
    async refresh() {
      const [v, unassigned, failed, health] = await Promise.all([
        loadVehicles(),
        api.api["drive-logs"].$get({ query: { unassigned: "1" } }),
        api.api["failed-uploads"].$get(),
        api.api.health.$get(),
      ]);
      vehicles.value = v;
      const u = await unassigned.json();
      unassignedCount.value = Array.isArray(u) ? u.length : 0;
      failedCount.value = (await failed.json()).length;
      version.value = (await health.json()).version;
      loaded.value = true;
    },
  };
}

export type AppState = ReturnType<typeof createAppState>;
