import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as m from "~/i18n/messages";
import { render } from "~/testUtils";

import { SignInForm } from "./SignInForm";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    navigate: mockNavigate,
    invalidate: vi.fn(),
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

  it("shows validation errors for empty form submission", async () => {
    render(<SignInForm />);

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await userEvent.click(submitButton);

    expect(await screen.findByText(m.validationEmail())).toBeInTheDocument();
    expect(
      await screen.findByText(m.validationMinLength({ count: 8 })),
    ).toBeInTheDocument();
  });

  it("shows validation error for invalid email", async () => {
    render(<SignInForm />);

    const emailInput = screen.getByLabelText(/email/i);
    await userEvent.type(emailInput, "invalid-email");

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await userEvent.click(submitButton);

    expect(await screen.findByText(m.validationEmail())).toBeInTheDocument();
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
      expect(screen.queryByText(m.validationEmail())).not.toBeInTheDocument();
      expect(
        screen.queryByText(m.validationMinLength({ count: 8 })),
      ).not.toBeInTheDocument();
    });
  });

  it("fills both credentials when a demo account is chosen", async () => {
    render(<SignInForm />);

    await userEvent.click(screen.getByRole("button", { name: m.roleParent() }));

    expect(screen.getByLabelText(m.authSignInFormEmail())).toHaveValue(
      "parent@example.com",
    );
    // Filling only the email would leave the form looking ready but failing.
    expect(screen.getByLabelText(m.authSignInFormPassword())).toHaveValue(
      "northwind1234",
    );
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
