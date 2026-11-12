import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CheckLanguage, useCheckMessages } from "./checkLanguage";

function Labels() {
  const m = useCheckMessages();
  return (
    <p>
      {m.lrnCheck()} · {m.lrnTriesLeft({ count: 1 })}
    </p>
  );
}

describe("a question's own words", () => {
  it("follow the language the lesson is read in, else the interface's", () => {
    render(
      <>
        <CheckLanguage.Provider value="ar">
          <Labels />
        </CheckLanguage.Provider>
        <Labels />
      </>,
    );
    expect(screen.getByText("تحقّق من الإجابة · بقيت محاولة واحدة")).toBeTruthy();
    expect(screen.getByText(/^Check answer · /)).toBeTruthy();
  });
});
