import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Strings that look like URLs but are never requested: SVG namespaces and a docs link in a
// preact-iso error message.
const NEVER_REQUESTED = [/^https?:\/\/www\.w3\.org\//, /^https:\/\/github\.com\/preactjs\//];

/** Every http(s) URL in `text` that could be a request to another origin. */
export function findThirdPartyUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s"'`)<>]+/g) ?? [];
  return urls.filter((url) => !NEVER_REQUESTED.some((pattern) => pattern.test(url)));
}

/** Third-party URLs in every text file under `dir`, with paths relative to `dir`. */
export function scanDir(dir: string): { file: string; url: string }[] {
  const found: { file: string; url: string }[] = [];
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(html|js|css|json|svg|webmanifest)$/.test(entry.name)) continue;
    const full = join(entry.parentPath, entry.name);
    for (const url of findThirdPartyUrls(readFileSync(full, "utf8"))) {
      found.push({ file: relative(dir, full), url });
    }
  }
  return found;
}

// `npm run check:bundle` runs this after `npm run build`.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const found = scanDir(process.argv[2] ?? "dist/web");
  for (const { file, url } of found) console.error(`${file}: ${url}`);
  if (found.length > 0) process.exit(1);
  console.log("dist/web makes no request outside the app origin.");
}
