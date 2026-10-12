import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkDigit,
  FAKE_SERIAL,
  hasValidCheckDigit,
  ScrubError,
  scrubAnnotations,
  scrubCsv,
  scrubFiles,
  scrubReport,
} from "./scrub-fixture.ts";

// Synthetic VIN: made-up positions 1-8 and 10-17, check digit computed by checkDigit().
const BODY = "1ZZAB1CD0YA123456";
const VIN = BODY.slice(0, 8) + checkDigit(BODY) + BODY.slice(9);

const report = (vin: string, extra = "") =>
  `<html><body>\n<p>VIN: ${vin}</p>\n${extra}<table><tr><td>Vehicle Identification Number</td><td>${vin}</td></tr></table>\n</body></html>\n`;

describe("checkDigit", () => {
  it("matches the published NHTSA example (check digit X)", () => {
    expect(checkDigit("1M8GDM9AXKP042788")).toBe("X");
    expect(hasValidCheckDigit("1M8GDM9AXKP042788")).toBe(true);
    expect(hasValidCheckDigit("1M8GDM9A1KP042788")).toBe(false);
  });
});

describe("scrubReport", () => {
  it("replaces the VIN in the header and the Mode $09 row, with a valid check digit", () => {
    const out = scrubReport(report(VIN));
    expect(out).not.toContain(VIN);
    const vins = out.match(/[A-Z0-9]{17}/g) ?? [];
    expect(vins).toHaveLength(2);
    expect(vins[0]).toBe(vins[1]);
    const v = vins[0] as string;
    expect(v.slice(0, 8)).toBe(VIN.slice(0, 8));
    expect(v.slice(9, 11)).toBe(VIN.slice(9, 11));
    expect(v.slice(11)).toBe(FAKE_SERIAL);
    expect(hasValidCheckDigit(v)).toBe(true);
  });

  it("leaves every other byte unchanged", () => {
    const input = report(VIN, "<p>Odd é text\r\n  &amp; stuff</p>\r\n");
    const out = scrubReport(input);
    expect(out.length).toBe(input.length);
    expect(out.replaceAll(/[A-Z0-9]{17}/g, "V")).toBe(input.replaceAll(VIN, "V"));
  });

  it("fails when a VIN-shaped string sits in an unexpected place", () => {
    expect(() => scrubReport(report(VIN, `<!-- ${VIN} -->\n`))).toThrow(ScrubError);
  });

  it("fails when no VIN is found in the expected places", () => {
    expect(() => scrubReport("<html>nothing</html>")).toThrow(ScrubError);
  });
});

describe("scrubCsv", () => {
  it("accepts the Ford PID label that mentions a VIN position", () => {
    const csv = "Time,Ford PID (third VIN position is T)\n1,2\n";
    expect(scrubCsv(csv)).toBe(csv);
  });

  it("rejects a VIN-shaped string", () => {
    expect(() => scrubCsv(`Time,Note\n1,${VIN}\n`)).toThrow(ScrubError);
  });
});

describe("scrubAnnotations", () => {
  it("drops prose fields and keeps times, titles and numbers", () => {
    const input = {
      events: [
        { t0: 1.5, t1: 9, title: "Hard pull", note: "rough", subtitle: "s", text: "t", rpm: 2100 },
      ],
      text: "top",
    };
    expect(JSON.parse(scrubAnnotations(JSON.stringify(input)))).toEqual({
      events: [{ t0: 1.5, t1: 9, title: "Hard pull", rpm: 2100 }],
    });
  });
});

describe("scrubFiles", () => {
  let dir: string;
  let out: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scrub-"));
    out = join(dir, "out");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const put = (name: string, body: string) => {
    const p = join(dir, name);
    writeFileSync(p, body);
    return p;
  };

  it("writes scrubbed files under their exported names", () => {
    const files = [
      put("Diagnostic Report.html", report(VIN)),
      put("log.csv", "a,b\n1,2\n"),
      put("events.json", JSON.stringify([{ t0: 1, title: "x", note: "n" }])),
    ];
    scrubFiles(files, out, []);
    expect(readdirSync(out).sort()).toEqual(["Diagnostic Report.html", "events.json", "log.csv"]);
    expect(readFileSync(join(out, "log.csv"), "utf8")).toBe("a,b\n1,2\n");
  });

  it("writes nothing and names the file and field when a denied word is in a title", () => {
    const files = [
      put("log.csv", "a\n1\n"),
      put("events.json", JSON.stringify([{ t0: 1, title: "Trip to Springfield" }])),
    ];
    let error: unknown;
    try {
      scrubFiles(files, out, ["springfield"]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ScrubError);
    expect((error as Error).message).toContain("events.json");
    expect((error as Error).message).toContain("[0].title");
    expect(() => readdirSync(out)).toThrow();
  });

  it("applies the deny list to HTML and CSV output", () => {
    expect(() => scrubFiles([put("log.csv", "Springfield\n")], out, ["SPRINGFIELD"])).toThrow(
      /log\.csv/,
    );
  });

  it("rejects an unknown file type", () => {
    expect(() => scrubFiles([put("a.txt", "x")], out, [])).toThrow(ScrubError);
  });
});

describe("CLI", () => {
  it("exits non-zero on a denied word and prints usage for --help", () => {
    const dir = mkdtempSync(join(tmpdir(), "scrub-cli-"));
    try {
      const input = join(dir, "e.json");
      writeFileSync(input, JSON.stringify([{ t0: 1, title: "Secretville" }]));
      const script = join(import.meta.dirname, "scrub-fixture.ts");
      expect(() =>
        execFileSync(
          process.execPath,
          [script, "--out", join(dir, "o"), "--deny", "secretville", input],
          { stdio: "pipe" },
        ),
      ).toThrow();
      const help = execFileSync(process.execPath, [script, "--help"], { encoding: "utf8" });
      expect(help).toContain("--deny");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe(".gitignore", () => {
  it("does not ignore report fixtures under test/fixtures", () => {
    const root = join(import.meta.dirname, "..");
    const ignored = (p: string) => {
      try {
        execFileSync("git", ["check-ignore", "-q", p], { cwd: root, stdio: "pipe" });
        return true;
      } catch {
        return false;
      }
    };
    expect(ignored("test/fixtures/x.html")).toBe(false);
    expect(ignored("test/fixtures/Diagnostic Report x.html")).toBe(false);
    expect(ignored("Diagnostic Report x.html")).toBe(true);
  });
});
