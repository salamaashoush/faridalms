import { describe, expect, it } from "vitest";

import { rateOn } from "./business";
import { quoteReference, quoteTotals } from "./quotes";

const line = {
  kind: "plan" as const,
  versionId: "0195f3a0-0000-7000-8000-000000000001",
  nameEn: "Standard",
  nameAr: "القياسية",
  unit: "student_year" as const,
  quantity: 300,
  unitPriceMinor: 35_000,
  discountPercent: 10,
};

describe("a quote's amounts", () => {
  it("discounts each line, adds VAT to the subtotal and splits the total into instalments", () => {
    const totals = quoteTotals({
      lines: [
        line,
        {
          ...line,
          kind: "add_on",
          nameEn: "Coding",
          quantity: 1,
          unitPriceMinor: 1_000_001,
          discountPercent: 0,
        },
      ],
      vatPercent: 14,
      schedule: "three",
    });
    expect(totals.lines.map((row) => row.netMinor)).toEqual([
      9_450_000, 1_000_001,
    ]);
    expect(totals.subtotalMinor).toBe(10_450_001);
    expect(totals.vatMinor).toBe(1_463_000);
    expect(totals.totalMinor).toBe(11_913_001);
    expect(totals.instalmentsMinor).toEqual([3_971_000, 3_971_000, 3_971_001]);
    expect(
      totals.instalmentsMinor.reduce((sum, amount) => sum + amount, 0),
    ).toBe(totals.totalMinor);
  });

  it("charges no VAT where the country has none", () => {
    expect(
      quoteTotals({ lines: [line], vatPercent: 0, schedule: "annual" }),
    ).toMatchObject({
      vatMinor: 0,
      totalMinor: 9_450_000,
      instalmentsMinor: [9_450_000],
    });
  });

  it("names a later version after its number", () => {
    expect(quoteReference("Q-2026-0007", 1)).toBe("Q-2026-0007");
    expect(quoteReference("Q-2026-0007", 3)).toBe("Q-2026-0007-v3");
  });
});

describe("a VAT rate", () => {
  const rates = [
    { country: "EG", validFrom: "2016-09-01", percent: 13 },
    { country: "EG", validFrom: "2017-07-01", percent: 14 },
    { country: "AE", validFrom: "2018-01-01", percent: 5 },
  ];

  it("is the latest begun by the day, in the country", () => {
    expect(rateOn(rates, "EG", "2026-11-05")?.percent).toBe(14);
    expect(rateOn(rates, "EG", "2017-01-01")?.percent).toBe(13);
    expect(rateOn(rates, "SA", "2026-11-05")).toBeNull();
  });
});
