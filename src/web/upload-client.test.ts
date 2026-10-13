import { describe, expect, it } from "vitest";
import { stubApi } from "./test-support.ts";
import { uploadVia } from "./upload-client.ts";

describe("uploadVia", () => {
  it("posts the file as the raw body with the Vehicle and filename in the query", async () => {
    const uploadCalls: unknown[] = [];
    const api = stubApi({
      uploadCalls,
      uploadResults: { "a.csv": { outcome: "added", kind: "drive-log", warnings: [] } },
    });
    const file = new File(["a,b"], "a.csv");
    const result = await uploadVia(api)(file, 4);
    expect(result.outcome).toBe("added");
    expect(uploadCalls).toEqual([{ query: { vehicle: "4", filename: "a.csv" }, body: file }]);
  });

  it("sends unassigned as such and throws the server's message on an error status", async () => {
    const uploadCalls: unknown[] = [];
    const api = stubApi({ uploadCalls, uploadError: { status: 400, error: "Unknown vehicle." } });
    await expect(uploadVia(api)(new File(["x"], "b.csv"), "unassigned")).rejects.toThrow(
      "Unknown vehicle.",
    );
    expect(uploadCalls).toMatchObject([{ query: { vehicle: "unassigned" } }]);
  });
});
