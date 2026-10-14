import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Same answer on every OS: hook paths are Windows paths here and POSIX paths in cloud sessions.
const norm = (p: string) => p.replaceAll("\\", "/").toLowerCase();

/** Whether `file` is production code that needs a failing test before it changes. */
export function isProductionPath(file: string, root: string): boolean {
  const rel = posix.relative(norm(root), norm(file));
  if (!/^(src|scripts)\/.*\.tsx?$/.test(rel)) return false;
  return !/\.test\.tsx?$|\/test-[^/]*\.tsx?$/.test(rel);
}

/** Whether a shell command looks like it writes a production file (a bypass of the Edit gate). */
export function shellWritesProduction(command: string, root: string): boolean {
  // Redirect and tee targets, plus every path when an in-place editor runs.
  const targets = [...command.matchAll(/(?:>>?|\btee(?:\s+-a)?)\s*([^\s;&|]+)/g)].map(
    (m) => m[1] ?? "",
  );
  if (/\bsed\s+-i\b|\b(Set|Add)-Content\b|\bOut-File\b|\bwriteFile(Sync)?\b/i.test(command))
    targets.push(...(command.match(/[\w./\\:-]+\.tsx?\b/g) ?? []));
  const absolute = (p: string) => /^([a-z]:)?\//i.test(norm(p));
  return targets.some((p) =>
    isProductionPath(absolute(p) ? p : posix.join(norm(root), norm(p)), root),
  );
}

/** The gate's memory: the last check result, and the log the parent reviews. */
export type GateStore = { state: "red" | "green" | null; log: unknown[] };

export type HookInput = {
  hook_event_name: string;
  tool_name: string;
  tool_input: { file_path?: string; command?: string };
  tool_response?: { stdout?: string; stderr?: string };
  /** PostToolUseFailure: the failed tool's output, starting "Exit code N". */
  error?: string;
};

const DENY =
  "No failing test. Write the next test, run it and see it fail, then change production code.";

export function handleHook(input: HookInput, store: GateStore, root: string): { deny?: string } {
  if (input.hook_event_name.startsWith("PostToolUse")) {
    const res = input.tool_response;
    const out = `${res?.stdout ?? ""}${res?.stderr ?? ""}${input.error ?? ""}`;
    const command = input.tool_input.command ?? "";
    const result = classifyRun(command, out);
    if (!result) return {};
    store.state = result;
    const failing = [...out.matchAll(/^\s*[×✗]\s+(.+?)(?:\s+\d+ms)?\s*$/gm)].map((m) => m[1]);
    store.log.push({ event: "check", command, result, failing });
    return {};
  }
  const { file_path: file, command } = input.tool_input;
  const guarded =
    file !== undefined
      ? isProductionPath(file, root)
      : command !== undefined && shellWritesProduction(command, root);
  if (!guarded) return {};
  const allowed = store.state === "red";
  store.log.push({ event: "edit", target: file ?? command, allowed });
  return allowed ? {} : { deny: DENY };
}

/** Whether a check run passed, failed, or was not a check at all. */
export function classifyRun(command: string, output: string): "red" | "green" | null {
  if (/\btsc\b|\bnpm run typecheck\b/.test(command))
    return /error TS\d+/.test(output) ? "red" : "green";
  if (/\bbiome\b|\bnpm run lint\b/.test(command))
    return /Some errors were emitted/.test(output) ? "red" : "green";
  if (!/\bvitest\b|\bnpm (run )?test\b/.test(command)) return null;
  return /\bfailed\b/.test(output) ? "red" : "green";
}

// The implementer's hooks run this with the hook input on stdin. State and log live in
// `.claude/tdd-gate/` (gitignored). Exit 2 denies the tool call and shows stderr to the agent.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const input = JSON.parse(readFileSync(0, "utf8")) as HookInput & { cwd?: string };
  const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const dir = join(root, ".claude", "tdd-gate");
  mkdirSync(dir, { recursive: true });
  const statePath = join(dir, "state.json");
  const store: GateStore = { state: null, log: [] };
  if (existsSync(statePath)) store.state = JSON.parse(readFileSync(statePath, "utf8")).state;
  const result = handleHook(input, store, root);
  writeFileSync(statePath, JSON.stringify({ state: store.state }));
  const at = new Date().toISOString();
  for (const entry of store.log)
    appendFileSync(join(dir, "log.jsonl"), `${JSON.stringify({ at, ...(entry as object) })}\n`);
  if (result.deny) {
    process.stderr.write(result.deny);
    // Not process.exit(2): on Windows that can abort Node with exit 127, which lets the edit through.
    process.exitCode = 2;
  }
}
