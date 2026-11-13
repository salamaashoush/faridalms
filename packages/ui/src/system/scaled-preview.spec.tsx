import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { previewFit, ScaledPreview } from "./scaled-preview";
import { renderWithSystem } from "./testing";

const box = { width: 360, height: 224 };

describe("previewFit", () => {
  it("fits a short content to the width and centres it in the box", () => {
    const fit = previewFit({
      box,
      content: { width: 1200, height: 400 },
      minShrink: 0.6,
    });
    expect(fit.scale).toBeCloseTo(0.3);
    expect(fit.x).toBeCloseTo(0);
    expect(fit.y).toBeCloseTo((224 - 120) / 2);
  });

  it("shrinks a tall content until all of it is in the box", () => {
    const fit = previewFit({
      box,
      content: { width: 1200, height: 800 },
      minShrink: 0.6,
    });
    expect(fit.scale).toBeCloseTo(224 / 800);
    expect(800 * fit.scale).toBeCloseTo(224);
    expect(fit.x).toBeCloseTo((360 - 1200 * fit.scale) / 2);
    expect(fit.y).toBe(0);
  });

  it("stops shrinking a very long content and keeps its top in view", () => {
    const fit = previewFit({
      box,
      content: { width: 1200, height: 4000 },
      minShrink: 0.6,
    });
    expect(fit.scale).toBeCloseTo(0.3 * 0.6);
    expect(fit.y).toBe(0);
  });

  it("never enlarges a content narrower than the box", () => {
    expect(
      previewFit({
        box,
        content: { width: 200, height: 100 },
        minShrink: 0.6,
      }).scale,
    ).toBe(1);
  });

  it("draws nothing before the box is measured", () => {
    expect(
      previewFit({
        box: { width: 0, height: 224 },
        content: { width: 1200, height: 400 },
        minShrink: 0.6,
      }).scale,
    ).toBe(0);
  });
});

describe("ScaledPreview", () => {
  it("is a picture screen readers and the keyboard pass over", () => {
    renderWithSystem(
      <ScaledPreview width={1200} height={224}>
        <button type="button">Inside</button>
      </ScaledPreview>,
    );
    const inside = screen.getByText("Inside");
    const frame = inside.closest("[aria-hidden]");
    expect(frame).not.toBeNull();
    expect(frame).toHaveAttribute("inert");
    expect(frame).toHaveStyle({ height: "224px" });
  });
});
