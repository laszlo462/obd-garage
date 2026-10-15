import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Whether `rel` (a repo-relative POSIX path) is production code: anything under src/ or scripts/
 * except tests and `test-*` helpers. Wider than the old gate's rule, so CSS counts too. */
export function isProductionPath(rel: string): boolean {
  if (!/^(src|scripts)\//.test(rel)) return false;
  return !isTestFile(rel) && !/\/test-[^/]*\.tsx?$/.test(rel);
}

export function isTestFile(rel: string): boolean {
  return /^(src|scripts)\/.*\.test\.tsx?$/.test(rel);
}

export type Change = { path: string; status: "A" | "M" | "D" };

/** `git diff --name-status --no-renames` output, plus untracked files (counted as added). */
export function parseChanges(nameStatus: string, untracked: string): Change[] {
  const changes: Change[] = [];
  for (const line of nameStatus.split("\n")) {
    const [status, path] = line.split("\t");
    if (path && (status === "A" || status === "M" || status === "D"))
      changes.push({ path, status });
  }
  for (const path of untracked.split("\n")) if (path) changes.push({ path, status: "A" });
  return changes;
}

const relTo = (root: string, file: string) => {
  const r = `${root.replaceAll("\\", "/").replace(/\/$/, "")}/`;
  const f = file.replaceAll("\\", "/");
  return f.toLowerCase().startsWith(r.toLowerCase()) ? f.slice(r.length) : f;
};

/** A test case is keyed "file > describe > … > title", with the file relative to the repo. */
const SEP = " > ";
const fileOf = (key: string) => key.split(SEP)[0] ?? key;

export type CaseRun = {
  cases: { key: string; status: string }[];
  /** Test files that failed before any case ran (an import or syntax error). */
  brokenFiles: string[];
};

type VitestJson = {
  testResults: {
    name: string;
    message?: string;
    assertionResults: { ancestorTitles: string[]; title: string; status: string }[];
  }[];
};

/** Per-case results from Vitest's `--reporter=json` output. */
export function caseRun(json: VitestJson, root: string): CaseRun {
  const run: CaseRun = { cases: [], brokenFiles: [] };
  for (const file of json.testResults) {
    const rel = relTo(root, file.name);
    if (file.message && file.assertionResults.length === 0) run.brokenFiles.push(rel);
    for (const a of file.assertionResults)
      run.cases.push({ key: [rel, ...a.ancestorTitles, a.title].join(SEP), status: a.status });
  }
  return run;
}

type Loc = { start: { line: number } };
export type FileCoverage = {
  statementMap: Record<string, Loc>;
  s: Record<string, number>;
  fnMap: Record<string, { loc: Loc }>;
  f: Record<string, number>;
};

/** Changed lines where a statement or function that never ran starts (Istanbul JSON coverage). */
export function uncoveredLines(cov: FileCoverage, changed: Set<number>): number[] {
  const lines = new Set<number>();
  for (const [id, loc] of Object.entries(cov.statementMap))
    if (cov.s[id] === 0 && changed.has(loc.start.line)) lines.add(loc.start.line);
  for (const [id, fn] of Object.entries(cov.fnMap))
    if (cov.f[id] === 0 && changed.has(fn.loc.start.line)) lines.add(fn.loc.start.line);
  return [...lines].sort((a, b) => a - b);
}

/** "3-5, 9" */
function ranges(lines: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i] as number;
    let end = start;
    while (lines[i + 1] === end + 1) end = lines[++i] as number;
    out.push(end === start ? `${start}` : `${start}-${end}`);
  }
  return out.join(", ");
}

export type Verdict = { findings: string[]; exitCode: 0 | 1; report: string };

/**
 * `testOnly`: no production file changed, so the base runs the same code and "passes without the
 * change" means nothing. `guards`: substrings of case keys whose passing on the base was checked
 * by hand; those cases are listed apart and are no finding.
 */
export function judge(input: {
  newKeys: string[];
  base: CaseRun;
  change: CaseRun;
  uncovered: { file: string; lines: number[] }[];
  testOnly?: boolean;
  guards?: string[];
}): Verdict {
  const { newKeys, base, change, uncovered, testOnly = false, guards = [] } = input;
  const findings: string[] = [];
  const report: string[] = [];
  const guarded: string[] = [];
  const baseStatus = new Map(base.cases.map((c) => [c.key, c.status]));

  if (newKeys.length === 0) report.push("No new test cases.");
  else report.push(`New test cases: ${newKeys.length}`);
  for (const key of newKeys) {
    const status = baseStatus.get(key);
    if (status === "passed" && testOnly) {
      report.push(`  - ${key}: passes on the base, as it must (no production change)`);
    } else if (status === "passed" && guards.some((g) => key.includes(g))) {
      guarded.push(key);
    } else if (status === "passed") {
      findings.push(`Passes without the change: ${key}`);
      report.push(`  ✗ ${key}: passes without the change`);
    } else {
      report.push(`  ✓ ${key}: ${status ?? "did not run"} on the base`);
    }
  }
  if (testOnly) report.push("No production file changed: can't judge a test-only slice.");
  if (guarded.length > 0) report.push(`Hand-checked guards:\n  ${guarded.join("\n  ")}`);
  const brokenOnBase = [...new Set(newKeys.map(fileOf))].filter((f) =>
    base.brokenFiles.includes(f),
  );
  for (const f of brokenOnBase) report.push(`  ${f}: failed to load on the base`);

  for (const c of change.cases)
    if (c.status === "failed") findings.push(`Fails with the change: ${c.key}`);
  for (const f of change.brokenFiles) findings.push(`Fails to load with the change: ${f}`);
  const passed = change.cases.filter((c) => c.status === "passed").length;
  report.push(`With the change: ${passed} of ${change.cases.length} cases passed.`);

  if (uncovered.length > 0) {
    report.push("Changed production lines no new or changed test runs:");
    for (const u of uncovered) report.push(`  ${u.file}: ${ranges(u.lines)}`);
  }
  report.push(
    findings.length === 0 ? "OK" : `${findings.length} finding(s):\n  ${findings.join("\n  ")}`,
  );
  return { findings, exitCode: findings.length === 0 ? 0 : 1, report: report.join("\n") };
}

/** The new-side line numbers of every hunk in a `git diff -U0`. */
export function changedLines(diff: string): Set<number> {
  const lines = new Set<number>();
  for (const m of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    for (let i = 0; i < count; i++) lines.add(start + i);
  }
  return lines;
}

/** The error for a child that exited without doing its job: its command, status and stderr tail. */
export function childFailure(command: string, status: number | null, stderr: string): string {
  const tail = stderr.trimEnd().split("\n").slice(-10).join("\n");
  return `${command} exited with status ${status} and wrote no output.\n${tail}`;
}

let interrupted = false;

function run(cwd: string, cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (interrupted) throw new Error("Interrupted");
  if (r.error) throw r.error;
  return r;
}

function sh(cwd: string, cmd: string, args: string[]): string {
  return run(cwd, cmd, args).stdout;
}

/** Runs vitest and returns the parsed JSON it wrote to `outputFile`. */
function vitest(cwd: string, nodeModules: string, args: string[], outputFile: string): unknown {
  const script = join(nodeModules, "vitest", "vitest.mjs");
  const r = run(cwd, process.execPath, [
    script,
    ...args,
    "--reporter=json",
    `--outputFile=${outputFile}`,
  ]);
  if (!existsSync(outputFile))
    throw new Error(childFailure(`node ${script} ${args.join(" ")}`, r.status, r.stderr));
  return readJson(outputFile);
}

/** The first `node_modules` holding vitest, walking up from `from` the way Node resolves modules. */
export function findNodeModules(
  from: string,
  hasVitest = (nm: string) => existsSync(join(nm, "vitest", "vitest.mjs")),
): string {
  for (let dir = from; ; dir = dirname(dir)) {
    const nm = join(dir, "node_modules");
    if (hasVitest(nm)) return nm;
    if (dirname(dir) === dir) throw new Error(`No node_modules with vitest found from ${from}`);
  }
}

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

/**
 * Checks the working tree of `root` against `base` (via their merge base): the new test cases
 * must fail with the base's production files and pass with the working tree's. Everything else
 * in the working tree (tests, helpers, config) is used for both runs. The base run happens in a
 * temporary git worktree, so `root` is only read. A new case that passes on the base but matches
 * one of `guards` (substrings of its key) was checked by hand: listed apart, no finding.
 */
export function checkSlice(root: string, base = "main", guards: string[] = []): Verdict {
  const mergeBase = sh(root, "git", ["merge-base", base, "HEAD"]).trim();
  if (!mergeBase) throw new Error(`No merge base between ${base} and HEAD`);
  const untracked = sh(root, "git", ["ls-files", "--others", "--exclude-standard"]);
  const changes = parseChanges(
    sh(root, "git", ["diff", "--name-status", "--no-renames", mergeBase]),
    untracked,
  );
  const tests = changes.filter((c) => c.status !== "D" && isTestFile(c.path)).map((c) => c.path);
  const production = changes.filter((c) => c.status !== "D" && isProductionPath(c.path));
  const empty: CaseRun = { cases: [], brokenFiles: [] };
  if (tests.length === 0) return judge({ newKeys: [], base: empty, change: empty, uncovered: [] });

  const nodeModules = realpathSync(findNodeModules(root));
  const tmp = mkdtempSync(join(tmpdir(), "check-slice-"));
  const tree = join(tmp, "base");
  const onInterrupt = () => {
    interrupted = true;
  };
  process.on("SIGINT", onInterrupt);
  let worktreeAdded = false;
  try {
    // Base: the merge base's files, then every non-production change laid over them.
    sh(root, "git", ["worktree", "add", "--detach", "--quiet", tree, mergeBase]);
    worktreeAdded = true;
    symlinkSync(nodeModules, join(tree, "node_modules"), "junction");

    // The base's own test cases, to tell new cases from old. A run, not `vitest list`, because
    // the list leaves `it.each` names unformatted ("… (%s)").
    const existing = tests.filter((t) => existsSync(join(tree, t)));
    let baseKeys = new Set<string>();
    if (existing.length > 0) {
      const out = join(tmp, "existing.json");
      const json = vitest(tree, nodeModules, ["run", ...existing], out) as VitestJson;
      baseKeys = new Set(caseRun(json, tree).cases.map((c) => c.key));
    }
    for (const c of changes) {
      if (isProductionPath(c.path)) continue;
      const target = join(tree, c.path);
      if (c.status === "D") rmSync(target, { force: true });
      else {
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(join(root, c.path), target);
      }
    }
    const baseJson = vitest(tree, nodeModules, ["run", ...tests], join(tmp, "base.json"));
    const baseRun = caseRun(baseJson as VitestJson, tree);

    // Change: the working tree as it is, with coverage of the changed production files.
    const coverageArgs = production.length
      ? [
          "--coverage.enabled",
          "--coverage.provider=v8",
          "--coverage.reporter=json",
          `--coverage.reportsDirectory=${join(tmp, "coverage")}`,
          ...production.map((p) => `--coverage.include=${p.path}`),
        ]
      : [];
    const changeJson = vitest(
      root,
      nodeModules,
      ["run", ...tests, ...coverageArgs],
      join(tmp, "change.json"),
    );
    const changeRun = caseRun(changeJson as VitestJson, root);

    const uncovered: { file: string; lines: number[] }[] = [];
    const coveragePath = join(tmp, "coverage", "coverage-final.json");
    const coverage: Record<string, FileCoverage> = existsSync(coveragePath)
      ? readJson(coveragePath)
      : {};
    const coverageFor = (rel: string) =>
      Object.entries(coverage).find(([file]) => relTo(root, file) === rel)?.[1];
    const untrackedSet = new Set(untracked.split("\n"));
    for (const p of production) {
      const cov = coverageFor(p.path);
      if (!cov) continue;
      const changed = untrackedSet.has(p.path)
        ? new Set(
            readFileSync(join(root, p.path), "utf8")
              .split("\n")
              .map((_, i) => i + 1),
          )
        : changedLines(sh(root, "git", ["diff", "-U0", mergeBase, "--", p.path]));
      const lines = uncoveredLines(cov, changed);
      if (lines.length > 0) uncovered.push({ file: p.path, lines });
    }

    const newKeys = [...new Set(changeRun.cases.map((c) => c.key))].filter((k) => !baseKeys.has(k));
    return judge({
      newKeys,
      base: baseRun,
      change: changeRun,
      uncovered,
      testOnly: production.length === 0,
      guards,
    });
  } finally {
    process.off("SIGINT", onInterrupt);
    interrupted = false;
    if (existsSync(join(tree, "node_modules"))) unlinkSync(join(tree, "node_modules"));
    if (worktreeAdded) sh(root, "git", ["worktree", "remove", "--force", tree]);
    sh(root, "git", ["worktree", "prune"]);
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** `[base] [--guard <substring>]…`: the base is the first positional argument, "main" if absent. */
export function parseArgs(argv: string[]): { base: string; guards: string[] } {
  let base: string | undefined;
  const guards: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--guard") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--guard needs a value");
      guards.push(value);
    } else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else base ??= arg;
  }
  return { base: base ?? "main", guards };
}

// `npm run check:slice [base] [--guard <substring>]…`: the parent runs this on an implementer's
// hand-back.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { base, guards } = parseArgs(process.argv.slice(2));
  const verdict = checkSlice(process.cwd(), base, guards);
  console.log(verdict.report);
  process.exitCode = verdict.exitCode;
}
