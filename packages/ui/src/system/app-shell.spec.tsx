import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { School, House } from "lucide-react";
import { describe, expect, it } from "vitest";

import { AppShell, initialsOf, ShellAccount, ShellBrand, useActiveByPath } from "./app-shell";
import { renderPageWithSystem } from "./testing";

function Console() {
  const isActive = useActiveByPath();
  return (
    <AppShell
      brand={<ShellBrand to="/" icon={House} title="Farida" subtitle="Operations" />}
      navigation={[
        { items: [{ to: "/", label: "Home", icon: House, exact: true }] },
        { title: "Schools", items: [{ to: "/schools", label: "Schools", icon: School }] },
      ]}
      navigationLabel="Console"
      description="The console's sections"
      isActive={isActive}
      account={
        <ShellAccount label="Account" name="Salama Ashoush" detail="Owner">
          {null}
        </ShellAccount>
      }
      breadcrumb={<span>Schools</span>}
    >
      <h1>Schools</h1>
    </AppShell>
  );
}

describe("AppShell", () => {
  it("frames the page with its navigation, the current item marked", async () => {
    renderPageWithSystem(Console, { path: "/schools/abc" });
    const nav = await screen.findByRole("navigation", { name: "Console" });
    expect(within(nav).getByText("Schools", { selector: "div" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Schools" })).toHaveAttribute(
      "data-active",
    );
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "data-active",
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main",
    );
  });

  it("names who is signed in on the account button", async () => {
    renderPageWithSystem(Console);
    expect(
      await screen.findByRole("button", { name: "Account" }),
    ).toHaveTextContent("Salama Ashoush");
  });
});

function SchoolSections() {
  const isActive = useActiveByPath();
  return (
    <AppShell
      brand={<ShellBrand to="/" icon={House} title="Farida" subtitle="School" />}
      navigation={[
        {
          id: "school",
          title: "School",
          items: [{ to: "/settings", label: "Settings", icon: School }],
          more: [
            { to: "/billing", label: "Billing", icon: School },
            { to: "/privacy", label: "Data protection", icon: School },
          ],
        },
      ]}
      navigationLabel="Primary"
      description="The school's sections"
      isActive={isActive}
      account={
        <ShellAccount label="Account" name="Salama Ashoush" detail="Owner">
          {null}
        </ShellAccount>
      }
      breadcrumb={<span>Billing</span>}
    >
      <h1>Billing</h1>
    </AppShell>
  );
}

describe("a section's More", () => {
  it("folds what is used now and then, keeping the open page in view", async () => {
    renderPageWithSystem(SchoolSections, { path: "/billing" });
    const nav = await screen.findByRole("navigation", { name: "Primary" });
    const more = within(nav).getByRole("button", { name: "More in School" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveTextContent("More");
    expect(within(nav).getByRole("link", { name: "Billing" })).toHaveAttribute(
      "data-active",
    );
    expect(
      within(nav).queryByRole("link", { name: "Data protection" }),
    ).not.toBeInTheDocument();
  });

  it("opens in place and tells the app what to remember", async () => {
    const remembered: string[][] = [];
    function Remembering() {
      const isActive = useActiveByPath();
      return (
        <AppShell
          brand={<ShellBrand to="/" icon={House} title="Farida" subtitle="School" />}
          navigation={[
            {
              id: "school",
              title: "School",
              items: [{ to: "/settings", label: "Settings", icon: School }],
              more: [{ to: "/privacy", label: "Data protection", icon: School }],
            },
          ]}
          navigationLabel="Primary"
          description="The school's sections"
          isActive={isActive}
          account={null}
          breadcrumb={<span>Settings</span>}
          onMoreOpenChange={(open) => remembered.push(open)}
        >
          <h1>Settings</h1>
        </AppShell>
      );
    }
    renderPageWithSystem(Remembering, { path: "/settings" });
    const nav = await screen.findByRole("navigation", { name: "Primary" });
    await userEvent.click(
      within(nav).getByRole("button", { name: "More in School" }),
    );
    expect(
      within(nav).getByRole("link", { name: "Data protection" }),
    ).toBeVisible();
    expect(
      within(nav).getByRole("button", { name: "More in School" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(remembered).toEqual([["school"]]);
  });
});

describe("initialsOf", () => {
  it("takes the first letters of up to two names", () => {
    expect(initialsOf("salama ashoush ali")).toBe("SA");
    expect(initialsOf("Salama")).toBe("S");
  });
});
