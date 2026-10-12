import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { app as api } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();

// One process serves the API and the built web bundle (`dist/web`).
const server = new Hono()
  .route("/", api)
  .use("*", serveStatic({ root: "./dist/web" }))
  .get("*", serveStatic({ path: "./dist/web/index.html" }));

serve({ fetch: server.fetch, port: config.port }, (info) => {
  console.log(`obd-garage listening on port ${info.port}`);
});
