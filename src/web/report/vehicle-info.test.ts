import { describe, expect, it } from "vitest";
import { report } from "./test-reports.ts";
import { vehicleInfoRows } from "./vehicle-info.ts";

describe("vehicleInfoRows", () => {
  it("lists the header's Vehicle fields, then the calibration rows without the VIN entry", () => {
    const rows = vehicleInfoRows(
      report({
        header: {
          vin: "TEST-VIN-00001234",
          date: "2026-10-02T21:32:14",
          year: 2012,
          make: "Ford",
          model: "F-250",
        },
        vehicleInfo: [
          { description: "Vehicle Identification Number", value: "TEST-VIN-00001234" },
          { description: "ECM Calibration Verification Number", value: "ABCD" },
          { description: "Calibration ID", value: "XYZ" },
        ],
      }),
    );
    expect(rows).toEqual([
      ["Year", "2012"],
      ["Make", "Ford"],
      ["Model", "F-250"],
      ["VIN", "TEST-VIN-00001234"],
      ["ECM CVN", "ABCD"],
      ["Calibration ID", "XYZ"],
    ]);
  });

  it("drops rows with an empty value", () => {
    const rows = vehicleInfoRows(
      report({ vehicleInfo: [{ description: "Calibration ID", value: "" }] }),
    );
    expect(rows).toEqual([["VIN", "TEST-VIN-00001234"]]);
  });
});
