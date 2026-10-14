import { describe, expect, it } from "vitest";
import {
  classifyRun,
  type GateStore,
  handleHook,
  isProductionPath,
  shellWritesProduction,
} from "./tdd-gate.ts";

const ROOT = "C:\\repo";

const memoryStore = (state: GateStore["state"] = null): GateStore => ({ state, log: [] });

const editInput = (file: string) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Edit",
  tool_input: { file_path: file, old_string: "a", new_string: "b" },
});

describe("handleHook", () => {
  it("denies a production edit after a green run", () => {
    const result = handleHook(
      editInput("C:\\repo\\src\\web\\AppBar.tsx"),
      memoryStore("green"),
      ROOT,
    );
    expect(result.deny).toMatch(/failing test/i);
  });

  it("records a failing test run as red", () => {
    const store = memoryStore("green");
    handleHook(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "npx vitest run src/web/format.test.ts" },
        tool_response: { stdout: VITEST_RED, stderr: "" },
      },
      store,
      ROOT,
    );
    expect(store.state).toBe("red");
    expect(store.log).toEqual([
      {
        event: "check",
        command: "npx vitest run src/web/format.test.ts",
        result: "red",
        failing: ["count > uses the singular for one"],
      },
    ]);
  });

  it("records a run that exited non-zero (PostToolUseFailure) as red", () => {
    const store = memoryStore("green");
    handleHook(
      {
        hook_event_name: "PostToolUseFailure",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        error: `Exit code 1\n${VITEST_RED}`,
      },
      store,
      ROOT,
    );
    expect(store.state).toBe("red");
  });

  it("denies a shell write to production code after a green run", () => {
    const input = {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "cat > src/web/Vehicles.tsx <<'EOF'\nx\nEOF" },
    };
    expect(handleHook(input, memoryStore("green"), ROOT).deny).toMatch(/failing test/i);
  });

  it("always allows a test edit", () => {
    const file = "C:\\repo\\src\\web\\AppBar.test.tsx";
    expect(handleHook(editInput(file), memoryStore("green"), ROOT).deny).toBeUndefined();
  });

  it("allows a production edit while a test is red", () => {
    const result = handleHook(
      editInput("C:\\repo\\src\\web\\AppBar.tsx"),
      memoryStore("red"),
      ROOT,
    );
    expect(result.deny).toBeUndefined();
  });

  it("logs each guarded edit, allowed or denied", () => {
    const store = memoryStore("green");
    handleHook(editInput("C:\\repo\\src\\web\\AppBar.tsx"), store, ROOT);
    store.state = "red";
    handleHook(editInput("C:\\repo\\src\\web\\AppBar.tsx"), store, ROOT);
    expect(store.log).toEqual([
      { event: "edit", target: "C:\\repo\\src\\web\\AppBar.tsx", allowed: false },
      { event: "edit", target: "C:\\repo\\src\\web\\AppBar.tsx", allowed: true },
    ]);
  });
});

describe("shellWritesProduction", () => {
  it("catches a heredoc into a source file", () => {
    expect(shellWritesProduction("cat > src/web/Vehicles.tsx <<'EOF'\nx\nEOF", ROOT)).toBe(true);
  });

  it("catches PowerShell and Node writers", () => {
    expect(shellWritesProduction("Set-Content -Path src\\web\\AppBar.tsx -Value $x", ROOT)).toBe(
      true,
    );
    expect(shellWritesProduction("$x | Out-File src/web/AppBar.tsx", ROOT)).toBe(true);
    expect(shellWritesProduction(`node -e "fs.writeFileSync('src/web/AppBar.tsx', s)"`, ROOT)).toBe(
      true,
    );
  });

  it("lets reads through, including stderr redirects", () => {
    expect(shellWritesProduction("grep -n count src/web/format.ts 2>&1 | head", ROOT)).toBe(false);
    expect(shellWritesProduction("cat src/web/AppBar.tsx > /dev/null", ROOT)).toBe(false);
  });

  it("catches sed -i on an absolute path", () => {
    expect(shellWritesProduction("sed -i 's/a/b/' C:/repo/src/web/AppBar.tsx", ROOT)).toBe(true);
  });
});

describe("isProductionPath", () => {
  it("guards source under src/", () => {
    expect(isProductionPath("C:\\repo\\src\\web\\Vehicles.tsx", ROOT)).toBe(true);
  });

  it("ignores drive-letter case and slash style", () => {
    expect(isProductionPath("c:/repo/src/web/Vehicles.tsx", ROOT)).toBe(true);
    expect(isProductionPath("/home/u/repo/src/x.ts", "/home/u/repo")).toBe(true);
  });

  it("leaves files outside src/ and scripts/ alone", () => {
    expect(isProductionPath("C:\\repo\\DESIGN.ts", ROOT)).toBe(false);
    expect(isProductionPath("C:\\repo\\.claude\\agents\\implementer.md", ROOT)).toBe(false);
  });

  it("guards only TypeScript, not styles or snapshots", () => {
    expect(isProductionPath("C:\\repo\\src\\web\\styles\\app.css", ROOT)).toBe(false);
    expect(isProductionPath("C:\\repo\\src\\core\\__snapshots__\\report.test.ts.snap", ROOT)).toBe(
      false,
    );
  });

  it("treats the shared test helpers as test code", () => {
    expect(isProductionPath("C:\\repo\\src\\web\\test-support.ts", ROOT)).toBe(false);
    expect(isProductionPath("C:\\repo\\src\\web\\test-render.tsx", ROOT)).toBe(false);
  });

  it("never guards a test file", () => {
    expect(isProductionPath("C:\\repo\\src\\web\\Vehicles.test.tsx", ROOT)).toBe(false);
  });
});

const VITEST_RED = `
 ❯ src/web/format.test.ts (3 tests | 1 failed) 12ms
   × count > uses the singular for one 5ms
     → expected '1 reports' to be '1 report'

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
`;

describe("classifyRun", () => {
  it("calls a vitest run with a failed test red", () => {
    expect(classifyRun("npx vitest run src/web/format.test.ts", VITEST_RED)).toBe("red");
  });

  it("calls a passing npm test run green", () => {
    const out = " Test Files  58 passed (58)\n      Tests  609 passed (609)\n";
    expect(classifyRun("npm test", out)).toBe("green");
  });

  it("calls a typecheck with errors red", () => {
    const out =
      "src/web/Vehicles.tsx(12,7): error TS2322: Type 'string' is not assignable to type 'number'.\n";
    expect(classifyRun("npm run typecheck", out)).toBe("red");
  });

  it("calls a lint run with errors red", () => {
    const out =
      "Checked 1 file in 3ms.\nFound 2 errors.\n  × Some errors were emitted while running checks.\n";
    expect(classifyRun("npm run lint", out)).toBe("red");
  });

  it("ignores a command that is not a check", () => {
    expect(classifyRun("git log --oneline", "fix: failed upload toast")).toBeNull();
  });
});
