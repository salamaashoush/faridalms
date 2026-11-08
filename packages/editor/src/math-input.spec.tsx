import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MathInput } from "./math-input";

const mathlive = vi.hoisted(() => {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { arrived: promise, arrive: () => resolve() };
});

vi.mock("mathlive", async () => {
  await mathlive.arrived;
  class MathfieldElement extends HTMLElement {
    static fontsDirectory: string | null = "";
    static soundsDirectory: string | null = "";
    static locale = "en";
    value = "";
    readOnly = false;
    smartFence = false;
    mathVirtualKeyboardPolicy = "manual";
    mode = "math";
    commands: unknown[] = [];
    connectedCallback() {
      this.tabIndex = 0;
    }
    executeCommand(command: unknown) {
      this.commands.push(command);
      if (Array.isArray(command) && command[0] === "typedText")
        this.value += String(command[1]);
      return true;
    }
  }
  customElements.define("math-field", MathfieldElement);
  return { MathfieldElement };
});

type Field = HTMLElement & { value: string; commands: unknown[] };

const field = () => document.querySelector<Field>("math-field");

describe("a formula's field", () => {
  it("keeps the keys typed while MathLive loads and types them into its field", async () => {
    const user = userEvent.setup();
    const onInput = vi.fn();
    const onEnter = vi.fn();
    render(
      <MathInput
        value=""
        locale="en"
        label="Formula"
        onInput={onInput}
        onEnter={onEnter}
        focused
      />,
    );
    const standIn = screen.getByRole("textbox", { name: "Formula" });
    expect(document.activeElement).toBe(standIn);

    await user.keyboard("x^2");
    expect(onInput).toHaveBeenLastCalledWith("x^2");
    expect(field()).toBeNull();

    mathlive.arrive();
    await waitFor(() => expect(field()).not.toBeNull());
    expect(field()?.commands).toEqual([
      [
        "typedText",
        "x^2",
        { focus: false, feedback: false, simulateKeystroke: true },
      ],
    ]);
    expect(field()?.value).toBe("x^2");
    expect(document.activeElement).toBe(field());
    expect(screen.queryByRole("textbox", { name: "Formula" })).toBeNull();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("is MathLive's at once when MathLive has already loaded", () => {
    render(
      <MathInput
        value="\frac{1}{2}"
        locale="en"
        label="Formula"
        onInput={() => {}}
        onEnter={() => {}}
        focused
      />,
    );
    expect(field()?.value).toBe("\\frac{1}{2}");
    expect(document.activeElement).toBe(field());
    expect(screen.queryByRole("textbox", { name: "Formula" })).toBeNull();
  });
});
