const KEY = "obd-garage.current-vehicle";

// Storage can throw (private window, blocked site data), so every access is guarded.
export function readStoredVehicleId(storage: Storage): number | null {
  try {
    const text = storage.getItem(KEY);
    return text !== null && /^\d+$/.test(text) ? Number(text) : null;
  } catch {
    return null;
  }
}

export function writeStoredVehicleId(storage: Storage, id: number): void {
  try {
    storage.setItem(KEY, String(id));
  } catch {
    // The choice just isn't remembered.
  }
}

/** `localStorage`, or a storage that remembers nothing when the browser blocks it. */
export function safeStorage(): Storage {
  try {
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} } as unknown as Storage;
  }
}
