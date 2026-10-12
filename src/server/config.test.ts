import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

describe("loadConfig", () => {
  it("defaults the port and data root", () => {
    expect(loadConfig({})).toEqual({ port: 8080, dataDir: "/data" });
  });

  it("reads PORT and DATA_DIR", () => {
    expect(loadConfig({ PORT: "3001", DATA_DIR: "/tmp/x" })).toEqual({
      port: 3001,
      dataDir: "/tmp/x",
    });
  });
});
