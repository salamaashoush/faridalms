import { render, screen } from "@testing-library/react";
import { School } from "lucide-react";
import { describe, expect, it } from "vitest";

import type { AuthBandContent } from "./auth-layout";

import { AuthHeading, AuthLayout } from "./auth-layout";

const BAND: AuthBandContent = {
  eyebrow: "Operator console",
  heading: "Every school, in one place.",
  body: "Set schools up and keep them running.",
  features: [{ icon: School, title: "Schools", body: "Follow each one." }],
};

describe("AuthLayout", () => {
  it("sets the brand's band beside the form, with what the product does", () => {
    render(
      <AuthLayout mark={<span>Farida</span>} band={BAND}>
        <AuthHeading title="Sign in" lead="Use your company account." />
      </AuthLayout>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeInTheDocument();
    const band = screen.getByRole("complementary");
    expect(band).toHaveTextContent("Every school, in one place.");
    expect(band).toHaveTextContent("Follow each one.");
    expect(screen.getByRole("main")).toHaveTextContent(
      "Use your company account.",
    );
  });

  it("gives a long flow the whole width, without the band", () => {
    render(
      <AuthLayout mark={<span>Farida</span>} band={BAND} wide>
        <AuthHeading title="Apply" />
      </AuthLayout>,
    );
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByText("Farida")).toBeVisible();
  });

  it("puts root props such as a school's colours on the frame", () => {
    const { container } = render(
      <AuthLayout
        mark={<span>Northwind</span>}
        className="portal-face"
        style={{ ["--brand" as string]: "#003366" }}
      >
        <AuthHeading title="Welcome" />
      </AuthLayout>,
    );
    const frame = container.firstElementChild;
    expect(frame).toHaveClass("portal-face", "grid");
    expect(frame).toHaveStyle({ "--brand": "#003366" });
  });
});
