import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tagHighlighter, tags } from "@lezer/highlight";

import type { EditorLanguage } from "./CodeRunner";

/** What the editor can colour: what runs, and a page's styles. */
export type CodeLanguage = EditorLanguage | "css";

// The same classes the lesson's own code blocks are coloured with, so code
// looks alike whether a student reads it or edits it.
const highlighter = tagHighlighter([
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.definitionKeyword,
      tags.moduleKeyword,
      tags.operatorKeyword,
      tags.self,
    ],
    class: "fe-token-keyword",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    class: "fe-token-string",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    class: "fe-token-number",
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.className,
      tags.standard(tags.variableName),
    ],
    class: "fe-token-function",
  },
  { tag: [tags.propertyName, tags.attributeName], class: "fe-token-attr" },
  { tag: tags.comment, class: "fe-token-comment" },
  { tag: tags.operator, class: "fe-token-operator" },
  { tag: [tags.punctuation, tags.bracket], class: "fe-token-punctuation" },
]);

const theme = EditorView.theme({
  "&": { fontSize: "0.875rem", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    lineHeight: "1.6",
    fontVariantLigatures: "none",
  },
  ".cm-content": { padding: "0.75rem 0", caretColor: "var(--foreground)" },
  ".cm-line": { padding: "0 1rem 0 0.75rem" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--muted-foreground)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.25rem 0 0.75rem" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in oklab, var(--primary) 18%, transparent)",
  },
  ".cm-error-line": {
    backgroundColor: "color-mix(in oklab, var(--destructive) 12%, transparent)",
  },
});

const setErrorLine = StateEffect.define<number | null>();

const errorLine = StateField.define({
  create: () => Decoration.none,
  update(lines, transaction) {
    if (transaction.docChanged) return Decoration.none;
    for (const effect of transaction.effects)
      if (effect.is(setErrorLine)) {
        const line = effect.value;
        if (line === null || line < 1 || line > transaction.state.doc.lines)
          return Decoration.none;
        const from = transaction.state.doc.line(line).from;
        return Decoration.set([
          Decoration.line({ class: "cm-error-line" }).range(from),
        ]);
      }
    return lines;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const editing = new Compartment();

const editable = (readOnly: boolean) => [
  EditorState.readOnly.of(readOnly),
  EditorView.editable.of(!readOnly),
];

/** Lets the code be changed, or only read, as once a question is settled. */
export function setReadOnly(view: EditorView, readOnly: boolean) {
  view.dispatch({ effects: editing.reconfigure(editable(readOnly)) });
}

/** Marks the line an error happened on, until the code changes. */
export function markErrorLine(view: EditorView, line: number | null) {
  view.dispatch({ effects: setErrorLine.of(line) });
}

/** Puts the teacher's code back. */
export function replaceCode(view: EditorView, code: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: code },
  });
}

interface CodeOptions {
  code: string;
  language: CodeLanguage;
  label: string;
  describedBy: string;
  readOnly: boolean;
  onChange: (code: string) => void;
  onRun: () => void;
}

/**
 * Code with its own history and place in it, which an editor can be given
 * in place of what it shows, as when a project turns to another file.
 */
export function createCodeState(options: CodeOptions): EditorState {
  return EditorState.create({
    doc: options.code,
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      indentUnit.of("    "),
      options.language === "python"
        ? python()
        : options.language === "html"
          ? html()
          : options.language === "css"
            ? css()
            : javascript(),
      syntaxHighlighting(highlighter),
      errorLine,
      theme,
      editing.of(editable(options.readOnly)),
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            options.onRun();
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      EditorView.contentAttributes.of({
        "aria-label": options.label,
        "aria-describedby": options.describedBy,
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(update.state.doc.toString());
      }),
    ],
  });
}

/** An editor showing code made with `createCodeState`. */
export function showCode(parent: HTMLElement, state: EditorState): EditorView {
  return new EditorView({ parent, state });
}

export function createCodeEditor(
  parent: HTMLElement,
  options: CodeOptions,
): EditorView {
  return showCode(parent, createCodeState(options));
}
