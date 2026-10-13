import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { type DeriveResult, derive, GENERIC_PROFILE } from "../core/derive.ts";
import { type ParsedReport, parseReport } from "../core/report.ts";
import type { Db, Derived, Upload, Vehicle } from "./db.ts";
import { originalPath, saveOriginal, type UploadKind } from "./originals.ts";
import { GENERIC_ONLY_REGISTRY, type ProfileRegistry } from "./registry.ts";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** The refusal for a file over `MAX_UPLOAD_BYTES`. */
export const tooLargeResult = (): UploadResult => ({
  outcome: "refused",
  kind: "unknown",
  reason: "The file is over the 25 MB limit.",
  warnings: [],
});

export type SameDayUnassigned = { uploadId: number; filename: string; recordedAt: string | null };

export type UploadResult = {
  outcome: "added" | "warned" | "failed" | "refused";
  kind: UploadKind | "unknown";
  uploadId?: number;
  reason?: string;
  warnings: string[];
  vehicleCreated?: {
    id: number;
    label: string;
    vin: string;
    profile: string;
    packs: string[];
    sameDayUnassigned: SameDayUnassigned[];
  };
};

export type IngestDeps = {
  dataDir: string;
  registry?: ProfileRegistry;
  /** Stamped on derived data; a change makes every upload stale. */
  appVersion?: string;
  /** The clock. Injected so tests can compare derived data exactly. */
  now?: () => Date;
  /** Runs before each upload of the background re-derive. Injected so tests can step through it. */
  yieldToRequests?: () => Promise<void>;
};

/** Naive local ISO time to a comparable number. Both sides come from the same clock (ADR 0004). */
const asMs = (naive: string) => Date.parse(`${naive}Z`);
const dayOf = (naive: string) => naive.slice(0, 10);

/** Column-oriented Channels blob: UTF-8 JSON of the collapsed `t` and each Channel's values. */
function encodeChannels(t: readonly number[], channels: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ t, channels }));
}

/** Year Make Model; the VIN when any is missing; the VIN's last 4 appended when the label is taken. */
function vehicleLabel(header: ParsedReport["header"], taken: Set<string>): string {
  const { year, make, model, vin } = header;
  if (year === undefined || !make || !model) return vin;
  const base = `${year} ${make} ${model}`;
  return taken.has(base) ? `${base} · …${vin.slice(-4)}` : base;
}

type Recognised =
  | { kind: "report"; report: ParsedReport }
  | { kind: "drive-log"; startTime: string }
  | { kind: "failed"; upload: UploadKind; reason: string }
  | { kind: "unknown" };

/** Recognises by content, never by file name. */
function recognise(bytes: Uint8Array): Recognised {
  const r = parseReport(bytes);
  if (r.kind === "report") return { kind: "report", report: r.report };
  if (r.kind === "failed") return { kind: "failed", upload: "report", reason: r.reason };
  const d = derive(bytes, { profile: GENERIC_PROFILE, packs: [], params: {} });
  if (d.kind === "derived") return { kind: "drive-log", startTime: d.metadata.startTime };
  if (d.kind === "failed") return { kind: "failed", upload: "drive-log", reason: d.reason };
  return { kind: "unknown" };
}

type Metadata = { duration?: number; referenceReportId?: number | null };

export function createIngest(deps: IngestDeps & { db: Db }) {
  const { db, dataDir } = deps;
  const registry = deps.registry ?? GENERIC_ONLY_REGISTRY;
  const appVersion = deps.appVersion ?? "0.0.0";
  const now = deps.now ?? (() => new Date());
  const yieldToRequests =
    deps.yieldToRequests ?? (() => new Promise<void>((resolve) => setImmediate(resolve)));

  const metadataOf = (uploadId: number) => db.getDerived(uploadId)?.metadata as Metadata | null;

  /** A new Vehicle for a Report's VIN, with the Profile and suggested Rule Packs the registry matches. */
  function addVehicleFor(h: ParsedReport["header"]): Vehicle {
    const match = registry.matchVin(h.vin);
    const taken = new Set(db.listVehicles().map((v) => v.label));
    return db.addVehicle({
      vin: h.vin,
      label: vehicleLabel(h, taken),
      profileId: match.profileId,
      packIds: [...match.suggestedPackIds],
    });
  }

  /** The closest-in-time Report of the Vehicle, before or after; the earlier one wins a tie. */
  function defaultReferenceReportId(vehicleId: number, recordedAt: string): number | null {
    const at = asMs(recordedAt);
    let best: { id: number; gap: number } | null = null;
    for (const r of db.listUploads({ kind: "report", vehicleId })) {
      if (!r.recordedAt || db.getDerived(r.id)?.failedError !== null) continue;
      const gap = Math.abs(asMs(r.recordedAt) - at);
      if (best === null || gap < best.gap) best = { id: r.id, gap };
    }
    return best?.id ?? null;
  }

  /**
   * The owner's choice if there is one and it parsed, else the default. A chosen Report that is a
   * Failed Upload stays stored but is not used until it parses again. Unassigned Drive Logs have none.
   */
  function referenceReportIdFor(upload: Upload): number | null {
    if (upload.vehicleId === null || !upload.recordedAt) return null;
    const chosen = db.getReferenceReport(upload.id);
    if (
      chosen &&
      (chosen.reportId === null || db.getDerived(chosen.reportId)?.failedError === null)
    )
      return chosen.reportId;
    return defaultReferenceReportId(upload.vehicleId, upload.recordedAt);
  }

  /** Everything derived from one Original, as the rows to store. */
  function computeDerived(upload: Upload, bytes: Uint8Array): Derived {
    const base = { appVersion, derivedAt: now().toISOString() };
    const empty = {
      metadata: null,
      channels: null,
      parsedReport: null,
      ruleOutcomes: [],
      decodeNotices: [],
      warnings: [],
      warningCount: 0,
      events: [],
    };
    const failed = (reason: string): Derived => ({ ...base, ...empty, failedError: reason });

    if (upload.kind === "report") {
      const r = parseReport(bytes);
      if (r.kind === "failed") return failed(r.reason);
      if (r.kind === "not-report")
        return failed("The file is no longer read as a Diagnostic Report.");
      return {
        ...base,
        ...empty,
        failedError: null,
        metadata: { header: r.report.header },
        parsedReport: r.report,
      };
    }

    const vehicle = upload.vehicleId === null ? undefined : db.getVehicle(upload.vehicleId);
    const referenceReportId = vehicle ? referenceReportIdFor(upload) : null;
    const reference =
      referenceReportId === null
        ? undefined
        : (db.getDerived(referenceReportId)?.parsedReport as ParsedReport | null | undefined);
    const result: DeriveResult = derive(bytes, {
      profile: (vehicle && registry.profile(vehicle.profileId)) || GENERIC_PROFILE,
      packs: (vehicle?.packIds ?? []).flatMap((id) => registry.pack(id) ?? []),
      ...(reference ? { referenceReport: reference } : {}),
      params: {},
    });
    if (result.kind === "failed") return failed(result.reason);
    if (result.kind === "not-drive-log")
      return failed("The file is no longer read as a Drive Log.");
    return {
      ...base,
      failedError: null,
      metadata: { ...result.metadata, referenceReportId },
      channels: encodeChannels(result.t, result.channels),
      parsedReport: null,
      ruleOutcomes: result.outcomes,
      decodeNotices: result.notices,
      warnings: result.metadata.warnings,
      warningCount: result.metadata.warnings.length,
      events: result.events.map((e) => ({
        ruleId: e.ruleId,
        startSec: e.t0,
        endSec: e.t1,
        data: {
          kind: e.kind,
          title: e.title,
          text: e.text,
          packId: e.packId,
          category: e.category,
        },
      })),
    };
  }

  const deriveStored = (upload: Upload, bytes: Uint8Array) =>
    db.saveDerived(upload.id, computeDerived(upload, bytes));

  const reportsFirst = (uploads: readonly Upload[]) => [
    ...uploads.filter((u) => u.kind === "report"),
    ...uploads.filter((u) => u.kind === "drive-log"),
  ];

  const stampFailure = (reason: string): Derived => ({
    appVersion,
    derivedAt: now().toISOString(),
    failedError: reason,
    metadata: null,
    channels: null,
    parsedReport: null,
    ruleOutcomes: [],
    decodeNotices: [],
    warnings: [],
    warningCount: 0,
    events: [],
  });

  /**
   * Re-derives from the Original on disk (ADR 0003). A missing Original, a changed SHA-256 or a Report
   * whose VIN changed becomes a Failed Upload; the owner data stays. An upload that failed before and
   * now parses is restored: its recorded time and, for a Report, its Vehicle are filled in.
   */
  function deriveFromDisk(initial: Upload): void {
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(originalPath(dataDir, initial.storedPath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      db.saveDerived(initial.id, stampFailure("Original missing"));
      return;
    }
    if (createHash("sha256").update(bytes).digest("hex") !== initial.sha256) {
      db.saveDerived(initial.id, stampFailure("Original changed on disk"));
      return;
    }

    if (initial.kind === "report") {
      const r = parseReport(bytes);
      if (r.kind === "report") {
        const h = r.report.header;
        const vehicle = initial.vehicleId === null ? undefined : db.getVehicle(initial.vehicleId);
        if (vehicle && vehicle.vin !== h.vin) {
          db.saveDerived(
            initial.id,
            stampFailure("The VIN changed on re-parse, so the Report was not moved."),
          );
          return;
        }
        if (!vehicle)
          db.assignVehicle(initial.id, (db.getVehicleByVin(h.vin) ?? addVehicleFor(h)).id);
        if (initial.recordedAt !== h.date) db.setRecordedAt(initial.id, h.date);
      }
    } else {
      // Settle the recorded time first, because the derive reads the Reference Report from it.
      const d = derive(bytes, { profile: GENERIC_PROFILE, packs: [], params: {} });
      if (d.kind === "derived" && initial.recordedAt !== d.metadata.startTime)
        db.setRecordedAt(initial.id, d.metadata.startTime);
    }
    deriveStored(db.getUpload(initial.id) ?? initial, bytes);
  }

  /**
   * Re-derives one upload from its Original plus the owner data, all-or-nothing in its own transaction.
   * Owner data is never written. Returns `false` when there is no such upload. A missing Original
   * throws (the caller decides how that surfaces).
   */
  function rederiveUpload(uploadId: number): boolean {
    const upload = db.getUpload(uploadId);
    if (!upload) return false;
    db.transaction(() => {
      deriveFromDisk(upload);
      // A Report that changed (or was restored) can change its Vehicle's default Reference Reports.
      const after = db.getUpload(uploadId);
      if (after?.kind === "report" && after.vehicleId !== null)
        rederiveChangedDefaults(after.vehicleId);
    });
    return true;
  }

  /** Re-derives the given uploads, Reports first because Drive Logs read them as Reference Reports. */
  function rederiveUploads(uploadIds: readonly number[]): void {
    const ordered = reportsFirst(uploadIds.flatMap((id) => db.getUpload(id) ?? []));
    db.transaction(() => {
      for (const u of ordered) deriveFromDisk(u);
    });
  }

  /**
   * Re-derives every upload whose derived data is missing or stamped with another app version, in the
   * background: one upload at a time, each in its own transaction, Reports first, yielding between
   * uploads. Stale data is served until each upload is swapped. An upload that throws is skipped (and
   * stays stale for the next start). Resolves with the number re-derived.
   */
  async function rederiveStale(): Promise<number> {
    const stale = reportsFirst(
      db.staleUploadIds(appVersion).flatMap((id) => db.getUpload(id) ?? []),
    );
    let done = 0;
    for (const u of stale) {
      await yieldToRequests();
      try {
        if (rederiveUpload(u.id)) done++;
      } catch (err) {
        console.error(`Re-derive of upload ${u.id} failed:`, err);
      }
    }
    return done;
  }

  /** Re-derives every Drive Log of the Vehicle (a Profile or Rule Pack change). Returns the count. */
  function rederiveVehicleLogs(vehicleId: number): number {
    const logs = db.listUploads({ kind: "drive-log", vehicleId });
    rederiveUploads(logs.map((l) => l.id));
    return logs.length;
  }

  /** Re-derives the Vehicle's Drive Logs whose resolved Reference Report changed. */
  function rederiveChangedDefaults(vehicleId: number): void {
    for (const log of db.listUploads({ kind: "drive-log", vehicleId })) {
      const d = db.getDerived(log.id);
      if (!d || d.failedError !== null) continue;
      const before = metadataOf(log.id)?.referenceReportId ?? null;
      if (before !== referenceReportIdFor(log)) deriveFromDisk(log);
    }
  }

  function overlapWarnings(log: Upload): string[] {
    if (log.vehicleId === null || !log.recordedAt) return [];
    const start = asMs(log.recordedAt);
    const end = start + (metadataOf(log.id)?.duration ?? 0) * 1000;
    return db
      .listUploads({ kind: "drive-log", vehicleId: log.vehicleId })
      .filter((o) => {
        if (o.id === log.id || !o.recordedAt) return false;
        const os = asMs(o.recordedAt);
        return os <= end && start <= os + (metadataOf(o.id)?.duration ?? 0) * 1000;
      })
      .map((o) => `This Drive Log overlaps ${o.uploadedFilename} on the same Vehicle.`);
  }

  /**
   * Ingests one file. `vehicleId` (`null` is Unassigned, already checked to exist) is ignored for Reports.
   * The size check here backs up the route's body limit for callers that skip the route.
   */
  function ingest(input: {
    bytes: Uint8Array;
    filename: string;
    vehicleId: number | null;
  }): UploadResult {
    const { bytes, filename } = input;
    if (bytes.length > MAX_UPLOAD_BYTES) return tooLargeResult();
    const rec = recognise(bytes);
    if (rec.kind === "unknown")
      return {
        outcome: "refused",
        kind: "unknown",
        reason: "The file is not an OBDLink Diagnostic Report or Drive Log.",
        warnings: [],
      };
    const kind: UploadKind = rec.kind === "failed" ? rec.upload : rec.kind;

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = db.findUploadBySha(sha256);
    if (existing)
      return {
        outcome: "refused",
        kind,
        uploadId: existing.id,
        reason: "This exact file is already uploaded.",
        warnings: [],
      };

    const uploadedAt = now().toISOString();
    return saveOriginal(dataDir, { kind, filename, bytes, uploadedAt }, (storedPath) =>
      db.transaction((): UploadResult => {
        const warnings: string[] = [];
        let vehicle: Vehicle | undefined;
        let created: Vehicle | undefined;
        let recordedAt: string | null = null;

        if (rec.kind === "report") {
          const h = rec.report.header;
          recordedAt = h.date;
          vehicle = db.getVehicleByVin(h.vin);
          if (!vehicle) {
            vehicle = created = addVehicleFor(h);
          } else if (
            db
              .listUploads({ kind: "report", vehicleId: vehicle.id })
              .some((r) => r.recordedAt === h.date)
          ) {
            warnings.push("A Report with this VIN and timestamp is already uploaded.");
          }
        } else if (kind === "drive-log") {
          // A failed Drive Log keeps the chosen Vehicle too.
          if (rec.kind === "drive-log") recordedAt = rec.startTime;
          vehicle = input.vehicleId === null ? undefined : db.getVehicle(input.vehicleId);
        }

        const upload = db.addUpload({
          kind,
          storedPath,
          uploadedFilename: filename,
          sha256,
          uploadedAt,
          recordedAt,
          vehicleId: vehicle?.id ?? null,
        });
        deriveStored(upload, bytes);

        if (rec.kind === "failed")
          return { outcome: "failed", kind, uploadId: upload.id, reason: rec.reason, warnings };

        if (kind === "report" && vehicle) rederiveChangedDefaults(vehicle.id);
        if (kind === "drive-log") warnings.push(...overlapWarnings(upload));

        const result: UploadResult = {
          outcome: warnings.length > 0 ? "warned" : "added",
          kind,
          uploadId: upload.id,
          warnings,
        };
        if (created && recordedAt) {
          const day = dayOf(recordedAt);
          result.vehicleCreated = {
            id: created.id,
            label: created.label,
            vin: created.vin,
            profile: created.profileId,
            packs: created.packIds,
            sameDayUnassigned: db
              .listUploads({ kind: "drive-log", vehicleId: null })
              .filter((u) => u.recordedAt !== null && dayOf(u.recordedAt) === day)
              .map((u) => ({
                uploadId: u.id,
                filename: u.uploadedFilename,
                recordedAt: u.recordedAt,
              })),
          };
        }
        return result;
      }),
    );
  }

  /**
   * Drops every derived row and rebuilds it from the Originals plus the owner data. Reports go first,
   * because Drive Logs read them as Reference Reports.
   */
  function rebuildDerived(): void {
    db.wipeDerived();
    const all = db.listUploads();
    db.transaction(() => {
      for (const u of reportsFirst(all)) deriveFromDisk(u);
    });
  }

  return {
    dataDir,
    ingest,
    rebuildDerived,
    rederiveUpload,
    rederiveUploads,
    rederiveStale,
    rederiveVehicleLogs,
    rederiveChangedDefaults,
  };
}

export type Ingest = ReturnType<typeof createIngest>;
