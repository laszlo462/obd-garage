import type { InferResponseType } from "hono/client";
import type { Api } from "./api.tsx";

/** What `POST /api/uploads` answers, taken from the real client type. */
export type UploadResult = InferResponseType<Api["api"]["uploads"]["$post"], 200>;

/**
 * A file the browser never got a 200 for (network down, unreadable file, a non-200 answer).
 * It is not on the server's Failed Uploads screen, so it has its own outcome and no link.
 */
export type NotSent = { outcome: "not-sent"; reason: string };

/** A cheap guess at what a picked file is. The server still decides the kind. */
export type Sniffed = "report" | "log";

/** Reports go first, then Drive Logs; the picked order is kept in each group. Never drops a file. */
export async function orderBatch(
  files: readonly File[],
  sniff: (file: File) => Promise<Sniffed>,
): Promise<File[]> {
  const kinds = await Promise.all(files.map(sniff));
  return [
    ...files.filter((_, i) => kinds[i] === "report"),
    ...files.filter((_, i) => kinds[i] !== "report"),
  ];
}

const HTML_START = /^\s*<(?:!doctype\s+html|html)\b/i;

/** Reads the first few hundred bytes. HTML counts as Report-like; everything else counts as a log. */
export async function sniff(file: File): Promise<Sniffed> {
  const head = await file.slice(0, 512).text();
  return HTML_START.test(head) ? "report" : "log";
}

/** The Vehicle the question starts on. */
export const defaultVehicle = (newIds: readonly number[], currentId: number | null) =>
  newIds[0] ?? currentId;

export type LineIcon = "check" | "alert" | "cross" | "dash";
export type LineTone = "ok" | "warn" | "bad" | "muted";

/** One row of the Batch result sheet, minus the filename. */
export type ResultLine = {
  icon: LineIcon;
  tone: LineTone;
  word: string;
  reason: string;
  link?: { href: string; label: string };
};

/** Maps an upload result to the DESIGN.md Batch result row. */
export function resultLine(result: UploadResult | NotSent): ResultLine {
  if (result.outcome === "not-sent")
    return { icon: "cross", tone: "bad", word: "Not uploaded", reason: result.reason };
  const reason = result.reason ?? result.warnings.join(" ");
  switch (result.outcome) {
    case "added":
      return { icon: "check", tone: "ok", word: "Added", reason };
    case "warned":
      return { icon: "alert", tone: "warn", word: "Added with warning", reason };
    case "failed":
      return {
        icon: "cross",
        tone: "bad",
        word: "Failed",
        reason,
        link: { href: "/failed-uploads", label: "Failed Uploads" },
      };
    case "refused": {
      if (result.uploadId === undefined)
        return { icon: "dash", tone: "muted", word: "Refused", reason };
      const folder = result.kind === "report" ? "reports" : "drive-logs";
      return {
        icon: "dash",
        tone: "muted",
        word: "Already added",
        reason,
        link: { href: `/${folder}/${result.uploadId}`, label: "Open" },
      };
    }
  }
}

export type VehicleChoice = number | "unassigned";
export type FileResult = { name: string; result: UploadResult | NotSent };

export type BatchDeps = {
  /** Vehicles that exist when the batch starts. */
  vehicleCount: number;
  currentVehicleId: number | null;
  upload: (file: File, vehicle: VehicleChoice) => Promise<UploadResult>;
  /** The one Vehicle question of the batch. */
  askVehicle: (
    defaultId: number | null,
    newIds: number[],
    logCount: number,
  ) => Promise<VehicleChoice>;
  onProgress: (index: number, total: number, name: string) => void;
  sniff?: (file: File) => Promise<Sniffed>;
};

type VehicleCreated = NonNullable<UploadResult["vehicleCreated"]>;

/**
 * Uploads Reports first, then Drive Logs.
 * Logs go to the Vehicle the one question picks; with no Vehicles they go to Unassigned unasked.
 */
export async function runBatch(files: readonly File[], deps: BatchDeps) {
  const guess = deps.sniff ?? sniff;
  const kinds = new Map<File, Sniffed>();
  for (const file of files) kinds.set(file, await guess(file));
  const ordered = await orderBatch(files, async (f) => kinds.get(f) ?? "log");
  const results: FileResult[] = [];
  const newVehicles: VehicleCreated[] = [];
  let logVehicle: VehicleChoice = "unassigned";
  let asked = false;

  for (const [i, file] of ordered.entries()) {
    const isLog = kinds.get(file) !== "report";
    if (isLog && !asked) {
      asked = true;
      if (deps.vehicleCount + newVehicles.length > 0) {
        const newIds = newVehicles.map((v) => v.id);
        const logCount = ordered.length - i;
        logVehicle = await deps.askVehicle(
          defaultVehicle(newIds, deps.currentVehicleId),
          newIds,
          logCount,
        );
      }
    }
    deps.onProgress(i + 1, ordered.length, file.name);
    const result = await deps.upload(file, isLog ? logVehicle : "unassigned").catch(
      (error: unknown): NotSent => ({
        outcome: "not-sent",
        reason: error instanceof Error ? error.message : "The upload failed.",
      }),
    );
    if (result.outcome !== "not-sent" && result.vehicleCreated)
      newVehicles.push(result.vehicleCreated);
    results.push({ name: file.name, result });
  }
  return { results, newVehicles };
}
