import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithSystem } from "./testing";
import { TrendChart } from "./trend-chart";

const points = [
  { id: "a", at: "2026-09-20T09:00:00Z", value: 62, label: "20 Sep: 62" },
  { id: "b", at: "2026-12-10T09:00:00Z", value: 81, label: "10 Dec: 81" },
  { id: "c", at: "2027-03-02T09:00:00Z", value: 95, label: "2 Mar: 95" },
];

describe("trend chart", () => {
  it("names itself and its reference line, and says a point when it is focused", () => {
    renderWithSystem(
      <TrendChart
        label="Words correct a minute"
        points={points}
        reference={{ label: "50th percentile", valueAt: () => 84 }}
      />,
    );
    expect(
      screen.getByRole("img", { name: /Words correct a minute/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("50th percentile")).toBeInTheDocument();
    fireEvent.focus(screen.getByLabelText("10 Dec: 81"));
    expect(screen.getAllByText("10 Dec: 81").length).toBeGreaterThan(0);
  });

  it("draws nothing without points", () => {
    const { container } = renderWithSystem(
      <TrendChart label="Words correct a minute" points={[]} />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});
