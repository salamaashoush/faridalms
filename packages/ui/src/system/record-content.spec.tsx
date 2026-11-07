import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DnsRecords } from "./dns-records";
import { Page } from "./page";
import { SummaryList } from "./summary-list";
import { renderWithSystem } from "./testing";
import { UsageList } from "./usage-list";

describe("UsageList", () => {
  it("shows use against what is allowed, with a bar only where there is a limit", () => {
    renderWithSystem(
      <UsageList
        label="Use"
        items={[
          {
            id: "pool",
            label: "School pool",
            used: "90 GB",
            allowed: "100 GB",
            share: 0.9,
          },
          {
            id: "students",
            label: "Students",
            used: "8",
            allowed: "No limit",
            share: null,
          },
        ]}
      />,
    );
    const rows = within(screen.getByRole("list", { name: "Use" })).getAllByRole(
      "listitem",
    );
    expect(rows[0]).toHaveTextContent("90 GB / 100 GB");
    expect(rows[0]?.querySelector(".bg-warning")).not.toBeNull();
    expect(rows[1]).toHaveTextContent("8 / No limit");
    expect(rows[1]?.querySelector(".bg-muted")).toBeNull();
  });
});

describe("UsageList titled", () => {
  it("names the list in a bar with its action", () => {
    renderWithSystem(
      <UsageList
        titled
        label="Use against its limits"
        action={<button type="button">Edit</button>}
        items={[
          { id: "s", label: "Students", used: "8", allowed: "10", share: 0.8 },
        ]}
      />,
    );
    expect(
      screen.getByRole("list", { name: "Use against its limits" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});

describe("SummaryList", () => {
  it("pairs each name with its value", () => {
    renderWithSystem(
      <SummaryList
        items={[
          { id: "class", label: "Each class", value: "1 GB" },
          { id: "emails", label: "Emails a month", value: "Unlimited" },
        ]}
      />,
    );
    expect(screen.getByText("Each class").nextSibling).toHaveTextContent(
      "1 GB",
    );
  });

  it("lines amounts up at the end and text up at the start", () => {
    renderWithSystem(
      <>
        <SummaryList
          items={[{ id: "pool", label: "Pool", value: "100 GB" }]}
        />
        <SummaryList
          align="start"
          items={[
            { id: "address", label: "Billing address", value: "1 Nile St" },
          ]}
        />
      </>,
    );
    expect(screen.getByText("100 GB")).toHaveClass("text-end");
    expect(screen.getByText("1 Nile St")).not.toHaveClass("text-end");
  });

  it("titles a group and gives a row its own action", () => {
    renderWithSystem(
      <SummaryList
        title="Relationship"
        align="start"
        items={[
          {
            id: "owner",
            label: "Account owner",
            value: "Salama Ashoush",
            action: <button type="button">Change</button>,
          },
        ]}
      />,
    );
    const group = screen.getByRole("region", { name: "Relationship" });
    expect(within(group).getByText("Salama Ashoush")).toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: "Change" }),
    ).toBeInTheDocument();
  });
});

describe("DnsRecords", () => {
  it("lays out each record and copies its name and value", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderWithSystem(
      <DnsRecords
        records={[
          { type: "TXT", name: "_farida-challenge.www.example.com", value: "abc" },
        ]}
        labels={{
          type: "Type",
          name: "Name",
          value: "Value",
          copy: (part, type) => `Copy the ${part.toLowerCase()} of the ${type} record`,
        }}
      />,
    );
    expect(screen.getByRole("rowheader", { name: "TXT" })).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Copy the value of the TXT record" }),
    );
    expect(writeText).toHaveBeenCalledWith("abc");
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });
});

describe("Page", () => {
  it("is as wide as its kind of page reads well", () => {
    const { container } = renderWithSystem(
      <Page width="record">
        <p>A school</p>
      </Page>,
    );
    expect(container.firstElementChild).toHaveClass("mx-auto", "max-w-7xl");
  });
});
