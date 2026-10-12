import { readFileSync } from "node:fs";

/** The running app version, from `package.json`. It is stamped on derived data (ADR 0003). */
export function readAppVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  return pkg.version;
}
