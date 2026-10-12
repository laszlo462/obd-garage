import { Hono } from "hono";
import type { Db } from "../db.ts";
import type { UploadKind } from "../originals.ts";

/** One row of the Failed Uploads screen. Download and delete use the `/api/uploads/:id` routes. */
export type FailedUploadItem = {
  id: number;
  kind: UploadKind;
  filename: string;
  error: string;
  uploadedAt: string;
};

export function failedUploadsRoute(deps: { db: Db }) {
  const { db } = deps;
  return new Hono().get("/", (c) =>
    c.json(
      db
        .listUploads()
        .flatMap((u): FailedUploadItem[] => {
          const error = db.getDerived(u.id)?.failedError;
          return error
            ? [
                {
                  id: u.id,
                  kind: u.kind,
                  filename: u.uploadedFilename,
                  error,
                  uploadedAt: u.uploadedAt,
                },
              ]
            : [];
        })
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || b.id - a.id),
    ),
  );
}
