import { Hono } from "hono";

export const health = (deps: { appVersion: string }) =>
  new Hono().get("/", (c) => c.json({ status: "ok" as const, version: deps.appVersion }));
