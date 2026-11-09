import { invoiceLineSchema } from "@faridalms/domain/invoices";
import { netMinor } from "@faridalms/domain/money";
import { describe, expect, test } from "bun:test";
import * as v from "valibot";

import { blankLine, draftNet, lineDraftOf, readLine } from "../src/lines";

const typed = {
  ...blankLine(),
  descriptionEn: " Training day ",
  descriptionAr: "يوم تدريب",
  quantity: "3",
  price: "1,234.50",
  discount: "12.5",
};

describe("a line typed in its sheet", () => {
  test("reads as the line the server takes, money in minor units", () => {
    const read = readLine(typed);
    expect(read).toEqual({
      ok: true,
      line: {
        descriptionEn: "Training day",
        descriptionAr: "يوم تدريب",
        itemCode: null,
        periodStart: null,
        periodEnd: null,
        quantity: 3,
        unitPriceMinor: 123_450,
        discountPercent: 12.5,
      },
    });
    if (read.ok) expect(v.is(invoiceLineSchema, read.line)).toBe(true);
  });

  test("comes to what the invoice will charge for it", () => {
    expect(draftNet(typed)).toBe(
      netMinor({ quantity: 3, unitPriceMinor: 123_450, discountPercent: 12.5 }),
    );
    expect(draftNet({ ...typed, price: "" })).toBeNull();
  });

  test("names each field that stops it", () => {
    const read = readLine({
      ...blankLine(),
      quantity: "1.5",
      price: "-3",
      discount: "101",
      periodStart: "2026-09-01",
      periodEnd: "2026-08-31",
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(Object.keys(read.errors).toSorted()).toEqual([
      "descriptionAr",
      "descriptionEn",
      "discount",
      "periodEnd",
      "price",
      "quantity",
    ]);
  });

  test("refuses what the server would refuse", () => {
    expect(readLine({ ...typed, quantity: "1000001" }).ok).toBe(false);
    expect(readLine({ ...typed, price: "10000000001" }).ok).toBe(false);
    expect(readLine({ ...typed, quantity: "0" }).ok).toBe(false);
  });

  test("opens a saved line as it was saved", () => {
    const read = readLine(typed);
    if (!read.ok) throw new Error("unreadable");
    expect(readLine(lineDraftOf(read.line))).toEqual(read);
  });
});
