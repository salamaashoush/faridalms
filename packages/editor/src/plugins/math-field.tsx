import "mathlive/fonts.css";
import { useEffect, useEffectEvent, useRef } from "react";

/**
 * MathLive's field for writing a formula: typed as LaTeX or as it looks,
 * with its own keyboard of symbols on a touch screen. Enter and Escape go
 * to the page, except Escape in the middle of a LaTeX command, which the
 * field cancels itself.
 */
export default function MathField({
  value,
  locale,
  label,
  onInput,
  onEnter,
  onEscape,
  readOnly = false,
  focused = false,
}: {
  value: string;
  locale: string;
  label: string;
  onInput: (latex: string) => void;
  onEnter: () => void;
  onEscape?: () => void;
  readOnly?: boolean;
  /** Takes focus as it appears, for a formula opened to be written. */
  focused?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<(HTMLElement & { readOnly: boolean }) | null>(null);
  const input = useEffectEvent(onInput);
  const enter = useEffectEvent(onEnter);
  const escape = useEffectEvent(() => onEscape?.());
  // The field is made once; what is typed lives in it.
  const first = useRef({
    value,
    readOnly,
    focused,
    escapes: onEscape !== undefined,
  });

  useEffect(() => {
    let left = false;
    let unmount = () => {};
    // A server build resolves "mathlive" to its server entry, which has no
    // field; the field is only ever made here, in the browser.
    void import("mathlive").then(({ MathfieldElement }) => {
      if (left) return;
      // The fonts come with this module's stylesheet, so the field fetches
      // none of its own, and it makes no sound as keys are pressed.
      MathfieldElement.fontsDirectory = null;
      MathfieldElement.soundsDirectory = null;
      MathfieldElement.locale = locale;
      const made = new MathfieldElement();
      made.value = first.current.value;
      made.readOnly = first.current.readOnly;
      made.smartFence = true;
      made.mathVirtualKeyboardPolicy = "auto";
      made.setAttribute("aria-label", label);
      made.className = "fe-math-field";
      const typed = () => input(made.value);
      const keys = (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          enter();
        }
        if (
          event.key === "Escape" &&
          made.mode !== "latex" &&
          first.current.escapes
        ) {
          event.preventDefault();
          event.stopPropagation();
          escape();
        }
      };
      made.addEventListener("input", typed);
      made.addEventListener("keydown", keys, { capture: true });
      host.current?.append(made);
      field.current = made;
      if (first.current.focused) made.focus();
      unmount = () => {
        made.removeEventListener("input", typed);
        made.removeEventListener("keydown", keys, { capture: true });
        made.remove();
        field.current = null;
      };
    });
    return () => {
      left = true;
      unmount();
    };
  }, [locale, label]);

  useEffect(() => {
    if (field.current) field.current.readOnly = readOnly;
  }, [readOnly]);

  return <div ref={host} className="min-w-0 flex-1" />;
}
