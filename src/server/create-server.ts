import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

/** The API plus the built web bundle in one app. */
export function createServer(api: Hono, webRoot: string) {
  return (
    new Hono()
      .route("/", api)
      // An unknown API path is an error, never the web shell.
      .all("/api/*", (c) => c.json({ error: "Not found." }, 404))
      .use("*", serveStatic({ root: webRoot }))
      .get("*", serveStatic({ path: join(webRoot, "index.html") }))
  );
}
