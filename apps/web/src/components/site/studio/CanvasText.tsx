import type { SectionType, SiteLocale } from "@faridalms/domain/site-sections";
import type { KeyboardEvent } from "react";

import { isEmphasised, toggleEmphasis } from "@faridalms/domain/site-emphasis";
import { Button } from "@faridalms/ui/button";
import { Highlighter } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import * as m from "~/i18n/messages";

import type { EditableTextProps } from "../render/parts";
import type { DrawnRun, TextRule } from "./canvas-text";

import {
  drawnOffset,
  drawnRuns,
  nearLimit,
  storedFrom,
  storedOffset,
  typedWords,
  textRule,
  typedAfterEmphasis,
} from "./canvas-text";
import { FIELD_LABEL } from "./labels";

/** The selected section, as its words typed on the canvas need it. */
export interface SectionTexts {
  type: SectionType;
  /** The section's name, which each of its words fields is called by. */
  label: string;
  locale: SiteLocale;
  /** A step of its own is undone alone, as a toggled emphasis is; typing joins the field's last. */
  edit: (field: string, value: string, step?: "own") => void;
  undo: () => void;
  redo: () => void;
  /** Stops typing and hands the keyboard back to the section. */
  leave: () => void;
  setActive: (field: string | null) => void;
}

export const SectionTextContext = createContext<SectionTexts | null>(null);

interface Caret {
  anchor: number;
  focus: number;
}

/** The drawn words of an element, set apart where they sit inside the heading's emphasis. */
function readRuns(element: HTMLElement): DrawnRun[] {
  const runs: DrawnRun[] = [];
  const add = (words: string, emphasised: boolean) => {
    const last = runs.at(-1);
    if (last && last.emphasised === emphasised) last.words += words;
    else if (words) runs.push({ words, emphasised });
  };
  const walk = (node: Node, emphasised: boolean) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE)
        add(child.textContent ?? "", emphasised);
      // The browser keeps a line break at the very end to hold an empty line open.
      else if (child.nodeName === "BR") {
        if (child !== element.lastChild) add("\n", emphasised);
      } else walk(child, emphasised || child.nodeName === "EM");
    }
  };
  walk(element, false);
  return runs;
}

/**
 * Draws the words as the renderer would: plain words, and the heading's
 * emphasis. A line break at the very end draws no line of its own, so a
 * closing one is held open for the caret, as the browser does itself.
 */
function draw(element: HTMLElement, runs: readonly DrawnRun[]) {
  const nodes: Node[] = runs.map((run) => {
    if (!run.emphasised) return document.createTextNode(run.words);
    const em = document.createElement("em");
    em.className = "site-em";
    em.textContent = run.words;
    return em;
  });
  if (runs.at(-1)?.words.endsWith("\n"))
    nodes.push(document.createElement("br"));
  element.replaceChildren(...nodes);
}

function offsetIn(element: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(element, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

function readCaret(element: HTMLElement): Caret | null {
  const selection = getSelection();
  if (
    !selection?.anchorNode ||
    !selection.focusNode ||
    !element.contains(selection.anchorNode) ||
    !element.contains(selection.focusNode)
  )
    return null;
  return {
    anchor: offsetIn(element, selection.anchorNode, selection.anchorOffset),
    focus: offsetIn(element, selection.focusNode, selection.focusOffset),
  };
}

function pointAt(element: HTMLElement, at: number): [Node, number] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let last: Text | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (at <= seen + text.length) return [text, at - seen];
    seen += text.length;
    last = text;
  }
  return last ? [last, last.length] : [element, 0];
}

function placeCaret(element: HTMLElement, caret: Caret) {
  const length = element.textContent.length;
  const [anchorNode, anchorOffset] = pointAt(
    element,
    Math.min(caret.anchor, length),
  );
  const [focusNode, focusOffset] = pointAt(
    element,
    Math.min(caret.focus, length),
  );
  getSelection()?.setBaseAndExtent(
    anchorNode,
    anchorOffset,
    focusNode,
    focusOffset,
  );
}

const isCommand = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && !event.altKey;

interface FloatProps {
  element: HTMLElement;
  emphasis: boolean;
  pressed: boolean;
  counter: string | null;
  onEmphasise: () => void;
}

/**
 * Beside the words being typed: the Emphasise control for a pointer, and
 * the count left near the limit. It never takes focus from the words.
 */
function Float({
  element,
  emphasis,
  pressed,
  counter,
  onEmphasise,
}: FloatProps) {
  const [place, setPlace] = useState<{ top: number; left: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    const measure = () => {
      const selection = getSelection();
      const range =
        selection?.rangeCount && element.contains(selection.anchorNode)
          ? selection.getRangeAt(0)
          : null;
      const box = range?.getBoundingClientRect();
      const anchor =
        box && box.width + box.height > 0
          ? box
          : element.getBoundingClientRect();
      setPlace({ top: Math.max(4, anchor.top - 44), left: anchor.left });
    };
    measure();
    document.addEventListener("selectionchange", measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("selectionchange", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [element]);
  if (!place || (!emphasis && !counter)) return null;
  return createPortal(
    <div
      aria-hidden
      className="fixed z-50 flex items-center gap-2 rounded-lg bg-[#111827] p-1 font-sans text-xs text-white shadow-lg"
      style={{ top: place.top, left: place.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {emphasis ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          tabIndex={-1}
          aria-pressed={pressed}
          title={m.siteEmphasiseKeys()}
          className="text-white hover:bg-white/15 hover:text-white aria-pressed:bg-white/20"
          onClick={onEmphasise}
        >
          <Highlighter aria-hidden />
          {m.siteEmphasise()}
        </Button>
      ) : null}
      {counter ? <span className="px-1.5 tabular-nums">{counter}</span> : null}
    </div>,
    document.body,
  );
}

/**
 * One of the selected section's words fields, typed in where the page draws
 * it. The element is the renderer's own, drawn with the same words and
 * emphasis; React leaves its words to the browser while it is typed in, and
 * every change goes to the page through the same edit, and the same undo,
 * as the panel's field.
 */
export function CanvasText({
  tag: Tag,
  field,
  value,
  emphasis,
  className,
}: EditableTextProps) {
  const section = useContext(SectionTextContext);
  const ref = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState<HTMLElement | null>(null);
  const pending = useRef<Caret | null>(null);
  const before = useRef<Caret | null>(null);
  const pointer = useRef(false);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState<Caret | null>(null);
  const counterId = useId();
  const rule: TextRule = (section && textRule(section.type, field)) ?? {
    max: value.length,
    multiline: false,
  };

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (storedFrom(readRuns(element), emphasis) !== value) {
      const keep =
        pending.current ??
        (document.activeElement === element ? readCaret(element) : null);
      draw(element, drawnRuns(value, emphasis));
      if (keep) placeCaret(element, keep);
    } else if (pending.current) placeCaret(element, pending.current);
    pending.current = null;
  }, [value, emphasis]);

  const edit = useCallback(
    (next: string, after: Caret | null, step?: "own") => {
      const element = ref.current;
      if (!element || !section) return;
      if (next.length > rule.max) {
        draw(element, drawnRuns(value, emphasis));
        placeCaret(
          element,
          before.current ?? { anchor: value.length, focus: value.length },
        );
        return;
      }
      if (storedFrom(readRuns(element), emphasis) !== next || next === value) {
        draw(element, drawnRuns(next, emphasis));
        if (after) placeCaret(element, after);
      } else pending.current = after;
      if (next !== value) section.edit(field, next, step);
    },
    [section, field, value, emphasis, rule.max],
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || !section) return undefined;
    const onBeforeInput = (event: InputEvent) => {
      before.current = readCaret(element);
      if (event.inputType === "historyUndo") {
        event.preventDefault();
        section.undo();
      } else if (event.inputType === "historyRedo") {
        event.preventDefault();
        section.redo();
      } else if (event.inputType.startsWith("format")) event.preventDefault();
      else if (
        event.inputType === "insertParagraph" ||
        event.inputType === "insertLineBreak"
      ) {
        event.preventDefault();
        const at = before.current;
        if (!rule.multiline || !at) return;
        const plain = element.textContent;
        const start = Math.min(at.anchor, at.focus);
        const end = Math.max(at.anchor, at.focus);
        const runs = readRuns(element);
        const next = [
          ...cut(runs, 0, start),
          { words: "\n", emphasised: false },
          ...cut(runs, end, plain.length),
        ];
        edit(storedFrom(next, emphasis), {
          anchor: start + 1,
          focus: start + 1,
        });
      }
    };
    element.addEventListener("beforeinput", onBeforeInput);
    return () => element.removeEventListener("beforeinput", onBeforeInput);
  }, [section, edit, emphasis, rule.multiline]);

  useEffect(() => {
    if (!focused) return undefined;
    const track = () => {
      const element = ref.current;
      if (element) setCaret(readCaret(element));
    };
    track();
    document.addEventListener("selectionchange", track);
    return () => document.removeEventListener("selectionchange", track);
  }, [focused]);

  if (!section) return <Tag className={className}>{value}</Tag>;

  const toggle = () => {
    const element = ref.current;
    const at = element ? readCaret(element) : null;
    if (!element || !at) return;
    const start = Math.min(at.anchor, at.focus);
    const end = Math.max(at.anchor, at.focus);
    const result = toggleEmphasis(
      value,
      storedOffset(value, start, true),
      storedOffset(value, end, true),
    );
    if (!result || result.text.length > rule.max) return;
    const from = drawnOffset(result.text, result.start, true);
    const to = drawnOffset(result.text, result.end, true);
    const backward = at.anchor > at.focus;
    edit(
      result.text,
      backward ? { anchor: to, focus: from } : { anchor: from, focus: to },
      "own",
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const key = event.key.toLowerCase();
    // The key's place, not its letter: on an Arabic layout the I key types ه.
    if (
      emphasis &&
      isCommand(event) &&
      event.code === "KeyI" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      toggle();
    } else if (isCommand(event) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) section.redo();
      else section.undo();
    } else if (isCommand(event) && key === "y") {
      event.preventDefault();
      section.redo();
    } else if (event.key === "Escape") {
      event.preventDefault();
      section.leave();
    } else if (event.key === "Enter" && !rule.multiline) {
      event.preventDefault();
      section.leave();
    } else if (event.key === "Tab" && !isCommand(event) && !event.altKey) {
      const own = event.currentTarget;
      const all = [
        ...(own
          .closest("[data-section]")
          ?.querySelectorAll<HTMLElement>("[data-canvas-text]") ?? []),
      ];
      const next = all[all.indexOf(own) + (event.shiftKey ? -1 : 1)];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }
  };

  const near = nearLimit(value.length, rule);
  const counter = near
    ? m.siteCharactersLeft({ count: Math.max(0, rule.max - value.length) })
    : null;
  const start = caret ? Math.min(caret.anchor, caret.focus) : 0;
  const end = caret ? Math.max(caret.anchor, caret.focus) : 0;
  const pressed =
    emphasis &&
    isEmphasised(
      value,
      storedOffset(value, start, true),
      storedOffset(value, end, true),
    );
  const fieldLabel = FIELD_LABEL[field]?.() ?? field;
  return (
    <>
      <Tag
        ref={(node: HTMLElement | null) => {
          ref.current = node;
          setMounted(node);
        }}
        data-canvas-text={field}
        role="textbox"
        aria-label={m.siteCanvasText({
          field: fieldLabel,
          section: section.label,
        })}
        aria-multiline={rule.multiline}
        aria-describedby={counter ? counterId : undefined}
        aria-keyshortcuts={emphasis ? "Control+I Meta+I" : undefined}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        spellCheck
        className={className ? `${className} site-editable` : "site-editable"}
        onPointerDown={() => {
          pointer.current = true;
        }}
        onFocus={(event) => {
          const element = event.currentTarget;
          setFocused(true);
          section.setActive(field);
          if (!pointer.current)
            placeCaret(element, {
              anchor: 0,
              focus: element.textContent.length,
            });
          pointer.current = false;
        }}
        onBlur={() => {
          setFocused(false);
          section.setActive(null);
        }}
        onInput={(event) => {
          const element = event.currentTarget;
          const at = readCaret(element);
          const native = event.nativeEvent;
          const runs =
            emphasis && at && at.anchor === at.focus && native.data
              ? typedAfterEmphasis(
                  readRuns(element),
                  at.focus,
                  native.data.length,
                )
              : readRuns(element);
          const typed = storedFrom(runs, emphasis);
          const next = typedWords(typed, rule);
          const removed = typed.length - next.length;
          edit(
            next,
            at && removed
              ? { anchor: at.anchor - removed, focus: at.focus - removed }
              : at,
          );
        }}
        onKeyDown={onKeyDown}
      />
      {focused ? (
        <>
          {createPortal(
            <span id={counterId} className="sr-only" aria-live="polite">
              {counter}
            </span>,
            document.body,
          )}
          {mounted ? (
            <Float
              element={mounted}
              emphasis={emphasis}
              pressed={pressed}
              counter={counter}
              onEmphasise={toggle}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function cut(runs: readonly DrawnRun[], from: number, to: number): DrawnRun[] {
  const kept: DrawnRun[] = [];
  let at = 0;
  for (const run of runs) {
    const start = Math.max(from, at);
    const end = Math.min(to, at + run.words.length);
    if (end > start)
      kept.push({
        words: run.words.slice(start - at, end - at),
        emphasised: run.emphasised,
      });
    at += run.words.length;
  }
  return kept;
}
