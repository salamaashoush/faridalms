import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ENGLISH } from "./english";
import { ErrorPage, NotFoundPage } from "./status-page";
import { renderPageWithSystem } from "./testing";

describe("status pages", () => {
  it("says a page failed, offers to try again, and keeps the cause to hand", async () => {
    const reset = vi.fn<() => void>();
    renderPageWithSystem(
      () => (
        <ErrorPage error={new Error("Connection refused")} reset={reset} />
      ),
      {
        path: "/schools",
        system: { ...ENGLISH, errorMessage: () => "The server did not answer." },
      },
    );
    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByText("The server did not answer.")).not.toBeVisible();
    await userEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText("The server did not answer.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
  });

  it("tells a reader a page is not theirs to open, and offers the way out and no retry", async () => {
    renderPageWithSystem(
      () => <ErrorPage error={new Error("Forbidden")} reset={() => undefined} />,
      {
        path: "/schools",
        paths: ["/"],
        system: { ...ENGLISH, errorKind: () => "forbidden" },
      },
    );
    expect(
      await screen.findByRole("heading", {
        name: "This page is not open to you",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Go home" }));
    expect(await screen.findByText("/")).toBeInTheDocument();
  });

  it.each([
    ["missing", "This is no longer here", "link", "Go home"],
    ["signed_out", "Your session has ended", "button", "Sign in again"],
    ["offline", "The server could not be reached", "button", "Try again"],
  ] as const)(
    "words a %s failure for what the reader can do",
    async (kind, title, role, action) => {
      renderPageWithSystem(
        () => <ErrorPage error={new Error("x")} reset={() => undefined} />,
        {
          path: "/schools",
          paths: ["/"],
          system: { ...ENGLISH, errorKind: () => kind },
        },
      );
      expect(
        await screen.findByRole("heading", { name: title }),
      ).toBeInTheDocument();
      expect(screen.getByRole(role, { name: action })).toBeInTheDocument();
      expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
    },
  );

  it("names a missing page and leads home", async () => {
    renderPageWithSystem(NotFoundPage, { path: "/nowhere", paths: ["/"] });
    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Go home" }));
    expect(await screen.findByText("/")).toBeInTheDocument();
  });
});
