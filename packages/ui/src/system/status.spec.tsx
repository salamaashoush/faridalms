import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge, StatusText } from "./status";

describe("status", () => {
  it("states a badge's state in words, its dot only decoration", () => {
    render(<StatusBadge tone="danger">Overdue</StatusBadge>);
    const badge = screen.getByText("Overdue");
    expect(badge).toHaveClass("text-destructive");
    expect(badge.querySelector("[aria-hidden]")).not.toBeNull();
  });

  it("reads a second status as text beside its dot", () => {
    render(<StatusText tone="success">Paid</StatusText>);
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });
});
