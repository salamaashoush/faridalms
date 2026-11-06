import { screen, within } from "@testing-library/react";
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

describe("initialsOf", () => {
  it("takes the first letters of up to two names", () => {
    expect(initialsOf("salama ashoush ali")).toBe("SA");
    expect(initialsOf("Salama")).toBe("S");
  });
});
