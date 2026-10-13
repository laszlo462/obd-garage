import { describe, expect, it } from "vitest";
import {
  defaultVehicle,
  orderBatch,
  resultLine,
  runBatch,
  type Sniffed,
  sniff,
  type UploadResult,
} from "./upload-batch.ts";

const file = (name: string) => new File(["x"], name);

describe("orderBatch", () => {
  it("puts Report-like files first and keeps the picked order within each group", async () => {
    const files = [file("log1.csv"), file("r1.html"), file("log2.csv"), file("r2.html")];
    const sniff = async (f: File): Promise<Sniffed> =>
      f.name.endsWith(".html") ? "report" : "log";
    const ordered = await orderBatch(files, sniff);
    expect(ordered.map((f) => f.name)).toEqual(["r1.html", "r2.html", "log1.csv", "log2.csv"]);
  });
});

describe("sniff", () => {
  it("reads HTML as Report-like and anything else as a log", async () => {
    expect(await sniff(new File(["<!DOCTYPE html><html><body>"], "a.html"))).toBe("report");
    expect(await sniff(new File(["  \n<html lang=en>"], "a.htm"))).toBe("report");
    expect(await sniff(new File(["Time,RPM\n0,800\n"], "a.csv"))).toBe("log");
    expect(await sniff(new File([""], "empty"))).toBe("log");
  });
});

describe("defaultVehicle", () => {
  it("picks the first Vehicle created in the batch, else the Current Vehicle", () => {
    expect(defaultVehicle([7, 9], 3)).toBe(7);
    expect(defaultVehicle([], 3)).toBe(3);
    expect(defaultVehicle([], null)).toBeNull();
  });
});

const result = (over: Partial<UploadResult> = {}): UploadResult => ({
  outcome: "added",
  kind: "drive-log",
  warnings: [],
  ...over,
});

describe("resultLine", () => {
  it("reads an added file as a green tick", () => {
    expect(resultLine(result())).toMatchObject({ icon: "check", tone: "ok", word: "Added" });
  });

  it("reads a warned file as amber, with the warnings as its reason", () => {
    expect(resultLine(result({ outcome: "warned", warnings: ["Overlap.", "Gap."] }))).toMatchObject(
      {
        icon: "alert",
        tone: "warn",
        word: "Added with warning",
        reason: "Overlap. Gap.",
      },
    );
  });

  it("reads a failed file as red and links to Failed Uploads", () => {
    expect(resultLine(result({ outcome: "failed", reason: "No data rows." }))).toMatchObject({
      icon: "cross",
      tone: "bad",
      word: "Failed",
      reason: "No data rows.",
      link: { href: "/failed-uploads", label: "Failed Uploads" },
    });
  });

  it("reads a file the browser never got an answer for as red 'Not uploaded', with no link", () => {
    const line = resultLine({ outcome: "not-sent", reason: "Failed to fetch." });
    expect(line).toEqual({
      icon: "cross",
      tone: "bad",
      word: "Not uploaded",
      reason: "Failed to fetch.",
    });
  });

  it("reads a refused file as muted, with no link", () => {
    const line = resultLine(
      result({ outcome: "refused", kind: "unknown", reason: "Not a report." }),
    );
    expect(line).toMatchObject({
      icon: "dash",
      tone: "muted",
      word: "Refused",
      reason: "Not a report.",
    });
    expect(line.link).toBeUndefined();
  });

  it("reads a refused file with an uploadId as already added, linking to its viewer", () => {
    expect(resultLine(result({ outcome: "refused", kind: "report", uploadId: 12 }))).toMatchObject({
      word: "Already added",
      link: { href: "/reports/12", label: "Open" },
    });
    expect(
      resultLine(result({ outcome: "refused", kind: "drive-log", uploadId: 5 })).link?.href,
    ).toBe("/drive-logs/5");
  });
});

const html = (name: string) => new File(["<html>"], name);
const csv = (name: string) => new File(["a,b\n1,2\n"], name);

type Call = { name: string; vehicle: number | "unassigned" };

/** A fake `upload` that records its calls and answers from a map of results by filename. */
function harness(
  answers: Record<string, UploadResult | Error> = {},
  opts: {
    vehicleCount?: number;
    currentVehicleId?: number | null;
    ask?: number | "unassigned";
  } = {},
) {
  const calls: Call[] = [];
  const asked: { defaultId: number | null; newIds: number[]; logCount: number }[] = [];
  const progress: [number, number, string][] = [];
  const deps = {
    vehicleCount: opts.vehicleCount ?? 1,
    currentVehicleId: opts.currentVehicleId ?? 1,
    upload: async (f: File, vehicle: number | "unassigned") => {
      calls.push({ name: f.name, vehicle });
      const answer = answers[f.name] ?? result();
      if (answer instanceof Error) throw answer;
      return answer;
    },
    askVehicle: async (defaultId: number | null, newIds: number[], logCount: number) => {
      asked.push({ defaultId, newIds, logCount });
      return opts.ask ?? "unassigned";
    },
    onProgress: (i: number, n: number, name: string) => void progress.push([i, n, name]),
  };
  return { deps, calls, asked, progress };
}

describe("runBatch", () => {
  it("uploads every Report to unassigned before any Drive Log", async () => {
    const h = harness();
    await runBatch([csv("l1.csv"), html("r1.html"), csv("l2.csv"), html("r2.html")], h.deps);
    expect(h.calls.map((c) => c.name)).toEqual(["r1.html", "r2.html", "l1.csv", "l2.csv"]);
    expect(h.calls.slice(0, 2).map((c) => c.vehicle)).toEqual(["unassigned", "unassigned"]);
  });
});

const withNewVehicle = (id: number): UploadResult =>
  result({
    kind: "report",
    vehicleCreated: {
      id,
      label: "2012 Ford F-250",
      vin: "TEST-VIN-00001234",
      profile: "generic",
      packs: [],
      sameDayUnassigned: [],
    },
  });

describe("runBatch: the Vehicle question", () => {
  it("asks once for the whole batch, defaulting to a Vehicle new in it, and sends every log there", async () => {
    const h = harness({ "r.html": withNewVehicle(8) }, { currentVehicleId: 3, ask: 8 });
    await runBatch([csv("l1.csv"), html("r.html"), csv("l2.csv")], h.deps);
    expect(h.asked).toEqual([{ defaultId: 8, newIds: [8], logCount: 2 }]);
    expect(h.calls.filter((c) => c.name.endsWith(".csv")).map((c) => c.vehicle)).toEqual([8, 8]);
  });

  it("defaults to the Current Vehicle when the batch created none", async () => {
    const h = harness({}, { currentVehicleId: 3, ask: "unassigned" });
    await runBatch([csv("l1.csv")], h.deps);
    expect(h.asked).toEqual([{ defaultId: 3, newIds: [], logCount: 1 }]);
    expect(h.calls[0]?.vehicle).toBe("unassigned");
  });

  it("does not ask when the batch has no Drive Logs", async () => {
    const h = harness();
    await runBatch([html("r.html")], h.deps);
    expect(h.asked).toEqual([]);
  });

  it("skips the question with no Vehicles and uploads the logs to unassigned", async () => {
    const h = harness({}, { vehicleCount: 0, currentVehicleId: null, ask: 5 });
    await runBatch([csv("l1.csv")], h.deps);
    expect(h.asked).toEqual([]);
    expect(h.calls[0]?.vehicle).toBe("unassigned");
  });

  it("counts a Vehicle created by the batch, so logs after a first Report still get asked", async () => {
    const h = harness({ "r.html": withNewVehicle(8) }, { vehicleCount: 0, currentVehicleId: null });
    await runBatch([html("r.html"), csv("l.csv")], h.deps);
    expect(h.asked).toEqual([{ defaultId: 8, newIds: [8], logCount: 1 }]);
  });
});

describe("runBatch: results", () => {
  it("turns a thrown upload into a not-sent line with the error's message and carries on", async () => {
    const h = harness({ "a.csv": new Error("The server answered 500.") });
    const out = await runBatch([csv("a.csv"), csv("b.csv")], h.deps);
    expect(h.calls.map((c) => c.name)).toEqual(["a.csv", "b.csv"]);
    expect(out.results[0]).toMatchObject({
      name: "a.csv",
      result: { outcome: "not-sent", reason: "The server answered 500." },
    });
    expect(out.results[1]?.result.outcome).toBe("added");
  });

  it("keeps a server failed outcome as it is and carries on", async () => {
    const failed = result({ outcome: "failed", reason: "No data rows." });
    const h = harness({ "a.csv": failed });
    const out = await runBatch([csv("a.csv"), csv("b.csv")], h.deps);
    expect(out.results[0]).toEqual({ name: "a.csv", result: failed });
    expect(h.calls).toHaveLength(2);
  });

  it("reports progress once per file, in upload order, 1-based", async () => {
    const h = harness();
    await runBatch([csv("l.csv"), html("r.html")], h.deps);
    expect(h.progress).toEqual([
      [1, 2, "r.html"],
      [2, 2, "l.csv"],
    ]);
  });

  it("returns the Vehicles the batch created beside the results", async () => {
    const h = harness({ "a.html": withNewVehicle(8), "b.html": withNewVehicle(9) });
    const out = await runBatch([html("a.html"), html("b.html"), html("c.html")], h.deps);
    expect(out.results).toHaveLength(3);
    expect(out.newVehicles.map((v) => v.id)).toEqual([8, 9]);
  });
});
