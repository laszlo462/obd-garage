import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CaseRun,
  caseRun,
  changedLines,
  checkSlice,
  isProductionPath,
  isTestFile,
  judge,
  parseChanges,
  uncoveredLines,
} from "./check-slice.ts";

const ROOT = "C:/repo";

describe("caseRun", () => {
  it("turns Vitest JSON into per-case results keyed by relative file and full name", () => {
    const json = {
      testResults: [
        {
          name: "C:/repo/src/a.test.ts",
          status: "failed",
          message: "",
          assertionResults: [
            { ancestorTitles: ["A", "inner"], title: "works", status: "passed" },
            { ancestorTitles: [], title: "breaks", status: "failed" },
          ],
        },
      ],
    };
    expect(caseRun(json, ROOT)).toEqual({
      cases: [
        { key: "src/a.test.ts > A > inner > works", status: "passed" },
        { key: "src/a.test.ts > breaks", status: "failed" },
      ],
      brokenFiles: [],
    });
  });

  it("reports a file that failed to load, and copes with Windows separators", () => {
    const json = {
      testResults: [
        {
          name: "C:\\repo\\src\\b.test.ts",
          status: "failed",
          message: "Failed to load url ./new.ts",
          assertionResults: [],
        },
      ],
    };
    expect(caseRun(json, "C:\\repo")).toEqual({ cases: [], brokenFiles: ["src/b.test.ts"] });
  });
});

describe("uncoveredLines", () => {
  const loc = (line: number) => ({ start: { line, column: 0 }, end: { line, column: 9 } });
  const cov = {
    statementMap: { "0": loc(2), "1": loc(3), "2": loc(7) },
    s: { "0": 1, "1": 0, "2": 0 },
    fnMap: { "0": { name: "f", decl: loc(5), loc: loc(5), line: 5 } },
    f: { "0": 0 },
  };

  it("lists changed lines where an unrun statement or function starts", () => {
    expect(uncoveredLines(cov, new Set([2, 3, 4, 5]))).toEqual([3, 5]);
  });

  it("ignores unrun code outside the changed lines", () => {
    expect(uncoveredLines(cov, new Set([2]))).toEqual([]);
  });
});

describe("judge", () => {
  const run = (cases: CaseRun["cases"], brokenFiles: string[] = []): CaseRun => ({
    cases,
    brokenFiles,
  });

  it("passes when each new test fails on the base and passes on the change", () => {
    const verdict = judge({
      newKeys: ["t > new"],
      base: run([
        { key: "t > old", status: "passed" },
        { key: "t > new", status: "failed" },
      ]),
      change: run([
        { key: "t > old", status: "passed" },
        { key: "t > new", status: "passed" },
      ]),
      uncovered: [],
    });
    expect(verdict.findings).toEqual([]);
    expect(verdict.exitCode).toBe(0);
  });

  it("counts a new test missing from a base file that failed to load as failing there", () => {
    const verdict = judge({
      newKeys: ["t > new"],
      base: run([], ["t"]),
      change: run([{ key: "t > new", status: "passed" }]),
      uncovered: [],
    });
    expect(verdict.exitCode).toBe(0);
    expect(verdict.report).toContain("t: failed to load on the base");
  });

  it("flags a new test that already passes on the base", () => {
    const verdict = judge({
      newKeys: ["t > new"],
      base: run([{ key: "t > new", status: "passed" }]),
      change: run([{ key: "t > new", status: "passed" }]),
      uncovered: [],
    });
    expect(verdict.findings).toEqual(["Passes without the change: t > new"]);
    expect(verdict.exitCode).toBe(1);
  });

  it("flags any test that fails on the change, and a test file that fails to load there", () => {
    const verdict = judge({
      newKeys: [],
      base: run([]),
      change: run([{ key: "t > old", status: "failed" }], ["u"]),
      uncovered: [],
    });
    expect(verdict.findings).toEqual([
      "Fails with the change: t > old",
      "Fails to load with the change: u",
    ]);
    expect(verdict.exitCode).toBe(1);
  });

  it("reports uncovered lines without failing", () => {
    const verdict = judge({
      newKeys: [],
      base: run([]),
      change: run([]),
      uncovered: [{ file: "src/a.ts", lines: [3, 4, 5, 9] }],
    });
    expect(verdict.exitCode).toBe(0);
    expect(verdict.report).toContain("src/a.ts: 3-5, 9");
    expect(verdict.report).toContain("No new test cases");
  });
});

describe("isProductionPath", () => {
  it("counts source files under src/ and scripts/, whatever their extension", () => {
    expect(isProductionPath("src/web/use-catalogue.ts")).toBe(true);
    expect(isProductionPath("src/web/Vehicles.tsx")).toBe(true);
    expect(isProductionPath("src/web/styles.css")).toBe(true);
    expect(isProductionPath("scripts/check-bundle-origins.ts")).toBe(true);
  });

  it("leaves out tests, test-* helpers and files outside src/ and scripts/", () => {
    expect(isProductionPath("src/web/Vehicles.test.tsx")).toBe(false);
    expect(isProductionPath("src/web/test-support.ts")).toBe(false);
    expect(isProductionPath("DESIGN.md")).toBe(false);
    expect(isProductionPath("package.json")).toBe(false);
  });
});

describe("isTestFile", () => {
  it("matches *.test.ts and *.test.tsx under src/ and scripts/", () => {
    expect(isTestFile("src/web/Vehicles.test.tsx")).toBe(true);
    expect(isTestFile("scripts/check-slice.test.ts")).toBe(true);
    expect(isTestFile("src/web/test-support.ts")).toBe(false);
    expect(isTestFile("reference/x.test.ts")).toBe(false);
  });
});

describe("parseChanges", () => {
  it("reads git name-status lines and counts untracked files as added", () => {
    const nameStatus = "M\tsrc/web/use-catalogue.ts\nD\tsrc/old.ts\nA\tsrc/new.ts\n";
    expect(parseChanges(nameStatus, "src/web/fresh.test.ts\n")).toEqual([
      { path: "src/web/use-catalogue.ts", status: "M" },
      { path: "src/old.ts", status: "D" },
      { path: "src/new.ts", status: "A" },
      { path: "src/web/fresh.test.ts", status: "A" },
    ]);
  });

  it("returns nothing for empty output", () => {
    expect(parseChanges("", "")).toEqual([]);
  });
});

describe("changedLines", () => {
  it("collects the new-side lines of every -U0 hunk", () => {
    const diff = [
      "diff --git a/x.ts b/x.ts",
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -3,0 +4,2 @@ export function f() {",
      "+a",
      "+b",
      "@@ -10 +12 @@",
      "-old",
      "+new",
      "@@ -20,3 +22,0 @@",
      "-gone",
    ].join("\n");
    expect([...changedLines(diff)]).toEqual([4, 5, 12]);
  });
});

// A throwaway repo with one module and its test committed as the base. Each case then leaves
// an uncommitted change in it, the way an implementer hands back.
describe("checkSlice on a throwaway repo", { timeout: 60_000 }, () => {
  let repo: string;
  const git = (...args: string[]) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd: repo,
      encoding: "utf8",
    }).stdout;
  const write = (rel: string, text: string) => {
    mkdirSync(join(repo, rel, ".."), { recursive: true });
    writeFileSync(join(repo, rel), text);
  };
  const snapshot = () => [git("status", "--porcelain"), git("worktree", "list")];
  const TEST_HEAD = 'import { expect, it } from "vitest";\nimport * as m from "./math.ts";\n';

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), "obd-slice-")));
    git("init", "-q", "-b", "main");
    symlinkSync(realpathSync("node_modules"), join(repo, "node_modules"), "junction");
    write(".gitignore", "node_modules\n");
    write("package.json", '{ "type": "module" }\n');
    write("src/math.ts", "export const add = (a: number, b: number) => a + b;\n");
    write("src/math.test.ts", `${TEST_HEAD}it("adds", () => expect(m.add(1, 2)).toBe(3));\n`);
    git("add", ".");
    git("commit", "-q", "-m", "base");
  });

  afterEach(() => {
    unlinkSync(join(repo, "node_modules")); // the junction only, not the real node_modules
    rmSync(repo, { recursive: true, force: true });
  });

  it("passes a real fix: the new test fails on the base and passes on the change", () => {
    write(
      "src/math.ts",
      "export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\n",
    );
    write(
      "src/math.test.ts",
      `${TEST_HEAD}it("adds", () => expect(m.add(1, 2)).toBe(3));\nit("subtracts", () => expect(m.sub(3, 1)).toBe(2));\n`,
    );
    const before = snapshot();
    const verdict = checkSlice(repo, "main");
    expect(verdict.findings).toEqual([]);
    expect(verdict.exitCode).toBe(0);
    expect(verdict.report).toContain("src/math.test.ts > subtracts: failed on the base");
    expect(snapshot()).toEqual(before);
  });

  it("knows existing it.each cases by their formatted names, so they don't count as new", () => {
    const each = 'it.each([1, 2])("adds %s", (n) => expect(m.add(n, 0)).toBe(n));\n';
    write("src/math.test.ts", `${TEST_HEAD}${each}`);
    git("commit", "-q", "-am", "it.each");
    write(
      "src/math.ts",
      "export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\n",
    );
    write(
      "src/math.test.ts",
      `${TEST_HEAD}${each}it("subtracts", () => expect(m.sub(3, 1)).toBe(2));\n`,
    );
    const verdict = checkSlice(repo, "main");
    expect(verdict.findings).toEqual([]);
    expect(verdict.report).toContain("New test cases: 1");
  });

  it("flags a new test that already passes on the base", () => {
    write(
      "src/math.test.ts",
      `${TEST_HEAD}it("adds", () => expect(m.add(1, 2)).toBe(3));\nit("adds zero", () => expect(m.add(1, 0)).toBe(1));\n`,
    );
    const before = snapshot();
    const verdict = checkSlice(repo, "main");
    expect(verdict.findings).toEqual(["Passes without the change: src/math.test.ts > adds zero"]);
    expect(verdict.exitCode).toBe(1);
    expect(snapshot()).toEqual(before);
  });

  it("lists a changed line that no test runs, without failing", () => {
    write(
      "src/math.ts",
      "export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;\nexport function unused() {\n  return 1;\n}\n",
    );
    write(
      "src/math.test.ts",
      `${TEST_HEAD}it("adds", () => expect(m.add(1, 2)).toBe(3));\nit("subtracts", () => expect(m.sub(3, 1)).toBe(2));\n`,
    );
    const before = snapshot();
    const verdict = checkSlice(repo, "main");
    expect(verdict.exitCode).toBe(0);
    expect(verdict.report).toMatch(/src\/math\.ts: 3(-4)?\b/);
    expect(snapshot()).toEqual(before);
  });

  it("handles a new module with a new test file, the usual shape of a slice", () => {
    write(
      "src/half.ts",
      "export const half = (n: number) => n / 2;\nexport const never = () => 0;\n",
    );
    write(
      "src/half.test.ts",
      'import { expect, it } from "vitest";\nimport { half } from "./half.ts";\nit("halves", () => expect(half(4)).toBe(2));\n',
    );
    const before = snapshot();
    const verdict = checkSlice(repo, "main");
    expect(verdict.findings).toEqual([]);
    expect(verdict.report).toContain("src/half.test.ts: failed to load on the base");
    expect(verdict.report).toContain("src/half.ts: 2");
    expect(snapshot()).toEqual(before);
  });

  it("reports a production change with no new or changed tests, without failing", () => {
    write("src/math.ts", "export const add = (a: number, b: number) => b + a;\n");
    const verdict = checkSlice(repo, "main");
    expect(verdict.exitCode).toBe(0);
    expect(verdict.report).toContain("No new test cases.");
  });
});
