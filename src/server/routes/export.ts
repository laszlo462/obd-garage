import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { Zip, ZipDeflate } from "fflate";
import { type Context, Hono } from "hono";
import type { Db, Upload, Vehicle } from "../db.ts";
import { originalPath, withSuffix } from "../originals.ts";
import type { ProfileRegistry } from "../registry.ts";
import { snap } from "./notes.ts";

/** An uploaded name made safe as one Bundle entry name: no separators, `.`/`..` segments. */
function safeName(name: string): string {
  const safe = name
    .replace(/\p{Cc}/gu, "")
    .split(/[/\\]/)
    .filter((part) => part !== "" && part !== "." && part !== "..")
    .join("_");
  return safe === "" ? "upload" : safe;
}

/** Sidecars written beside each kind of Original. */
const LOG_SIDECARS = [".events.json", ".notes.json", ".channels.csv"];
const REPORT_SIDECARS = [".notes.json"];

/**
 * The first free name in the Bundle (`-2`, `-3`, … on a clash). The Original and all its sidecars are
 * reserved together, so no two entries can share a name.
 */
function freeName(used: Set<string>, name: string, sidecars: string[]): string {
  const all = (base: string) => [base, ...sidecars.map((s) => `${base}${s}`)];
  let n = 1;
  while (all(withSuffix(name, n)).some((entry) => used.has(entry))) n++;
  const free = withSuffix(name, n);
  for (const entry of all(free)) used.add(entry);
  return free;
}

const text = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

const cell = (value: string | number | null) => {
  const out = value === null ? "" : String(value);
  return /[",\r\n]/.test(out) ? `"${out.replaceAll('"', '""')}"` : out;
};

type ChannelsBlob = {
  t: number[];
  channels: Record<string, { label: string; unit?: string; values: (number | null)[] }>;
};

/** The Channels the app charts, as CSV: Time (sec) then one column per Channel. */
function channelsCsv(blob: ChannelsBlob): string {
  const cols = Object.values(blob.channels);
  const lines = [
    ["Time (sec)", ...cols.map((ch) => (ch.unit ? `${ch.label} (${ch.unit})` : ch.label))],
    ...blob.t.map((sec, i) => [sec, ...cols.map((ch) => ch.values[i] ?? null)]),
  ];
  return `${lines.map((row) => row.map(cell).join(",")).join("\n")}\n`;
}

type Plan = {
  from: string;
  to: string;
  logs: Upload[];
  /** Reports recorded in the range (Vehicle scope only). */
  reports: Upload[];
} & ({ scope: "vehicle"; vehicle: Vehicle } | { scope: "unassigned" });

/** A real calendar day as YYYY-MM-DD. */
const isDay = (text: string | undefined): text is string =>
  text !== undefined &&
  /^\d{4}-\d{2}-\d{2}$/.test(text) &&
  new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;

const dayOf = (naive: string | null) => naive?.slice(0, 10) ?? "";
const chronological = (a: Upload, b: Upload) =>
  (a.recordedAt ?? "").localeCompare(b.recordedAt ?? "") || a.id - b.id;

/** Export: streams a Bundle as a zip. */
export function exportRoute(deps: {
  db: Db;
  dataDir: string;
  registry: ProfileRegistry;
  appVersion: string;
  now: () => Date;
}) {
  const { db, dataDir, registry, appVersion, now } = deps;

  /** The Reference Report a Drive Log points at, if it still exists. */
  function referenceOf(log: Upload): Upload | undefined {
    const refId = (db.getDerived(log.id)?.metadata as { referenceReportId?: number | null })
      ?.referenceReportId;
    return refId == null ? undefined : db.getUpload(refId);
  }

  /** Every Report the zip holds: those recorded in the range, plus the Reference Reports of its Drive Logs. */
  function planReports(plan: Plan): Map<number, Upload> {
    const reports = new Map<number, Upload>(plan.reports.map((r) => [r.id, r]));
    for (const log of plan.logs) {
      const ref = referenceOf(log);
      if (ref) reports.set(ref.id, ref);
    }
    return reports;
  }

  function bundle(plan: Plan) {
    const { from, to } = plan;
    const files: Record<string, Uint8Array> = {};
    /** Originals are streamed from disk, hashed on the way; the manifest is written once they are. */
    const originals: { path: string; storedPath: string; entry: { sha256: string } }[] = [];
    const usedNames = new Set<string>();
    const referenced = planReports(plan);
    const timeline: { at: string; line: string; notes: string[] }[] = [];
    const noteTexts = (id: number) => db.listNotes(id).map((n) => n.text);
    const driveLogs = [...plan.logs].sort(chronological).map((log) => {
      const file = freeName(
        usedNames,
        `drive-logs/${safeName(log.uploadedFilename)}`,
        LOG_SIDECARS,
      );
      files[`${file}.events.json`] = text(
        (db.getDerived(log.id)?.events ?? []).map((e) => ({
          ruleId: e.ruleId,
          startSec: e.startSec,
          endSec: e.endSec,
          ...(e.data as object),
        })),
      );
      const channels = db.getDerived(log.id)?.channels;
      const blob = channels
        ? (JSON.parse(new TextDecoder().decode(channels)) as ChannelsBlob)
        : undefined;
      const rows = blob?.t ?? [];
      if (blob && plan.scope === "vehicle")
        files[`${file}.channels.csv`] = new TextEncoder().encode(channelsCsv(blob));
      files[`${file}.notes.json`] = text(
        db.listNotes(log.id).map((n) => {
          const sec = n.pinnedTimeSec === null ? null : snap(rows, n.pinnedTimeSec);
          return {
            text: n.text,
            createdAt: n.createdAt,
            pinned:
              sec === null || !log.recordedAt
                ? null
                : {
                    rowIndex: rows.indexOf(sec),
                    rawTimeSec: n.pinnedTimeSec,
                    elapsedSec: sec,
                    wallClock: new Date(Date.parse(`${log.recordedAt}Z`) + sec * 1000)
                      .toISOString()
                      .slice(0, 23),
                  },
          };
        }),
      );
      timeline.push({
        at: log.recordedAt ?? "",
        line: `Drive Log ${file}, ${db.getDerived(log.id)?.events.length ?? 0} Events`,
        notes: noteTexts(log.id),
      });
      const ref = referenceOf(log);
      const entry = {
        file,
        originalFilename: log.uploadedFilename,
        sha256: "",
        uploadedAt: log.uploadedAt,
        recordedAt: log.recordedAt,
        refId: ref?.id ?? null,
      };
      originals.push({ path: file, storedPath: log.storedPath, entry });
      return entry;
    });
    const referenceOnly: { line: string; notes: string[] }[] = [];
    const reportFiles = new Map<number, string>();
    const reports = [...referenced.values()].sort(chronological).map((report) => {
      const file = freeName(
        usedNames,
        `reports/${safeName(report.uploadedFilename)}`,
        REPORT_SIDECARS,
      );
      reportFiles.set(report.id, file);
      files[`${file}.notes.json`] = text(
        db
          .listNotes(report.id)
          .map((n) => ({ text: n.text, createdAt: n.createdAt, pinned: null })),
      );
      const inRange = dayOf(report.recordedAt) >= from && dayOf(report.recordedAt) <= to;
      if (inRange)
        timeline.push({
          at: report.recordedAt ?? "",
          line: `Diagnostic Report ${file}`,
          notes: noteTexts(report.id),
        });
      else
        referenceOnly.push({
          line: `Diagnostic Report ${file} (${report.recordedAt})`,
          notes: noteTexts(report.id),
        });
      const entry = {
        file,
        originalFilename: report.uploadedFilename,
        sha256: "",
        uploadedAt: report.uploadedAt,
        recordedAt: report.recordedAt,
        inRange,
      };
      originals.push({ path: file, storedPath: report.storedPath, entry });
      return entry;
    });
    const finish = () => {
      files["manifest.json"] = text({
        scope: plan.scope,
        ...(plan.scope === "vehicle"
          ? {
              vehicle: {
                vin: plan.vehicle.vin,
                label: plan.vehicle.label,
                profile:
                  registry.profiles().find((p) => p.id === plan.vehicle.profileId)?.name ?? null,
                packs: plan.vehicle.packIds.map(
                  (id) =>
                    `${registry.packs().find((p) => p.id === id)?.name ?? id} @ ${appVersion}`,
                ),
              },
            }
          : {}),
        appVersion,
        exportedAt: now().toISOString(),
        range: { from, to },
        driveLogs: driveLogs.map(({ refId, ...log }) => ({
          ...log,
          referenceReport: refId === null ? null : (reportFiles.get(refId) ?? null),
        })),
        ...(plan.scope === "vehicle" ? { reports } : {}),
      });
      // Note text is untrusted: every line goes in a blockquote, so it cannot start a heading or list item.
      const quote = (note: string) =>
        note
          .split(/\r?\n/)
          .map((line) => `  > ${line}`.trimEnd())
          .join("\n");
      const bullet = (e: { line: string; notes: string[] }) =>
        [`- ${e.line}`, ...e.notes.map(quote)].join("\n");
      files["README.md"] = new TextEncoder().encode(
        [
          "# OBD Garage Bundle",
          "",
          ...(plan.scope === "vehicle"
            ? [`This Bundle contains the VIN (${plan.vehicle.vin}) of ${plan.vehicle.label}.`]
            : [
                "These Drive Logs are Unassigned: no Vehicle Profile was applied, so Channel names and values are raw.",
              ]),
          `Events are as of the export time (${now().toISOString()}).`,
          "",
          "## Timeline",
          "",
          ...timeline
            .sort((a, b) => a.at.localeCompare(b.at))
            .map((e) => bullet({ ...e, line: `${e.at.replace("T", " ")} ${e.line}` })),
          ...(plan.scope === "vehicle"
            ? ["", "## Reference-only Reports", "", ...referenceOnly.map(bullet)]
            : []),
          "",
        ]
          .join("\n")
          .trimEnd()
          .concat("\n"),
      );
    };
    const who = plan.scope === "vehicle" ? plan.vehicle.vin : "unassigned";
    return {
      name: `obd-garage_${who}_${from}_${to}.zip`,
      chunks: async function* () {
        const zip = new Zip();
        const queue: Uint8Array[] = [];
        let failure: Error | undefined;
        zip.ondata = (err, chunk) => {
          if (err) failure = err;
          else queue.push(chunk);
        };
        const drain = function* () {
          if (failure) throw failure;
          while (queue.length > 0) yield queue.shift() as Uint8Array;
        };
        const add = (path: string) => {
          const entry = new ZipDeflate(path);
          zip.add(entry);
          return entry;
        };
        for (const { path, storedPath, entry } of originals) {
          const file = add(path);
          const hash = createHash("sha256");
          for await (const chunk of createReadStream(originalPath(dataDir, storedPath))) {
            hash.update(chunk as Buffer);
            file.push(chunk as Buffer, false);
            yield* drain();
          }
          file.push(new Uint8Array(0), true);
          entry.sha256 = hash.digest("hex");
          yield* drain();
        }
        finish();
        for (const [path, bytes] of Object.entries(files)) {
          add(path).push(bytes, true);
          yield* drain();
        }
        zip.end();
        yield* drain();
      },
    };
  }

  /** The uploaded names of the plan's Originals that are not on disk. */
  const missingOf = (plan: Plan) =>
    [...plan.logs, ...planReports(plan).values()]
      .filter((u) => !existsSync(originalPath(dataDir, u.storedPath)))
      .map((u) => u.uploadedFilename);

  const respond = (c: Context, plan: Plan) => {
    // Check every Original first: once streaming starts, a missing file could only abort the download.
    const [missing] = missingOf(plan);
    if (missing !== undefined)
      return c.json({ error: `An Original is missing on disk: ${missing}` }, 409);
    const { name, chunks } = bundle(plan);
    const source = chunks();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await source.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      cancel: () => void source.return(undefined),
    });
    return c.body(body, 200, {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name}"`,
    });
  };

  /**
   * The Vehicle-scope plan for `?vehicle=&from=&to=`, or the status and message for a bad query. It
   * answers with data, not a `Response`, so each route's typed client response stays precise.
   */
  function vehiclePlan(
    c: Context,
  ): { plan: Extract<Plan, { scope: "vehicle" }> } | { status: 400 | 404; error: string } {
    const vehicleText = c.req.query("vehicle");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!/^\d+$/.test(vehicleText ?? "") || !isDay(from) || !isDay(to) || from > to)
      return { status: 400, error: "Expected ?vehicle=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD." };
    const vehicle = db.getVehicle(Number(vehicleText));
    if (!vehicle) return { status: 404, error: "Unknown vehicle." };
    const inRange = (u: Upload) => dayOf(u.recordedAt) >= from && dayOf(u.recordedAt) <= to;
    const logs = db.listUploads({ kind: "drive-log", vehicleId: vehicle.id }).filter(inRange);
    const reports = db.listUploads({ kind: "report", vehicleId: vehicle.id }).filter(inRange);
    return { plan: { scope: "vehicle", vehicle, from, to, logs, reports } };
  }

  return new Hono()
    .get("/", (c) => {
      const parsed = vehiclePlan(c);
      if ("error" in parsed) return c.json({ error: parsed.error }, parsed.status);
      const { plan } = parsed;
      if (plan.logs.length === 0 && plan.reports.length === 0)
        return c.json({ error: "Nothing in this range" }, 422);
      return respond(c, plan);
    })
    .get("/summary", (c) => {
      const parsed = vehiclePlan(c);
      if ("error" in parsed) return c.json({ error: parsed.error }, parsed.status);
      const { plan } = parsed;
      const reports = [...planReports(plan).values()];
      const inRange = reports.filter((r) => plan.reports.some((p) => p.id === r.id)).length;
      const days = [
        ...db.listUploads({ kind: "drive-log", vehicleId: plan.vehicle.id }),
        ...db.listUploads({ kind: "report", vehicleId: plan.vehicle.id }),
      ]
        .map((u) => dayOf(u.recordedAt))
        .filter((day) => day !== "")
        .sort();
      return c.json({
        driveLogs: plan.logs.length,
        reports: inRange,
        referenceOnly: reports.length - inRange,
        firstDay: days[0] ?? null,
        lastDay: days[days.length - 1] ?? null,
        missing: missingOf(plan),
      });
    })
    .post("/unassigned", async (c) => {
      // A plain form submit sends repeated `logIds` fields, so the page need not fetch the zip.
      const isForm = c.req.header("content-type")?.startsWith("application/x-www-form-urlencoded");
      const ids = isForm
        ? ((await c.req.formData().catch(() => null))?.getAll("logIds") ?? []).map((id) =>
            typeof id === "string" && /^\d+$/.test(id) ? Number(id) : Number.NaN,
          )
        : ((await c.req.json().catch(() => null)) as { logIds?: unknown } | null)?.logIds;
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id)))
        return c.json({ error: "Expected { logIds: number[] } with at least one id." }, 400);
      const uploads = [...new Set(ids as number[])].map((id) => db.getUpload(id));
      const logs = uploads.flatMap((u) => (u?.kind === "drive-log" ? u : []));
      if (logs.length !== uploads.length) return c.json({ error: "Unknown Drive Log." }, 404);
      if (logs.some((l) => l.vehicleId !== null))
        return c.json({ error: "Only Unassigned Drive Logs can be exported this way." }, 409);
      const days = logs.map((l) => dayOf(l.recordedAt)).sort();
      return respond(c, {
        scope: "unassigned",
        from: days[0] ?? "",
        to: days[days.length - 1] ?? "",
        logs,
        reports: [],
      });
    });
}
