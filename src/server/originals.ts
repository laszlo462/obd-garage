import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type UploadKind = "report" | "drive-log";

const KIND_DIR: Record<UploadKind, string> = { report: "reports", "drive-log": "drive-logs" };

/** Cleans an uploaded filename of path separators and control characters. */
export function cleanFilename(name: string): string {
  const cleaned = name.replace(/[/\\\p{Cc}]/gu, "_").trim();
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "upload" : cleaned;
}

function withSuffix(name: string, n: number): string {
  if (n === 1) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`;
}

/**
 * Keeps an Original on disk. Order: write to `<dataDir>/tmp`, rename into place, then call `commit`
 * with the stored path (relative to the originals directory, `/`-separated). If `commit` throws, the
 * renamed file is removed again, so no row points at a missing file and no stray file stays behind.
 * A crash between the rename and the commit leaves an unreferenced file in `originals`; the sweep
 * never touches it, and a later upload of the same name gets a `-2` suffix.
 */
export function saveOriginal<T>(
  dataDir: string,
  input: { kind: UploadKind; filename: string; bytes: Uint8Array; uploadedAt: string },
  commit: (storedPath: string) => T,
): T {
  const dirRel = `${KIND_DIR[input.kind]}/${input.uploadedAt.slice(0, 7)}`;
  const originalsDir = join(dataDir, "originals");
  const dir = join(originalsDir, dirRel);
  const clean = cleanFilename(input.filename);
  let n = 1;
  while (existsSync(join(dir, withSuffix(clean, n)))) n++;
  const storedPath = `${dirRel}/${withSuffix(clean, n)}`;
  const finalPath = join(originalsDir, storedPath);

  const tmpDir = join(dataDir, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(dirname(finalPath), { recursive: true });
  const tmpPath = join(tmpDir, randomUUID());
  try {
    writeFileSync(tmpPath, input.bytes);
    renameSync(tmpPath, finalPath);
  } catch (error) {
    rmSync(tmpPath, { force: true });
    throw error;
  }
  try {
    return commit(storedPath);
  } catch (error) {
    rmSync(finalPath, { force: true });
    throw error;
  }
}

/** Absolute path of a stored Original. */
export function originalPath(dataDir: string, storedPath: string): string {
  return join(dataDir, "originals", ...storedPath.split("/"));
}

/** The startup sweep: empties `<dataDir>/tmp` and touches nothing else. */
export function sweepTmp(dataDir: string): void {
  const tmpDir = join(dataDir, "tmp");
  if (!existsSync(tmpDir)) return;
  for (const entry of readdirSync(tmpDir)) {
    rmSync(join(tmpDir, entry), { recursive: true, force: true });
  }
}
