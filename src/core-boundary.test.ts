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

describe("src/core", () => {
  it("imports nothing from profiles/ or rule-packs/", () => {
    const files = globSync("src/core/**/*.{ts,tsx}").map((f) => f.replaceAll("\\", "/"));
    const violations = files.flatMap((f) => findBoundaryViolations(f, readFileSync(f, "utf8")));
    expect(violations).toEqual([]);
  });
});
