import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Metric, MetricGrid } from "./metrics";
import { renderPageWithSystem } from "./testing";

describe("metrics", () => {
  it("states each number with what it counts, in a named strip", async () => {
    renderPageWithSystem(() => (
      <MetricGrid label="Summary">
        <Metric label="Schools" value="12" detail={{ text: "10 healthy" }} />
        <Metric
          label="Need attention"
          value="2"
          detail={{ text: "1 needs help", tone: "danger" }}
        />
      </MetricGrid>
    ));
    const strip = await screen.findByRole("region", { name: "Summary" });
    expect(within(strip).getByText("12")).toBeInTheDocument();
    expect(within(strip).getByText("1 needs help")).toBeInTheDocument();
  });

  it("opens the list behind a metric from the whole tile", async () => {
    renderPageWithSystem(
      () => <Metric label="Schools" value="12" link={{ to: "/" }} />,
      { path: "/home", paths: ["/"] },
    );
    await userEvent.click(await screen.findByRole("link", { name: /Schools/ }));
    expect(await screen.findByText("/")).toBeInTheDocument();
  });
});
