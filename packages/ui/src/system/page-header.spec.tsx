import type { ReactNode } from "react";

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  PageActionsProvider,
  PageActionsSlot,
  PageMetaSlot,
} from "./page-actions";
import { PageHeader } from "./page-header";
import { renderPageWithSystem, renderWithSystem } from "./testing";

interface InShellProps {
  children: ReactNode;
}

/** The top bar's slots and the page beneath, as the app shell draws them. */
function InShell({ children }: InShellProps) {
  return (
    <PageActionsProvider>
      <header aria-label="Top bar">
        <PageMetaSlot />
        <PageActionsSlot />
      </header>
      <section aria-label="Page">{children}</section>
    </PageActionsProvider>
  );
}

const topBar = () => screen.getByRole("banner", { name: "Top bar" });
const page = () => screen.getByRole("region", { name: "Page" });

describe("PageHeader", () => {
  it("names the page for screen readers alone, the breadcrumb showing it", () => {
    renderWithSystem(
      <InShell>
        <PageHeader title="Schools" />
      </InShell>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Schools" }),
    ).toHaveClass("sr-only");
  });

  it("shows the count beside the breadcrumb, read out as a total", async () => {
    renderWithSystem(
      <InShell>
        <PageHeader title="Schools" count={1234} />
      </InShell>,
    );
    const total = await within(topBar()).findByText("1,234 in total");
    expect(total).toHaveClass("sr-only");
  });

  it("keeps the description on the page, above its content", () => {
    renderWithSystem(
      <InShell>
        <PageHeader title="Messages" description="Newest first." />
      </InShell>,
    );
    expect(within(page()).getByText("Newest first.")).toBeVisible();
  });

  it("offers one primary action as a button in the top bar", async () => {
    const onClick = vi.fn<() => void>();
    renderWithSystem(
      <InShell>
        <PageHeader title="Leads" action={{ label: "Add lead", onClick }} />
      </InShell>,
    );
    await userEvent.click(
      await within(topBar()).findByRole("button", { name: "Add lead" }),
    );
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("offers an action that goes somewhere as a link", async () => {
    renderPageWithSystem(
      () => (
        <InShell>
          <PageHeader
            title="Schools"
            action={{ label: "New school", link: { to: "/" } }}
          />
        </InShell>
      ),
      { path: "/schools", paths: ["/"] },
    );
    await userEvent.click(
      await screen.findByRole("link", { name: "New school" }),
    );
    expect(await screen.findByText("/")).toBeInTheDocument();
  });

  it("says how the page's work stands before its actions", async () => {
    renderWithSystem(
      <InShell>
        <PageHeader
          title="Gradebook"
          status={<span>Saved</span>}
          action={{ label: "Release grades", onClick: vi.fn() }}
        />
      </InShell>,
    );
    const release = await screen.findByRole("button", {
      name: "Release grades",
    });
    const saved = screen.getByText("Saved");
    expect(
      saved.compareDocumentPosition(release) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps further actions in the more menu", async () => {
    const onSelect = vi.fn<() => void>();
    renderWithSystem(
      <InShell>
        <PageHeader
          title="Billing"
          menu={[{ label: "Export", onSelect }]}
        />
      </InShell>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Export" }),
    );
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
