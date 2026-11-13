import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalFace } from "~/queries/portal";

import * as m from "~/i18n/messages";
import { render } from "~/testUtils";

import { demoAccounts } from "./demo-accounts";
import { SignInForm } from "./SignInForm";

const face = (school: string, audiences: string[]): PortalFace => ({
  school,
  name: { en: null, ar: null },
  palette: null,
  logoKey: null,
  contact: { address: null, phone: null, email: null },
  websiteHost: null,
  turnstileKey: null,
  paused: false,
  audiences,
  doors: [],
});

const northwindLabels = (audiences: string[]) =>
  demoAccounts(face("northwind", audiences)).map((account) => account.label());

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
  useHydrated: () => true,
  useRouter: () => ({
    navigate: mockNavigate,
    clearCache: vi.fn(),
  }),
}));

vi.mock("~/server/auth", () => ({
  login: vi.fn(),
}));

describe("SignForm", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders SignInForm form correctly", () => {
    render(<SignInForm />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("never asks which school: the portal's host names it", () => {
    render(<SignInForm />);
    expect(screen.getAllByRole("textbox")).toEqual([
      screen.getByLabelText(m.authSignInFormLogin()),
    ]);
  });

  it("shows validation errors for empty form submission", async () => {
    render(<SignInForm />);

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await userEvent.click(submitButton);

    expect(
      await screen.findByText(m.validationLoginName()),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(m.validationMinLength({ count: 8 })),
    ).toBeInTheDocument();
  });

  it("refuses what is neither an email address nor a sign-in name", async () => {
    render(<SignInForm />);

    const loginInput = screen.getByLabelText(m.authSignInFormLogin());
    await userEvent.type(loginInput, "not a name");

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await userEvent.click(submitButton);

    expect(
      await screen.findByText(m.validationLoginName()),
    ).toBeInTheDocument();
  });

  it("takes the short sign-in name printed on a student's slip", async () => {
    render(<SignInForm />);

    await userEvent.type(
      screen.getByLabelText(m.authSignInFormLogin()),
      "ga1008",
    );
    await userEvent.type(
      screen.getByLabelText(/password/i),
      "kofa-mide-ruto-basu",
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.queryByText(m.validationLoginName()),
      ).not.toBeInTheDocument();
    });
  });

  it("shows validation error for short password", async () => {
    render(<SignInForm />);

    const passwordInput = screen.getByLabelText(/password/i);
    await userEvent.type(passwordInput, "12345");

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await userEvent.click(submitButton);

    expect(
      await screen.findByText(m.validationMinLength({ count: 8 })),
    ).toBeInTheDocument();
  });

  it("submits form with valid data", async () => {
    render(<SignInForm />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await userEvent.type(emailInput, "test@example.com");
    await userEvent.type(passwordInput, "password123");

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.queryByText(m.validationLoginName()),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(m.validationMinLength({ count: 8 })),
      ).not.toBeInTheDocument();
    });
  });

  it("fills both credentials when a demo account is chosen", async () => {
    render(<SignInForm />);

    await userEvent.click(screen.getByRole("button", { name: m.roleParent() }));

    expect(screen.getByLabelText(m.authSignInFormLogin())).toHaveValue(
      "parent1001@northwind.example.com",
    );
    // Filling only the email would leave the form looking ready but failing.
    expect(screen.getByLabelText(m.authSignInFormPassword())).toHaveValue(
      "farida-development-password",
    );
  });

  it("offers the academy's own accounts on its portal, with no parent where it keeps no families", async () => {
    render(<SignInForm demo={demoAccounts(face("lanternfield", []))} />);

    for (const label of [m.roleAdmin(), m.roleTeacher(), m.roleStudent()])
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: m.roleParent() }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: m.roleStudent() }),
    );
    expect(screen.getByLabelText(m.authSignInFormLogin())).toHaveValue(
      "student1.lanternfield@lanternfield.example.com",
    );
  });

  it("offers a school's parent only where its portal signs families in", () => {
    expect(northwindLabels(["families"])).toContain(m.roleParent());
    expect(northwindLabels([])).not.toContain(m.roleParent());
  });

  it("offers one demo account per role", async () => {
    render(<SignInForm />);

    for (const label of [
      m.roleAdmin(),
      m.roleTeacher(),
      m.roleParent(),
      m.roleStudent(),
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });
});
