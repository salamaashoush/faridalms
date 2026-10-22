import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MathMarkup } from "./math-view";

const drawn = (rtl: boolean) =>
  renderToStaticMarkup(
    <MathMarkup
      latex="f(x)=3.5x^2+\sin x"
      display={false}
      rtl={rtl}
      digits="arab"
    />,
  );

describe("a formula drawn by Temml", () => {
  it("in Arabic notation, reads f(x) as د(س) in the school's digits, its LaTeX kept", () => {
    const markup = drawn(true);
    expect(markup).toContain("<mi>د</mi>");
    expect(markup).toContain("<mi>س</mi>");
    expect(markup).toContain("<mn>٣٫٥</mn>");
    expect(markup).toContain("<mi>جا</mi>");
    expect(markup).toContain("f(x)=3.5x^2+\\sin x</annotation>");
  });

  it("left to right, as written", () => {
    const markup = drawn(false);
    expect(markup).toContain("<mi>f</mi>");
    expect(markup).toContain("<mn>3.5</mn>");
  });
});
