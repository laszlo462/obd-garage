import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findThirdPartyUrls, scanDir } from "./check-bundle-origins.ts";

describe("findThirdPartyUrls", () => {
  it("reports an http(s) URL to another origin", () => {
    expect(findThirdPartyUrls('fetch("https://cdn.example.com/x.js")')).toEqual([
      "https://cdn.example.com/x.js",
    ]);
  });

  it("ignores SVG namespace strings, which are never requested", () => {
    const text = 'a="http://www.w3.org/2000/svg" b="https://fonts.gstatic.com/s/x.woff2"';
    expect(findThirdPartyUrls(text)).toEqual(["https://fonts.gstatic.com/s/x.woff2"]);
  });

  it("ignores the docs link inside a preact-iso error string", () => {
    const text = 'throw Error("see https://github.com/preactjs/preact-iso#usage")';
    expect(findThirdPartyUrls(text)).toEqual([]);
  });
});

describe("scanDir", () => {
  it("lists third-party URLs per file, in nested folders", () => {
    const dir = mkdtempSync(join(tmpdir(), "obd-bundle-"));
    try {
      mkdirSync(join(dir, "assets"));
      writeFileSync(join(dir, "index.html"), "<p>ok</p>");
      writeFileSync(
        join(dir, "assets", "app.css"),
        "@import url(https://fonts.googleapis.com/css);",
      );
      expect(scanDir(dir)).toEqual([
        { file: join("assets", "app.css"), url: "https://fonts.googleapis.com/css" },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 1 from the command line when the bundle has a third-party URL", () => {
    const dir = mkdtempSync(join(tmpdir(), "obd-bundle-"));
    try {
      writeFileSync(join(dir, "app.js"), 'fetch("https://cdn.example.com/x.js")');
      const run = spawnSync(process.execPath, ["scripts/check-bundle-origins.ts", dir], {
        encoding: "utf8",
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("https://cdn.example.com/x.js");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
