import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Config, loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { createIngest } from "./ingest.ts";
import { DEFAULT_REGISTRY } from "./registry.ts";
import { readAppVersion } from "./version.ts";

type Out = { log: (line: string) => void; error: (line: string) => void };

/**
 * `npm run reparse -- [uploadId]`: re-derives every upload, or one, against the server's data
 * directory. Returns the exit code: 0 on success, 1 on a usage error, a missing database or any
 * unexpected error. Stop the server first; this runs beside it, not through it.
 */
export function main(
  args: readonly string[],
  config: Pick<Config, "dataDir"> = loadConfig(),
  out: Out = console,
  appVersion: string = readAppVersion(),
): number {
  if (args.length > 1 || (args[0] !== undefined && !/^[1-9]\d*$/.test(args[0]))) {
    out.error("Usage: npm run reparse -- [uploadId]");
    return 1;
  }
  const dbPath = join(config.dataDir, "obd-garage.db");
  if (!existsSync(dbPath)) {
    out.error("No database in the data directory; nothing to re-parse.");
    return 1;
  }
  const db = openDb(dbPath);
  try {
    const ingest = createIngest({
      db,
      dataDir: config.dataDir,
      registry: DEFAULT_REGISTRY,
      appVersion,
    });
    if (args[0] !== undefined) {
      const id = Number(args[0]);
      if (!ingest.rederiveUpload(id)) {
        out.error(`No upload with id ${id}.`);
        return 1;
      }
      out.log(`Re-derived upload ${id}.`);
    } else {
      ingest.rederiveUploads(db.listUploads().map((u) => u.id));
      out.log(`Re-derived ${db.listUploads().length} uploads.`);
    }
    const failed = db.listUploads().filter((u) => db.getDerived(u.id)?.failedError);
    if (failed.length > 0) out.log(`${failed.length} Failed Upload(s) remain.`);
    return 0;
  } catch (err) {
    out.error(`Re-parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    db.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
