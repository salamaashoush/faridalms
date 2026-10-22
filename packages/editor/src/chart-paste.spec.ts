import type { ChartData } from "@faridalms/domain/content";

import { describe, expect, it } from "vitest";

import { gridOf, numberOf, pasteIntoChart } from "./chart-paste";

const empty: ChartData = {
  kind: "bar",
  title: "",
  xTitle: "",
  yTitle: "",
  labels: ["", "", ""],
  series: [{ name: "", values: [null, null, null] }],
};

describe("pasting a spreadsheet into a chart", () => {
  it("reads cells a spreadsheet copies, and leaves one cell alone", () => {
    expect(gridOf("Month\tRain\nJan\t12\nFeb\t8\n")).toEqual([
      ["Month", "Rain"],
      ["Jan", "12"],
      ["Feb", "8"],
    ]);
    expect(gridOf("12")).toBeNull();
    expect(gridOf("12\n")).toBeNull();
  });

  it("reads numbers as spreadsheets in any language show them", () => {
    expect(numberOf("1,234.5")).toBe(1234.5);
    expect(numberOf("1.234,5")).toBe(1234.5);
    expect(numberOf("3,5")).toBe(3.5);
    expect(numberOf("12,000")).toBe(12_000);
    expect(numberOf("٢٣٫٥")).toBe(23.5);
    expect(numberOf("٤٬٥٠٠")).toBe(4500);
    expect(numberOf("45%")).toBe(45);
    expect(numberOf("-0.5")).toBe(-0.5);
    expect(numberOf("n/a")).toBeNull();
    expect(numberOf("")).toBeNull();
  });

  it("places a whole table from its corner, names and all, wherever it lands", () => {
    const pasted = pasteIntoChart(
      empty,
      gridOf("Month\tCairo\tAswan\nJan\t5\t0\nFeb\t4\t1\nMar\t3\t\n") ?? [],
      { row: 2, column: 1 },
    );
    expect(pasted.labels).toEqual(["Jan", "Feb", "Mar"]);
    expect(pasted.series).toEqual([
      { name: "Cairo", values: [5, 4, 3] },
      { name: "Aswan", values: [0, 1, null] },
    ]);
  });

  it("fills values from the cell pasted into, adding rows as they come", () => {
    const pasted = pasteIntoChart(
      { ...empty, labels: ["Jan"], series: [{ name: "Rain", values: [9] }] },
      gridOf("12\n8\nseven\n") ?? [],
      { row: 1, column: 1 },
    );
    expect(pasted.labels).toEqual(["Jan", "", ""]);
    expect(pasted.series).toEqual([{ name: "Rain", values: [12, 8, null] }]);
  });

  it("keeps a pie to its one series", () => {
    const pasted = pasteIntoChart(
      { ...empty, kind: "pie" },
      gridOf("Fruit\tVotes\tMore\nApple\t3\t9\nFig\t5\t9\n") ?? [],
      { row: 1, column: 1 },
    );
    expect(pasted.series).toEqual([{ name: "Votes", values: [3, 5, null] }]);
    expect(pasted.labels).toEqual(["Apple", "Fig", ""]);
  });
});
