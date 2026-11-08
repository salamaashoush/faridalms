import type { MathfieldElement } from "mathlive";

import { Keyboard, SquareFunction } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type MathField from "./plugins/math-field";
import type { MathFieldProps } from "./plugins/math-field";

import { shortcutLabel, ToolButton } from "./ui";

interface Loaded {
  Field: typeof MathField;
  Element: typeof MathfieldElement;
}

let loaded: Loaded | null = null;
let locale = "en";
let items: Readonly<Record<string, string>> = {};
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
      MathfieldElement.strings = { [locale]: items };
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
function speak(language: string, words: Readonly<Record<string, string>>) {
  locale = language;
  items = words;
  if (!loaded) return;
  loaded.Element.locale = language;
  loaded.Element.strings = { [language]: words };
}

const subscribe = (done: () => void) => {
  waiting.add(done);
  return () => waiting.delete(done);
};

export interface MathInputLabels {
  /** Shows or hides MathLive's keyboard of symbols. */
  keyboard: string;
  /** Opens MathLive's menu of what can be done to the formula. */
  menu: string;
  /**
   * MathLive's menu items by MathLive's own keys, for those its catalogue
   * leaves untranslated.
   */
  items: Readonly<Record<string, string>>;
}

export interface MathInputProps extends Omit<
  MathFieldProps,
  "Element" | "typed" | "onReady"
> {
  locale: string;
  labels: MathInputLabels;
}

/**
 * A field to write a formula in, as a student answers or a teacher writes.
 * Until MathLive has arrived a plain field stands in its place and keeps
 * every key, which the formula's field then takes as typed.
 */
export function MathInput({
  locale: language,
  labels,
  ...props
}: MathInputProps) {
  const ready = useSyncExternalStore(
    subscribe,
    () => loaded,
    () => null,
  );
  const [waitingFor, setWaitingFor] = useState(() => loaded === null);
  const [field, setField] = useState<MathfieldElement | null>(null);
  const typed = useRef<HTMLInputElement>(null);
  const keyboardShown = useSyncExternalStore(
    useCallback(
      (done: () => void) => {
        const keyboard = ready ? window.mathVirtualKeyboard : null;
        keyboard?.addEventListener("virtual-keyboard-toggle", done);
        return () =>
          keyboard?.removeEventListener("virtual-keyboard-toggle", done);
      },
      [ready],
    ),
    () => Boolean(ready && window.mathVirtualKeyboard.visible),
    () => false,
  );
  // MathLive's own commands, the ones its hidden toggles and Alt+Space give.
  const command = (name: "toggleVirtualKeyboard" | "toggleContextMenu") => {
    if (!field) return;
    field.focus();
    field.executeCommand(name);
  };
  const focused = useRef(props.focused);
  useLayoutEffect(() => {
    if (focused.current) typed.current?.focus();
  }, []);
  useLayoutEffect(
    () => speak(language, labels.items),
    [language, labels.items],
  );
  useEffect(() => {
    void loadMathField();
  }, []);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5">
      {ready ? (
        <ready.Field
          {...props}
          Element={ready.Element}
          typed={waitingFor ? typed : null}
          onReady={(made) => {
            setField(made);
            setWaitingFor(false);
          }}
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
      {props.readOnly ? null : (
        <>
          <ToolButton
            label={labels.keyboard}
            shortcut={shortcutLabel("Alt+Shift+Space")}
            active={keyboardShown}
            disabled={!field}
            onClick={() => command("toggleVirtualKeyboard")}
          >
            <Keyboard aria-hidden />
          </ToolButton>
          <ToolButton
            label={labels.menu}
            shortcut={shortcutLabel("Alt+Space")}
            disabled={!field}
            onClick={() => command("toggleContextMenu")}
          >
            <SquareFunction aria-hidden />
          </ToolButton>
        </>
      )}
    </div>
  );
}
