import { describe, expect, it } from "vitest";

import {
  addMonths,
  instalmentDays,
  invoiceTotals,
  monthsBetween,
  proratedShare,
  trueUpStudents,
} from "./invoices";

describe("an academic year's invoices", () => {
  it("fall at the term's start, and in February or a term at a time", () => {
    expect(instalmentDays("2026-09-01", "annual")).toEqual(["2026-09-01"]);
    expect(instalmentDays("2026-09-01", "two")).toEqual([
      "2026-09-01",
      "2027-02-01",
    ]);
    expect(instalmentDays("2026-09-01", "three")).toEqual([
      "2026-09-01",
      "2027-01-01",
      "2027-04-01",
    ]);
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
  });

  it("prorate by whole months left, a started month counting whole", () => {
    expect(monthsBetween("2026-09-01", "2027-08-31")).toBe(12);
    expect(monthsBetween("2027-01-15", "2027-08-31")).toBe(8);
    expect(
      proratedShare({
        startsOn: "2027-01-15",
        termStartsOn: "2026-09-01",
        termEndsOn: "2027-08-31",
      }),
    ).toBeCloseTo(8 / 12);
    expect(
      proratedShare({
        startsOn: "2026-09-01",
        termStartsOn: "2026-09-01",
        termEndsOn: "2027-08-31",
      }),
    ).toBe(1);
  });

  it("true up only past five per cent more students, and never credit a fall", () => {
    expect(trueUpStudents(300, 315)).toBe(0);
    expect(trueUpStudents(300, 316)).toBe(16);
    expect(trueUpStudents(300, 250)).toBe(0);
  });

  it("total the lines after discount with VAT on the subtotal", () => {
    expect(
      invoiceTotals(
        [
          {
            descriptionEn: "Standard",
            descriptionAr: "القياسية",
            itemCode: null,
            periodStart: "2026-09-01",
            periodEnd: "2027-08-31",
            quantity: 300,
            unitPriceMinor: 35_000,
            discountPercent: 10,
          },
        ],
        14,
      ),
    ).toMatchObject({
      subtotalMinor: 9_450_000,
      vatMinor: 1_323_000,
      totalMinor: 10_773_000,
    });
  });
});
