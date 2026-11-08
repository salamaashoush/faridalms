import type { MathfieldElement } from "mathlive";
import type { RefObject } from "react";

import "mathlive/fonts.css";
import { useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";

export interface MathFieldProps {
  value: string;
  label: string;
  onInput: (latex: string) => void;
  onEnter: () => void;
  onEscape?: () => void;
  readOnly?: boolean;
  /** Takes focus as it appears, for a formula opened to be written. */
  focused?: boolean;
  /** MathLive's field, loaded by the time this one is drawn. */
  Element: typeof MathfieldElement;
  /** The plain field that stood in while MathLive loaded, with what was typed there. */
  typed?: RefObject<HTMLInputElement | null> | null;
  /** The field is on the page and has taken over from the stand-in. */
  onReady?: (field: MathfieldElement) => void;
}

/**
 * MathLive's field for writing a formula: typed as LaTeX or as it looks,
 * with its own keyboard of symbols on a touch screen. Enter and Escape go
 * to the page, except Escape in the middle of a LaTeX command, which the
 * field cancels itself.
 */
export default function MathField({
  value,
  label,
  onInput,
  onEnter,
  onEscape,
  readOnly = false,
  focused = false,
  Element,
  typed = null,
  onReady,
}: MathFieldProps) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const input = useEffectEvent(onInput);
  const enter = useEffectEvent(onEnter);
  const escape = useEffectEvent(() => onEscape?.());
  const ready = useEffectEvent((made: MathfieldElement) => onReady?.(made));
  // The field is made once; what is typed lives in it.
  const first = useRef({
    value,
    readOnly,
    focused,
    typed,
    escapes: onEscape !== undefined,
  });

  // Made before the browser paints, in the same task the stand-in goes,
  // so no key falls between the two.
  useLayoutEffect(() => {
    const made = new Element();
    made.value = first.current.value;
    made.readOnly = first.current.readOnly;
    made.smartFence = true;
    made.mathVirtualKeyboardPolicy = "auto";
    made.setAttribute("aria-label", label);
    made.className = "fe-math-field";
    let last = made.value;
    const sent = () => {
      last = made.value;
      input(made.value);
    };
    // MathLive reports what was typed a task later, and not at all for keys
    // typed just after its menu shuts, so what the field holds is handed
    // over as it is left too.
    const settle = () => {
      if (made.value !== last) sent();
    };
    const keys = (event: KeyboardEvent) => {
      // While MathLive's menu is open, inside the field, the keys are the
      // menu's, wherever focus is.
      if (made.shadowRoot?.querySelector('[part="ui-menu-container"]')) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        settle();
        enter();
      }
      if (
        event.key === "Escape" &&
        made.mode !== "latex" &&
        first.current.escapes
      ) {
        event.preventDefault();
        event.stopPropagation();
        settle();
        escape();
      }
    };
    made.addEventListener("input", sent);
    made.addEventListener("keydown", keys, { capture: true });
    host.current?.append(made);
    field.current = made;
    // Gone once the field has taken over, so a field made again later
    // types nothing twice.
    const standIn = first.current.typed?.current ?? null;
    // MathLive's own focus() takes focus a moment later, and not at all if
    // focus has moved meanwhile, as it does when the stand-in goes. The
    // platform's focus, which Tab gives it, moves it now.
    if (
      first.current.focused ||
      (standIn !== null && standIn === document.activeElement)
    )
      HTMLElement.prototype.focus.call(made, { preventScroll: true });
    if (standIn && standIn.value !== first.current.value) {
      // Keys typed after what the formula held are typed again, through
      // the field's own shortcuts; any other change is taken as LaTeX.
      if (standIn.value.startsWith(first.current.value))
        made.executeCommand([
          "typedText",
          standIn.value.slice(first.current.value.length),
          { focus: false, feedback: false, simulateKeystroke: true },
        ]);
      else made.value = standIn.value;
      sent();
    }
    ready(made);
    return () => {
      settle();
      made.removeEventListener("input", sent);
      made.removeEventListener("keydown", keys, { capture: true });
      made.remove();
      field.current = null;
    };
  }, [Element, label]);

  useEffect(() => {
    if (field.current) field.current.readOnly = readOnly;
  }, [readOnly]);

  return <div ref={host} className="min-w-0 flex-1" />;
}
