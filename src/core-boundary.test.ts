import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findBoundaryViolations } from "./core-boundary.ts";

describe("findBoundaryViolations", () => {
  const file = "src/core/units.ts";

  it("flags an import from profiles", () => {
    const source = `import { sixSeven } from "../profiles/six-seven.ts";`;
    expect(findBoundaryViolations(file, source)).toHaveLength(1);
  });

  it("flags an import from rule-packs, in every import form", () => {
    const forms = [
      `import type { Pack } from "../rule-packs/p0401/index.ts";`,
      `export * from "../rule-packs/p0401.ts";`,
      `import "../rule-packs/p0401.ts";`,
      `const m = await import("../rule-packs/p0401.ts");`,
      `import {\n  a,\n  b,\n} from "../rule-packs/x.ts";`,
    ];
    for (const source of forms) {
      expect(findBoundaryViolations(file, source), source).toHaveLength(1);
    }
  });

  it("flags a path that climbs out and back in", () => {
    const source = `import x from "./sub/../../profiles/x.ts";`;
    expect(findBoundaryViolations(file, source)).toHaveLength(1);
  });

  it("allows imports within core and from packages", () => {
    const source = `import { a } from "./channels.ts";\nimport { b } from "../shared/b.ts";\nimport fs from "node:fs";`;
    expect(findBoundaryViolations(file, source)).toEqual([]);
  });
});

describe("src/profiles", () => {
  const forbidden = ["src/server", "src/web"];

  it("flags an import of the server or the web app", () => {
    const file = "src/profiles/x.ts";
    expect(
      findBoundaryViolations(file, `import a from "../server/db.ts";`, forbidden),
    ).toHaveLength(1);
    expect(findBoundaryViolations(file, `import a from "../core/derive.ts";`, forbidden)).toEqual(
      [],
    );
  });

  it("imports core only, never the server or the web app", () => {
    const files = globSync("src/profiles/**/*.{ts,tsx}").map((f) => f.replaceAll("\\", "/"));
    expect(files.length).toBeGreaterThan(0);
    const violations = files.flatMap((f) =>
      findBoundaryViolations(f, readFileSync(f, "utf8"), forbidden),
    );
    expect(violations).toEqual([]);
  });
});

describe("src/core", () => {
  it("imports nothing from profiles/ or rule-packs/", () => {
    const files = globSync("src/core/**/*.{ts,tsx}").map((f) => f.replaceAll("\\", "/"));
    expect(files.length).toBeGreaterThan(0);
    const violations = files.flatMap((f) => findBoundaryViolations(f, readFileSync(f, "utf8")));
    expect(violations).toEqual([]);
  });
});
