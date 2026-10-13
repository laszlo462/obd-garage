import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { UploadKind } from "./originals.ts";

// The one module that touches SQL. Everything else in the server calls the `Db` it returns.

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

/** Tables that hold derived data (ADR 0003). Wiping them must never lose owner data. */
const DERIVED_TABLES = ["events", "derived_uploads"] as const;

export type Vehicle = {
  id: number;
  vin: string;
  label: string;
  profileId: string;
  packIds: string[];
};
export type NewVehicle = Omit<Vehicle, "id">;

export type Upload = {
  id: number;
  kind: UploadKind;
  storedPath: string;
  uploadedFilename: string;
  sha256: string;
  /** Real instant, ISO 8601 UTC. */
  uploadedAt: string;
  /** Naive local wall-clock time, ISO 8601 with no offset. */
  recordedAt: string | null;
  /** `null` is Unassigned. */
  vehicleId: number | null;
};
export type NewUpload = Omit<Upload, "id">;

export type Note = {
  id: number;
  uploadId: number;
  text: string;
  /** The Original's raw `Time (sec)`; `null` for a Note on the whole upload. */
  pinnedTimeSec: number | null;
  createdAt: string;
};
export type NewNote = Omit<Note, "id">;

export type DerivedEvent = {
  ruleId: string;
  startSec: number | null;
  endSec: number | null;
  data: unknown;
};

export type Derived = {
  appVersion: string;
  derivedAt: string;
  /** Set when the upload is a Failed Upload. */
  failedError: string | null;
  metadata: unknown;
  channels: Uint8Array | null;
  parsedReport: unknown;
  ruleOutcomes: unknown[];
  decodeNotices: unknown[];
  warnings: unknown[];
  warningCount: number;
  events: DerivedEvent[];
};

/** The cheap part of a derived row: what list routes and ingest read without the blobs and Events. */
export type DerivedSummary = Pick<Derived, "failedError" | "metadata" | "warningCount">;

export type OwnerSnapshot = {
  vehicles: Vehicle[];
  uploads: Upload[];
  referenceReports: { driveLogId: number; reportId: number | null }[];
  notes: Note[];
};

export type Db = ReturnType<typeof openDb>;

type Row = Record<string, unknown>;

const json = (value: unknown) =>
  value === undefined || value === null ? null : JSON.stringify(value);
const unjson = (text: unknown) => (typeof text === "string" ? JSON.parse(text) : null);

const toVehicle = (r: Row): Vehicle => ({
  id: r.id as number,
  vin: r.vin as string,
  label: r.label as string,
  profileId: r.profile_id as string,
  packIds: JSON.parse(r.pack_ids as string),
});

const toUpload = (r: Row): Upload => ({
  id: r.id as number,
  kind: r.kind as UploadKind,
  storedPath: r.stored_path as string,
  uploadedFilename: r.uploaded_filename as string,
  sha256: r.sha256 as string,
  uploadedAt: r.uploaded_at as string,
  recordedAt: r.recorded_at as string | null,
  vehicleId: r.vehicle_id as number | null,
});

const toNote = (r: Row): Note => ({
  id: r.id as number,
  uploadId: r.upload_id as number,
  text: r.text as string,
  pinnedTimeSec: r.pinned_time_sec as number | null,
  createdAt: r.created_at as string,
});

/** Applies `NNNN_name.sql` files above the database's `PRAGMA user_version`, each in its own transaction. */
function migrate(db: Database.Database, dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  const current = db.pragma("user_version", { simple: true }) as number;
  for (const file of files) {
    const version = Number.parseInt(file.slice(0, 4), 10);
    if (version <= current) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  }
}

/** Opens (creating if needed) the database at `file` and migrates it to the latest version. */
export function openDb(file: string, options: { migrationsDir?: string } = {}) {
  const db = new Database(file);
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db, options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR);
  } catch (error) {
    db.close();
    throw error;
  }

  const stmt = (sql: string) => db.prepare(sql);

  return {
    close: () => db.close(),
    userVersion: () => db.pragma("user_version", { simple: true }) as number,
    /** Runs `fn` in one transaction; use it to keep a write and a file save together. */
    transaction: <T>(fn: () => T): T => db.transaction(fn)(),

    // Owner data: Vehicles
    addVehicle(v: NewVehicle): Vehicle {
      const info = stmt(
        "INSERT INTO vehicles (vin, label, profile_id, pack_ids) VALUES (?, ?, ?, ?)",
      ).run(v.vin, v.label, v.profileId, JSON.stringify(v.packIds));
      return { ...v, id: Number(info.lastInsertRowid) };
    },
    getVehicle: (id: number) => {
      const r = stmt("SELECT * FROM vehicles WHERE id = ?").get(id) as Row | undefined;
      return r && toVehicle(r);
    },
    getVehicleByVin: (vin: string) => {
      const r = stmt("SELECT * FROM vehicles WHERE vin = ?").get(vin) as Row | undefined;
      return r && toVehicle(r);
    },
    listVehicles: () => (stmt("SELECT * FROM vehicles ORDER BY id").all() as Row[]).map(toVehicle),
    updateVehicle(id: number, changes: Partial<Pick<Vehicle, "label" | "profileId" | "packIds">>) {
      const v = this.getVehicle(id);
      if (!v) return;
      const m = { ...v, ...changes };
      stmt("UPDATE vehicles SET label = ?, profile_id = ?, pack_ids = ? WHERE id = ?").run(
        m.label,
        m.profileId,
        JSON.stringify(m.packIds),
        id,
      );
    },

    /** Deletes the Vehicle row only. The caller first moves or deletes its uploads. */
    deleteVehicle: (id: number) => {
      stmt("DELETE FROM vehicles WHERE id = ?").run(id);
    },

    // Owner data: uploads
    addUpload(u: NewUpload): Upload {
      const info = stmt(
        `INSERT INTO uploads (kind, stored_path, uploaded_filename, sha256, uploaded_at, recorded_at, vehicle_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        u.kind,
        u.storedPath,
        u.uploadedFilename,
        u.sha256,
        u.uploadedAt,
        u.recordedAt,
        u.vehicleId,
      );
      return { ...u, id: Number(info.lastInsertRowid) };
    },
    getUpload: (id: number) => {
      const r = stmt("SELECT * FROM uploads WHERE id = ?").get(id) as Row | undefined;
      return r && toUpload(r);
    },
    findUploadBySha: (sha256: string) => {
      const r = stmt("SELECT * FROM uploads WHERE sha256 = ?").get(sha256) as Row | undefined;
      return r && toUpload(r);
    },
    /** `vehicleId: null` is Unassigned. Filters in SQL (`IS ?` matches null), in id order. */
    listUploads: (filter: { kind?: UploadKind; vehicleId?: number | null } = {}) => {
      const where: string[] = [];
      const args: (string | number | null)[] = [];
      if (filter.kind !== undefined) {
        where.push("kind = ?");
        args.push(filter.kind);
      }
      if (filter.vehicleId !== undefined) {
        where.push("vehicle_id IS ?");
        args.push(filter.vehicleId);
      }
      const clause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
      return (stmt(`SELECT * FROM uploads${clause} ORDER BY id`).all(...args) as Row[]).map(
        toUpload,
      );
    },
    /** Assigns, reassigns or (with `null`) unassigns an upload. */
    assignVehicle: (uploadId: number, vehicleId: number | null) => {
      stmt("UPDATE uploads SET vehicle_id = ? WHERE id = ?").run(vehicleId, uploadId);
    },
    setRecordedAt: (uploadId: number, recordedAt: string | null) => {
      stmt("UPDATE uploads SET recorded_at = ? WHERE id = ?").run(recordedAt, uploadId);
    },
    /** Deletes the row with its Notes, Reference Report choices and derived data. The caller removes the file. */
    deleteUpload: (id: number) => {
      stmt("DELETE FROM uploads WHERE id = ?").run(id);
    },

    // Owner data: Reference Reports set or cleared by hand
    setReferenceReport: (driveLogId: number, reportId: number | null) => {
      stmt(
        `INSERT INTO reference_reports (drive_log_id, report_id) VALUES (?, ?)
         ON CONFLICT (drive_log_id) DO UPDATE SET report_id = excluded.report_id`,
      ).run(driveLogId, reportId);
    },
    /** `undefined`: no choice stored (use the default). `{ reportId: null }`: cleared by hand. */
    getReferenceReport: (driveLogId: number) => {
      const r = stmt("SELECT report_id FROM reference_reports WHERE drive_log_id = ?").get(
        driveLogId,
      ) as Row | undefined;
      return r && { reportId: r.report_id as number | null };
    },
    /** Goes back to the closest-in-time default. */
    clearReferenceChoice: (driveLogId: number) => {
      stmt("DELETE FROM reference_reports WHERE drive_log_id = ?").run(driveLogId);
    },

    // Owner data: Notes
    addNote(n: NewNote): Note {
      const info = stmt(
        "INSERT INTO notes (upload_id, text, pinned_time_sec, created_at) VALUES (?, ?, ?, ?)",
      ).run(n.uploadId, n.text, n.pinnedTimeSec, n.createdAt);
      return { ...n, id: Number(info.lastInsertRowid) };
    },
    listNotes: (uploadId: number) =>
      (stmt("SELECT * FROM notes WHERE upload_id = ? ORDER BY id").all(uploadId) as Row[]).map(
        toNote,
      ),
    getNote: (id: number) => {
      const r = stmt("SELECT * FROM notes WHERE id = ?").get(id) as Row | undefined;
      return r && toNote(r);
    },
    setNoteText: (id: number, text: string) => {
      stmt("UPDATE notes SET text = ? WHERE id = ?").run(text, id);
    },
    deleteNote: (id: number) => {
      stmt("DELETE FROM notes WHERE id = ?").run(id);
    },
    /** Note count per upload id; an upload with none is absent. */
    noteCounts: () =>
      new Map(
        (stmt("SELECT upload_id, COUNT(*) AS n FROM notes GROUP BY upload_id").all() as Row[]).map(
          (r) => [r.upload_id as number, r.n as number],
        ),
      ),

    // Derived data
    /** Replaces an upload's derived data all-or-nothing, in one transaction. */
    saveDerived(uploadId: number, d: Derived) {
      db.transaction(() => {
        stmt("DELETE FROM derived_uploads WHERE upload_id = ?").run(uploadId);
        stmt("DELETE FROM events WHERE upload_id = ?").run(uploadId);
        stmt(
          `INSERT INTO derived_uploads (upload_id, app_version, derived_at, failed_error, metadata, channels,
             parsed_report, rule_outcomes, decode_notices, warnings, warning_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          uploadId,
          d.appVersion,
          d.derivedAt,
          d.failedError,
          json(d.metadata),
          d.channels,
          json(d.parsedReport),
          JSON.stringify(d.ruleOutcomes),
          JSON.stringify(d.decodeNotices),
          JSON.stringify(d.warnings),
          d.warningCount,
        );
        const insertEvent = stmt(
          "INSERT INTO events (upload_id, rule_id, start_sec, end_sec, data) VALUES (?, ?, ?, ?, ?)",
        );
        for (const e of d.events)
          insertEvent.run(uploadId, e.ruleId, e.startSec, e.endSec, JSON.stringify(e.data ?? {}));
      })();
    },
    /** `failed_error`, `metadata` and the warning count only: no Channels blob, Report or Events. */
    getDerivedSummary(uploadId: number): DerivedSummary | undefined {
      const r = stmt(
        "SELECT failed_error, metadata, warning_count FROM derived_uploads WHERE upload_id = ?",
      ).get(uploadId) as Row | undefined;
      if (!r) return undefined;
      return {
        failedError: r.failed_error as string | null,
        metadata: unjson(r.metadata),
        warningCount: r.warning_count as number,
      };
    },
    /** The parsed Report only: no Channels blob or Events. `null` for a Drive Log or Failed Upload. */
    getParsedReport(uploadId: number): unknown {
      const r = stmt("SELECT parsed_report FROM derived_uploads WHERE upload_id = ?").get(
        uploadId,
      ) as Row | undefined;
      return r ? unjson(r.parsed_report) : null;
    },
    getDerived(uploadId: number): Derived | undefined {
      const r = stmt("SELECT * FROM derived_uploads WHERE upload_id = ?").get(uploadId) as
        | Row
        | undefined;
      if (!r) return undefined;
      const events = (
        stmt("SELECT * FROM events WHERE upload_id = ? ORDER BY id").all(uploadId) as Row[]
      ).map((e) => ({
        ruleId: e.rule_id as string,
        startSec: e.start_sec as number | null,
        endSec: e.end_sec as number | null,
        data: unjson(e.data),
      }));
      return {
        appVersion: r.app_version as string,
        derivedAt: r.derived_at as string,
        failedError: r.failed_error as string | null,
        metadata: unjson(r.metadata),
        channels: r.channels ? new Uint8Array(r.channels as Buffer) : null,
        parsedReport: unjson(r.parsed_report),
        ruleOutcomes: unjson(r.rule_outcomes),
        decodeNotices: unjson(r.decode_notices),
        warnings: unjson(r.warnings),
        warningCount: r.warning_count as number,
        events,
      };
    },
    /** Event count per upload id; an upload with none is absent. */
    eventCounts: () =>
      new Map(
        (stmt("SELECT upload_id, COUNT(*) AS n FROM events GROUP BY upload_id").all() as Row[]).map(
          (r) => [r.upload_id as number, r.n as number],
        ),
      ),
    /** Ids of uploads with no derived data, or derived data stamped with another app version. */
    staleUploadIds: (appVersion: string) =>
      (
        stmt(
          `SELECT u.id FROM uploads u LEFT JOIN derived_uploads d ON d.upload_id = u.id
           WHERE d.upload_id IS NULL OR d.app_version <> ? ORDER BY u.id`,
        ).all(appVersion) as Row[]
      ).map((r) => r.id as number),
    /** Drops every derived row. Owner data is untouched. */
    wipeDerived() {
      db.transaction(() => {
        for (const table of DERIVED_TABLES) db.exec(`DELETE FROM ${table}`);
      })();
    },

    // Test and guard helpers
    /** All owner data, for the wipe-and-re-derive comparison. */
    ownerSnapshot(): OwnerSnapshot {
      return {
        vehicles: (stmt("SELECT * FROM vehicles ORDER BY id").all() as Row[]).map(toVehicle),
        uploads: (stmt("SELECT * FROM uploads ORDER BY id").all() as Row[]).map(toUpload),
        referenceReports: (
          stmt("SELECT * FROM reference_reports ORDER BY drive_log_id").all() as Row[]
        ).map((r) => ({
          driveLogId: r.drive_log_id as number,
          reportId: r.report_id as number | null,
        })),
        notes: (stmt("SELECT * FROM notes ORDER BY id").all() as Row[]).map(toNote),
      };
    },
    /** Foreign keys from an owner table into a derived table. Must always be empty (ADR 0003). */
    ownerReferencesToDerived(): string[] {
      const owner = (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .all() as { name: string }[]
      )
        .map((t) => t.name)
        .filter((n) => !(DERIVED_TABLES as readonly string[]).includes(n));
      const found: string[] = [];
      for (const table of owner) {
        for (const fk of db.pragma(`foreign_key_list(${table})`) as { table: string }[]) {
          if ((DERIVED_TABLES as readonly string[]).includes(fk.table))
            found.push(`${table} -> ${fk.table}`);
        }
      }
      return found;
    },
  };
}
