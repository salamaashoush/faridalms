import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  Fact,
  Facts,
  RecordColumns,
  RecordHeader,
  RecordSection,
  RecordTabs,
} from "./record-page";
import { renderWithSystem } from "./testing";

describe("RecordHeader", () => {
  it("names the record with its status and facts, each fact labelled for screen readers", () => {
    renderWithSystem(
      <RecordHeader
        title="Aspen School"
        status={{ label: "Active", tone: "success" }}
        facts={[
          { label: "Address", value: "aspen" },
          { label: "Cell", value: "eg-1" },
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Aspen School" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Address")).toHaveClass("sr-only");
    expect(screen.getByText("eg-1")).toBeInTheDocument();
  });

  it("puts the primary action beside the more menu", async () => {
    const onClick = vi.fn<() => void>();
    renderWithSystem(
      <RecordHeader
        title="Invoice 12"
        action={{ label: "Issue", onClick }}
        menu={[{ label: "Duplicate", onSelect: vi.fn<() => void>() }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Issue" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(
      screen.getAllByRole("button", { name: "More actions" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("RecordSection", () => {
  it("is a region named by its heading, with an Edit button naming what it edits", async () => {
    const onClick = vi.fn<() => void>();
    renderWithSystem(
      <RecordSection
        title="Contacts"
        edit={{ label: "Edit contacts", onClick }}
      >
        <Facts>
          <Fact label="Phone">{null}</Fact>
          <Fact label="Email">office@example.com</Fact>
        </Facts>
      </RecordSection>,
    );
    const section = screen.getByRole("region", { name: "Contacts" });
    expect(within(section).getByText("Not recorded")).toBeInTheDocument();
    expect(within(section).getByText("office@example.com")).toBeInTheDocument();
    await userEvent.click(
      within(section).getByRole("button", { name: "Edit contacts" }),
    );
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("RecordTabs", () => {
  it("shows the chosen tab and reports a change", async () => {
    const onChange = vi.fn<(value: "overview" | "billing") => void>();
    renderWithSystem(
      <RecordTabs
        label="School sections"
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "billing", label: "Billing" },
        ]}
        value="overview"
        onChange={onChange}
      >
        <RecordColumns main={<p>Main column</p>} aside={<p>Aside</p>} />
      </RecordTabs>,
    );
    expect(screen.getByText("Main column")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Billing" }));
    expect(onChange).toHaveBeenCalledWith("billing");
  });
});
