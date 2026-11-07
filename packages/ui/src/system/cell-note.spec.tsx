import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CellWithNote } from "./cell-note";
import { renderWithSystem } from "./testing";

describe("CellWithNote", () => {
  it("puts the note on one line under the subject, whole on hover", () => {
    const why =
      "Kept as the school had it before the console sold anything, until its first contract";
    renderWithSystem(<CellWithNote note={why}>Gives Peer review</CellWithNote>);
    const note = screen.getByText(why);
    expect(note).toHaveClass("truncate");
    expect(note).toHaveAttribute("title", why);
    expect(screen.getByText("Gives Peer review")).toBeInTheDocument();
  });

  it("draws the subject alone without a note", () => {
    renderWithSystem(<CellWithNote note={null}>Gives Badges</CellWithNote>);
    expect(screen.getByText("Gives Badges").nextSibling).toBeNull();
  });
});
