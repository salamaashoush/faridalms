import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentView } from "./document-view";
import { renderWithSystem } from "./testing";

describe("document view", () => {
  it("puts its tools and actions above the paper, which alone is marked to print", () => {
    renderWithSystem(
      <DocumentView
        label="Invoice INV-2026-00001"
        tools={<button type="button">Arabic</button>}
        actions={<button type="button">Print</button>}
      >
        <article aria-label="The paper">Total 100.00</article>
      </DocumentView>,
    );
    const view = screen.getByRole("region", { name: "Invoice INV-2026-00001" });
    const paper = screen.getByRole("article", { name: "The paper" });
    expect(view).toContainElement(paper);
    expect(paper.closest("[data-print-document]")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Print" }).closest("[data-print-document]"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Arabic" })).toBeInTheDocument();
  });

  it("draws no row above the paper when it has nothing to put there", () => {
    const { container } = renderWithSystem(
      <DocumentView label="Quote Q-1">
        <p>Body</p>
      </DocumentView>,
    );
    expect(container.querySelector(".print\\:hidden")).toBeNull();
  });
});
