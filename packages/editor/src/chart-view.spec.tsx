import type { ChartData } from "@faridalms/domain/content";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChartView, niceTicks } from "./chart-view";

const strings = {
  chartData: "The numbers",
  chartSeries: "Series",
  chartCategory: "Category",
  chartOther: "Other",
  chartEmpty: "Enter numbers",
};

const drawn = (chart: ChartData) =>
  renderToStaticMarkup(
    <ChartView chart={chart} strings={strings} locale="en" />,
  );

const rainfall: ChartData = {
  kind: "bar",
  title: "Rainfall",
  xTitle: "Month",
  yTitle: "Millimetres",
  labels: ["Jan", "Feb", "Mar"],
  series: [
    { name: "Cairo", values: [5, 4, null] },
    { name: "Alexandria", values: [52, 29, 13] },
  ],
};

describe("charts as read", () => {
  it("steps its axis in round numbers that take in zero", () => {
    expect(niceTicks(4, 52)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(-3, 8)).toEqual([-5, 0, 5, 10]);
    expect(niceTicks(0, 0)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("draws a column per value, a legend for two series and every number in a table", () => {
    const html = drawn(rainfall);
    expect(html.match(/class="fe-chart-bar"/g)).toHaveLength(5);
    expect(html).toContain('class="fe-chart-legend"');
    expect(html).toContain(">Alexandria<");
    expect(html).toContain('type="range"');
    expect(html).toContain("<td>52</td>");
    expect(html).toContain("<td>–</td>");
  });

  it("folds a pie past six slices into one, with each share in the legend", () => {
    const html = drawn({
      kind: "pie",
      title: "",
      xTitle: "",
      yTitle: "",
      labels: ["A", "B", "C", "D", "E", "F", "G", "H"],
      series: [{ name: "", values: [10, 10, 10, 10, 10, 20, 20, 10] }],
    });
    expect(html.match(/class="fe-chart-slice"/g)).toHaveLength(6);
    expect(html).toContain(">Other<");
    expect(html).toContain("50%");
  });

  it("asks for numbers until there are some", () => {
    const html = drawn({
      ...rainfall,
      series: [{ name: "", values: [null, null, null] }],
    });
    expect(html).toContain("Enter numbers");
    expect(html).not.toContain("<svg");
  });
});
