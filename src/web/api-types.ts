import type { InferResponseType } from "hono/client";
import type { Api } from "./api.tsx";

/** Row types of the list routes, taken from the real client type. */
export type FeedRow = InferResponseType<Api["api"]["uploads"]["$get"], 200>["items"][number];
export type ReportRow = InferResponseType<Api["api"]["reports"]["$get"], 200>[number];
/** One parsed Report with its metadata, as `GET /api/reports/:id` answers. */
export type ReportDetail = InferResponseType<Api["api"]["reports"][":id"]["$get"], 200>;
/** One Drive Log with its Channels, chart preset and derived data, as `GET /api/drive-logs/:id` answers. */
export type DriveLogDetail = InferResponseType<Api["api"]["drive-logs"][":id"]["$get"], 200>;
export type DriveLogRow = InferResponseType<Api["api"]["drive-logs"]["$get"], 200>[number];
export type StatusData = InferResponseType<Api["api"]["vehicles"][":id"]["status"]["$get"], 200>;
export type FailedUploadRow = InferResponseType<Api["api"]["failed-uploads"]["$get"], 200>[number];
export type ProfileRow = InferResponseType<Api["api"]["profiles"]["$get"], 200>[number];
export type RulePackRow = InferResponseType<Api["api"]["rule-packs"]["$get"], 200>[number];
/** One Note as `GET /api/uploads/:id/notes` answers, with the row it snaps to when pinned. */
export type NoteView = InferResponseType<
  Api["api"]["uploads"][":id"]["notes"]["$get"],
  200
>[number];
export type VehicleRow = InferResponseType<Api["api"]["vehicles"]["$get"], 200>[number];
