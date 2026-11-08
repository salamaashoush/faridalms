import type { MathfieldElement } from "mathlive";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type MathField from "./plugins/math-field";
import type { MathFieldProps } from "./plugins/math-field";

interface Loaded {
  Field: typeof MathField;
  Element: typeof MathfieldElement;
}

let loaded: Loaded | null = null;
let locale = "en";
let loading: Promise<void> | null = null;
const waiting = new Set<() => void>();

/**
 * Fetches MathLive and its field, once for the page. MathLive joins the
 * page only where a formula is written.
 */
export function loadMathField(): Promise<void> {
  loading ??= Promise.all([
    import("./plugins/math-field"),
    import("mathlive"),
  ]).then(
    ([field, { MathfieldElement }]) => {
      // The fonts come with the field's stylesheet, so MathLive fetches
      // none of its own, and it makes no sound as keys are pressed.
      MathfieldElement.fontsDirectory = null;
      MathfieldElement.soundsDirectory = null;
      MathfieldElement.locale = locale;
      loaded = { Field: field.default, Element: MathfieldElement };
      for (const done of waiting) done();
    },
    () => {
      // Offline for now: the next field to appear asks again.
      loading = null;
    },
  );
  return loading;
}

/** MathLive speaks one language for the page, the one its fields last asked for. */
function speak(language: string) {
  locale = language;
  if (loaded) loaded.Element.locale = language;
}

const subscribe = (done: () => void) => {
  waiting.add(done);
  return () => waiting.delete(done);
};

export interface MathInputProps extends Omit<
  MathFieldProps,
  "Element" | "typed" | "onReady"
> {
  locale: string;
}

/**
 * A field to write a formula in, as a student answers or a teacher writes.
 * Until MathLive has arrived a plain field stands in its place and keeps
 * every key, which the formula's field then takes as typed.
 */
export function MathInput({ locale: language, ...props }: MathInputProps) {
  const ready = useSyncExternalStore(
    subscribe,
    () => loaded,
    () => null,
  );
  const [waitingFor, setWaitingFor] = useState(() => loaded === null);
  const typed = useRef<HTMLInputElement>(null);
  const focused = useRef(props.focused);
  useLayoutEffect(() => {
    if (focused.current) typed.current?.focus();
  }, []);
  useLayoutEffect(() => speak(language), [language]);
  useEffect(() => {
    void loadMathField();
  }, []);
  return (
    <>
      {ready ? (
        <ready.Field
          {...props}
          Element={ready.Element}
          typed={waitingFor ? typed : null}
          onReady={() => setWaitingFor(false)}
        />
      ) : null}
      {waitingFor ? (
        <div className="min-w-0 flex-1">
          <input
            ref={typed}
            aria-label={props.label}
            defaultValue={props.value}
            readOnly={props.readOnly}
            dir="ltr"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="fe-math-field"
            onChange={(event) => props.onInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                props.onEnter();
              }
              if (event.key === "Escape" && props.onEscape) {
                event.preventDefault();
                event.stopPropagation();
                props.onEscape();
              }
            }}
          />
        </div>
      ) : null}
    </>
  );
}
