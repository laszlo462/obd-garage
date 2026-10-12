import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanFilename, originalPath, saveOriginal, sweepTmp } from "./originals.ts";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "obd-originals-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const bytes = new Uint8Array([1, 2, 3]);
const at = "2026-03-14T10:00:00Z";

describe("cleanFilename", () => {
  it("replaces path separators and control characters", () => {
    expect(cleanFilename("../a\\b\u0000c\nd.csv")).toBe(".._a_b_c_d.csv");
  });

  it("falls back for empty and dot-only names", () => {
    expect(cleanFilename("")).toBe("upload");
    expect(cleanFilename("..")).toBe("upload");
  });
});

describe("saveOriginal", () => {
  it("stores under <kind>/<upload YYYY-MM>/<filename> and commits with that path", () => {
    const stored = saveOriginal(
      dataDir,
      { kind: "drive-log", filename: "log.csv", bytes, uploadedAt: at },
      (p) => p,
    );
    expect(stored).toBe("drive-logs/2026-03/log.csv");
    expect(readFileSync(originalPath(dataDir, stored))).toEqual(Buffer.from(bytes));
    expect(readdirSync(join(dataDir, "tmp"))).toEqual([]);
  });

  it("puts Diagnostic Reports under reports", () => {
    const stored = saveOriginal(
      dataDir,
      { kind: "report", filename: "r.html", bytes, uploadedAt: at },
      (p) => p,
    );
    expect(stored).toBe("reports/2026-03/r.html");
  });

  it("adds -2, then -3, on a filename clash", () => {
    const save = () =>
      saveOriginal(
        dataDir,
        { kind: "drive-log", filename: "log.csv", bytes, uploadedAt: at },
        (p) => p,
      );
    expect(save()).toBe("drive-logs/2026-03/log.csv");
    expect(save()).toBe("drive-logs/2026-03/log-2.csv");
    expect(save()).toBe("drive-logs/2026-03/log-3.csv");
  });

  it("removes the renamed file when the commit throws", () => {
    expect(() =>
      saveOriginal(
        dataDir,
        { kind: "drive-log", filename: "log.csv", bytes, uploadedAt: at },
        () => {
          throw new Error("commit failed");
        },
      ),
    ).toThrow("commit failed");
    expect(existsSync(join(dataDir, "originals", "drive-logs", "2026-03", "log.csv"))).toBe(false);
    expect(readdirSync(join(dataDir, "tmp"))).toEqual([]);
  });

  it("has the file in place before the commit runs", () => {
    saveOriginal(
      dataDir,
      { kind: "drive-log", filename: "log.csv", bytes, uploadedAt: at },
      (p) => {
        expect(existsSync(originalPath(dataDir, p))).toBe(true);
      },
    );
  });
});

describe("sweepTmp", () => {
  it("empties tmp and never touches originals", () => {
    const stored = saveOriginal(
      dataDir,
      { kind: "report", filename: "r.html", bytes, uploadedAt: at },
      (p) => p,
    );
    mkdirSync(join(dataDir, "tmp", "sub"), { recursive: true });
    writeFileSync(join(dataDir, "tmp", "stale"), "x");
    writeFileSync(join(dataDir, "tmp", "sub", "stale"), "x");
    sweepTmp(dataDir);
    expect(readdirSync(join(dataDir, "tmp"))).toEqual([]);
    expect(existsSync(originalPath(dataDir, stored))).toBe(true);
  });

  it("does nothing when tmp does not exist", () => {
    expect(() => sweepTmp(dataDir)).not.toThrow();
  });
});
