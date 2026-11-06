import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PageHeader } from "./page-header";
import { renderPageWithSystem, renderWithSystem } from "./testing";

describe("PageHeader", () => {
  it("shows the title with its count, read out as a total", () => {
    renderWithSystem(<PageHeader title="Schools" count={1234} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Schools" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1,234 in total")).toHaveClass("sr-only");
  });

  it("offers one primary action as a button", async () => {
    const onClick = vi.fn<() => void>();
    renderWithSystem(
      <PageHeader title="Leads" action={{ label: "Add lead", onClick }} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add lead" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("offers an action that goes somewhere as a link", async () => {
    renderPageWithSystem(
      () => (
        <PageHeader
          title="Schools"
          action={{ label: "New school", link: { to: "/" } }}
        />
      ),
      { path: "/schools", paths: ["/"] },
    );
    await userEvent.click(
      await screen.findByRole("link", { name: "New school" }),
    );
    expect(await screen.findByText("/")).toBeInTheDocument();
  });

  it("keeps further actions in the more menu", async () => {
    const onSelect = vi.fn<() => void>();
    renderWithSystem(
      <PageHeader
        title="Billing"
        menu={[{ label: "Export", onSelect }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Export" }),
    );
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
