import "mathlive/fonts.css";
import { useEffect, useEffectEvent, useRef } from "react";

/**
 * MathLive's field for writing a formula: typed as LaTeX or as it looks,
 * with its own keyboard of symbols on a touch screen. Enter keeps the
 * formula and Escape leaves it, unless the field is in the middle of a
 * LaTeX command, which Escape there cancels.
 */
export default function MathField({
  value,
  locale,
  label,
  onInput,
  onDone,
}: {
  value: string;
  locale: string;
  label: string;
  onInput: (latex: string) => void;
  onDone: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const input = useEffectEvent(onInput);
  const done = useEffectEvent(onDone);
  // The field is made once per formula; what is typed lives in it.
  const first = useRef(value);

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
      const field = new MathfieldElement();
      field.value = first.current;
      field.smartFence = true;
      field.mathVirtualKeyboardPolicy = "auto";
      field.setAttribute("aria-label", label);
      field.className = "fe-math-field";
      const typed = () => input(field.value);
      const keys = (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          done();
        }
        if (event.key === "Escape" && field.mode !== "latex") {
          event.preventDefault();
          event.stopPropagation();
          done();
        }
      };
      field.addEventListener("input", typed);
      field.addEventListener("keydown", keys, { capture: true });
      host.current?.append(field);
      field.focus();
      unmount = () => {
        field.removeEventListener("input", typed);
        field.removeEventListener("keydown", keys, { capture: true });
        field.remove();
      };
    });
    return () => {
      left = true;
      unmount();
    };
  }, [locale, label]);

  return <div ref={host} className="min-w-0 flex-1" />;
}
