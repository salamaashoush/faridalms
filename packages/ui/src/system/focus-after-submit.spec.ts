import { afterEach, describe, expect, it } from "vitest";

import { mayMoveFocus } from "./focus-after-submit";

afterEach(() => {
  document.body.replaceChildren();
});

function field(name: string) {
  const input = document.createElement("input");
  input.name = name;
  document.body.append(input);
  return input;
}

describe("mayMoveFocus", () => {
  it("moves focus while it stays where the form was submitted from", () => {
    const first = field("first");
    first.focus();
    expect(mayMoveFocus(first, document)).toBe(true);
  });

  it("moves focus that dropped to the page", () => {
    const first = field("first");
    first.focus();
    first.blur();
    expect(mayMoveFocus(first, document)).toBe(true);
  });

  it("leaves focus in a control the person went on to", () => {
    const first = field("first");
    const phone = field("phone");
    first.focus();
    phone.focus();
    expect(mayMoveFocus(first, document)).toBe(false);
  });
});
