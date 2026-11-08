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
  const keyboard = Object.assign(new EventTarget(), { visible: false });
  Object.assign(window, { mathVirtualKeyboard: keyboard });
  class MathfieldElement extends HTMLElement {
    static fontsDirectory: string | null = "";
    static soundsDirectory: string | null = "";
    static locale = "en";
    static strings: Record<string, Record<string, string>> = {};
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
      if (command === "toggleVirtualKeyboard") {
        keyboard.visible = !keyboard.visible;
        keyboard.dispatchEvent(new Event("virtual-keyboard-toggle"));
      }
      return true;
    }
  }
  customElements.define("math-field", MathfieldElement);
  return { MathfieldElement };
});

type Field = HTMLElement & { value: string; commands: unknown[] };

const field = () => document.querySelector<Field>("math-field");

const labels = {
  keyboard: "Maths keyboard",
  menu: "Formula options",
  items: { "menu.insert": "Insert" },
};

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
        labels={labels}
        onInput={onInput}
        onEnter={onEnter}
        focused
      />,
    );
    const standIn = screen.getByRole("textbox", { name: "Formula" });
    expect(document.activeElement).toBe(standIn);
    expect(
      screen.getByRole("button", { name: "Maths keyboard" }),
    ).toBeDisabled();

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
        labels={labels}
        onInput={() => {}}
        onEnter={() => {}}
        focused
      />,
    );
    expect(field()?.value).toBe("\\frac{1}{2}");
    expect(document.activeElement).toBe(field());
    expect(screen.queryByRole("textbox", { name: "Formula" })).toBeNull();
  });

  it("offers MathLive's keyboard and menu as buttons of its own", async () => {
    const user = userEvent.setup();
    render(
      <MathInput
        value="x"
        locale="en"
        label="Formula"
        labels={labels}
        onInput={() => {}}
        onEnter={() => {}}
      />,
    );
    const keyboard = screen.getByRole("button", { name: "Maths keyboard" });
    expect(keyboard).toHaveAttribute("aria-pressed", "false");
    await user.click(keyboard);
    expect(keyboard).toHaveAttribute("aria-pressed", "true");
    expect(document.activeElement).toBe(field());
    await user.click(keyboard);
    expect(keyboard).toHaveAttribute("aria-pressed", "false");

    // MathLive's menu speaks the page's language where its own words lack it.
    expect(
      (customElements.get("math-field") as unknown as { strings: unknown })
        .strings,
    ).toEqual({ en: { "menu.insert": "Insert" } });
    await user.click(screen.getByRole("button", { name: "Formula options" }));
    expect(field()?.commands).toEqual([
      "toggleVirtualKeyboard",
      "toggleVirtualKeyboard",
      "toggleContextMenu",
    ]);
  });

  it("offers neither to an answer that can no longer change", () => {
    render(
      <MathInput
        value="x"
        locale="en"
        label="Formula"
        labels={labels}
        onInput={() => {}}
        onEnter={() => {}}
        readOnly
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
