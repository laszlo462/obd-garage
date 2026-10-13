import { describe, expect, it, vi } from "vitest";
import { readStoredVehicleId, safeStorage, writeStoredVehicleId } from "./vehicle-store.ts";

const memory = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  } as Storage;
};

const throwing = (): Storage =>
  ({
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  }) as unknown as Storage;

describe("vehicle store", () => {
  it("remembers the Current Vehicle id", () => {
    const storage = memory();
    writeStoredVehicleId(storage, 9);
    expect(readStoredVehicleId(storage)).toBe(9);
  });

  it("reads as none when storage throws", () => {
    expect(readStoredVehicleId(throwing())).toBeNull();
  });

  it("ignores a write when storage throws", () => {
    expect(() => writeStoredVehicleId(throwing(), 9)).not.toThrow();
  });

  it("reads as none when nothing usable is stored", () => {
    expect(readStoredVehicleId(memory())).toBeNull();
    const junk = memory();
    junk.setItem("obd-garage.current-vehicle", "abc");
    expect(readStoredVehicleId(junk)).toBeNull();
  });

  it("falls back to a storage that remembers nothing when localStorage is blocked", () => {
    vi.stubGlobal("localStorage", undefined);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      const storage = safeStorage();
      writeStoredVehicleId(storage, 4);
      expect(readStoredVehicleId(storage)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
