import type { Api } from "./api.tsx";
import type { UploadResult, VehicleChoice } from "./upload-batch.ts";

/**
 * Uploads one file as the raw body of `POST /api/uploads`, through the typed client.
 * A non-200 answer throws with the server's message, so the batch turns it into a failed line.
 */
export const uploadVia =
  (api: Api) =>
  async (file: File, vehicle: VehicleChoice): Promise<UploadResult> => {
    const res = await api.api.uploads.$post(
      { query: { vehicle: String(vehicle), filename: file.name } },
      { init: { body: file } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `The server answered ${res.status}.`);
    }
    return (await res.json()) as UploadResult;
  };
