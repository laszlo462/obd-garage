import path from "node:path";

// The core must not know about Vehicle Profiles or Rule Packs (see CLAUDE.md, "Keep the layers apart").
const FORBIDDEN = ["src/profiles", "src/rule-packs"];

const SPECIFIER =
  /(?:\bimport|\bexport)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Returns one message per import in `source` (a file at `file`, posix path) that reaches a forbidden folder. */
export function findBoundaryViolations(file: string, source: string): string[] {
  const violations: string[] = [];
  for (const match of source.matchAll(SPECIFIER)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (!specifier?.startsWith(".")) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    const hit = FORBIDDEN.find((dir) => target === dir || target.startsWith(`${dir}/`));
    if (hit) violations.push(`${file} imports "${specifier}", which is inside ${hit}/`);
  }
  return violations;
}
