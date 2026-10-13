import { computed, signal } from "@preact/signals";
import type { Api } from "./api.tsx";
import { pickCurrentVehicle } from "./current-vehicle.ts";
import { readStoredVehicleId, writeStoredVehicleId } from "./vehicle-store.ts";

const TOAST_MS = 4000;

export function createAppState(api: Api, storage: Storage) {
  const vehicles = signal<Awaited<ReturnType<typeof loadVehicles>>>([]);
  const storedId = signal<number | null>(readStoredVehicleId(storage));
  const currentVehicle = computed(() => pickCurrentVehicle(vehicles.value, storedId.value));
  const unassignedCount = signal(0);
  const failedCount = signal(0);
  const loaded = signal(false);
  const refreshFailed = signal(false);
  const toastMessage = signal<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  /** Screens whose own load is failing, keyed by owner so each can clear just its report. */
  const failingScreens = signal<ReadonlySet<object>>(new Set());
  /** Bumped by `invalidate()`. List screens load on `[currentVehicle.id, revision]`. */
  const revision = signal(0);
  const version = signal<string | null>(null);
  const needsAttention = computed(() => unassignedCount.value > 0 || failedCount.value > 0);

  async function loadVehicles() {
    const res = await api.api.vehicles.$get();
    if (!res.ok) throw new Error("Request failed.");
    return res.json();
  }

  return {
    vehicles,
    currentVehicle,
    unassignedCount,
    failedCount,
    needsAttention,
    version,
    loaded,
    revision,
    /** True while a load failed: the shell shows one banner with Retry. */
    loadFailed: computed(() => refreshFailed.value || failingScreens.value.size > 0),
    toastMessage,
    /** Shows one shared toast for a failed action. A new toast replaces the current one. */
    toast(message: string) {
      clearTimeout(toastTimer);
      toastMessage.value = message;
      toastTimer = setTimeout(() => {
        toastMessage.value = null;
      }, TOAST_MS);
    },
    /** A screen reports its load failing (or not). Report `false` on success and on unmount. */
    reportLoad(owner: object, failed: boolean) {
      const next = new Set(failingScreens.value);
      if (failed) next.add(owner);
      else next.delete(owner);
      failingScreens.value = next;
    },
    /** Call after data changes (an upload, a delete, an assignment) so the list screens reload. */
    invalidate() {
      revision.value++;
    },
    selectVehicle(id: number) {
      storedId.value = id;
      writeStoredVehicleId(storage, id);
    },
    /** Never rejects: a failure keeps the old data and sets `loadFailed` until a refresh succeeds. */
    async refresh() {
      try {
        const [v, unassigned, failed, health] = await Promise.all([
          loadVehicles(),
          api.api["drive-logs"].$get({ query: { unassigned: "1" } }),
          api.api["failed-uploads"].$get(),
          api.api.health.$get(),
        ]);
        if (!failed.ok || !health.ok) throw new Error("Request failed.");
        const u = await unassigned.json();
        const failedRows = await failed.json();
        const healthBody = await health.json();
        vehicles.value = v;
        unassignedCount.value = Array.isArray(u) ? u.length : 0;
        failedCount.value = failedRows.length;
        version.value = healthBody.version;
        loaded.value = true;
        refreshFailed.value = false;
      } catch {
        refreshFailed.value = true;
      }
    },
  };
}

export type AppState = ReturnType<typeof createAppState>;
