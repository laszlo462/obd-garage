import { hc } from "hono/client";
import type { AppType } from "../server/app.ts";

/** Typed API client. Paths and responses come from the server's `AppType`. */
export const client = hc<AppType>("/");
