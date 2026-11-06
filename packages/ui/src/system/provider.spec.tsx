import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ENGLISH } from "./english";
import { DesignSystemProvider, useEndSide, useSystemStrings } from "./provider";

function Probe() {
  const strings = useSystemStrings();
  return (
    <p>
      {strings.save} {useEndSide()}
    </p>
  );
}

describe("DesignSystemProvider", () => {
  it("gives components the app's words and the end side of its direction", () => {
    render(
      <DesignSystemProvider
        value={{
          ...ENGLISH,
          direction: "rtl",
          strings: { ...ENGLISH.strings, save: "حفظ" },
        }}
      >
        <Probe />
      </DesignSystemProvider>,
    );
    expect(screen.getByText("حفظ left")).toBeInTheDocument();
  });

  it("refuses to render a component outside it rather than guess a language", () => {
    expect(() => render(<Probe />)).toThrow(/DesignSystemProvider/);
  });
});
