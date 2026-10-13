import type { InferResponseType } from "hono/client";
import type { Api } from "./api.tsx";

/** Row types of the list routes, taken from the real client type. */
export type FeedRow = InferResponseType<Api["api"]["uploads"]["$get"], 200>["items"][number];
export type ReportRow = InferResponseType<Api["api"]["reports"]["$get"], 200>[number];
export type DriveLogRow = InferResponseType<Api["api"]["drive-logs"]["$get"], 200>[number];
export type StatusData = InferResponseType<Api["api"]["vehicles"][":id"]["status"]["$get"], 200>;
