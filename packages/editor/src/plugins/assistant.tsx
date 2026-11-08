import type {
  ProposedKind,
  QuestionProposal,
  ReadingLevel,
} from "@faridalms/domain/assistant";
import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { LexicalEditor, NodeKey } from "lexical";

import { Dialog } from "@base-ui/react/dialog";
import { QUESTION_COUNTS, READING_LEVELS } from "@faridalms/domain/assistant";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $parseSerializedNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from "lexical";
import { Check, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { EditorAssistant, EditorAssistantRequest } from "../context";
import type { EditorStrings } from "../strings";

import { $anchorFor } from "../blocks";
import { useEditorEnvironment } from "../context";
import { cx, ToolButton } from "../ui";

export interface AssistantStrings {
  /** What the help is called on the bar and over its panel. */
  assistant: string;
  /** What leaves and what never does, naming the school's provider. */
  assistantSends: (provider: string) => string;
  assistantSuggest: string;
  assistantSuggestHint: string;
  assistantLevel: string;
  assistantLevelHint: string;
  assistantFromSelection: string;
  assistantFromDocument: string;
  assistantNoText: string;
  assistantCount: string;
  assistantReadingLevel: string;
  assistantLevels: Record<ReadingLevel, string>;
  assistantAsk: string;
  assistantStop: string;
  assistantWriting: string;
  assistantWaiting: (seconds: number) => string;
  assistantRemaining: (count: number) => string;
  assistantAdd: string;
  assistantAdded: string;
  assistantDismiss: string;
  assistantReplace: string;
  assistantDiscard: string;
  assistantCorrect: string;
  assistantAccepts: (answers: string) => string;
  assistantExplanation: string;
  assistantChanged: string;
  assistantCheck: string;
  assistantClose: string;
}

type Task = "questions" | "level";

/** Opens the help panel, on what is selected or on the whole document. */
export const OPEN_ASSISTANT_COMMAND = createCommand<{
  task: Task;
  selection: boolean;
}>("FARIDA_OPEN_ASSISTANT");

/** Top-level blocks whose words a rewrite takes the place of. */
const REWRITABLE = new Set(["paragraph", "heading", "quote", "list"]);

interface Source {
  /** The top-level blocks the request is made of, empty for the whole document. */
  keys: NodeKey[];
  /** Of those, the ones a rewrite replaces. */
  rewritable: NodeKey[];
  /** Where questions the teacher adds go, each after the one before. */
  anchor: NodeKey | null;
}

/** What is selected, as the top-level blocks it touches, in order. */
function $selectedSource(): Source {
  const selection = $getSelection();
  const blocks = new Map<NodeKey, string>();
  if ($isRangeSelection(selection) && !selection.isCollapsed())
    for (const node of selection.getNodes()) {
      const top = node.getTopLevelElement();
      if (top) blocks.set(top.getKey(), top.getType());
    }
  const keys = [...blocks.keys()].toSorted(
    (one, other) =>
      ($getNodeByKey(one)?.getIndexWithinParent() ?? 0) -
      ($getNodeByKey(other)?.getIndexWithinParent() ?? 0),
  );
  return {
    keys,
    rewritable: keys.filter((key) => REWRITABLE.has(blocks.get(key) ?? "")),
    anchor: keys.at(-1) ?? $anchorFor("choiceQuestion")?.getKey() ?? null,
  };
}

/** The document, or the blocks of it named, as the server reads a document. */
function contentOf(editor: LexicalEditor, keys: NodeKey[]): ContentDocument {
  const whole = editor.getEditorState().toJSON() as unknown as ContentDocument;
  if (keys.length === 0) return whole;
  const indices = editor
    .getEditorState()
    .read(() => keys.map((key) => $getNodeByKey(key)?.getIndexWithinParent()));
  const children = whole.root.children ?? [];
  return {
    root: {
      ...whole.root,
      children: indices.flatMap((index) =>
        index === undefined ? [] : (children[index] ?? []),
      ),
    },
  };
}

const ARABIC = /[؀-ۿ]/g;
const LATIN = /[a-z]/gi;

/** The language a document is written in, as its letters say when it does not. */
function languageOf(document: ContentDocument, set?: ContentLocale) {
  if (set) return set;
  const text = JSON.stringify(document.root);
  return (text.match(ARABIC)?.length ?? 0) > (text.match(LATIN)?.length ?? 0)
    ? "ar"
    : "en";
}

const KIND_LABEL: Record<ProposedKind, (strings: EditorStrings) => string> = {
  choice: (s) => s.questionChoice,
  multiple: (s) => s.questionChoice,
  text: (s) => s.questionTyped,
  written: (s) => s.questionWritten,
  ordering: (s) => s.questionOrdering,
  matching: (s) => s.questionMatching,
  gaps: (s) => s.questionGaps,
};

const buttonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50 max-md:h-10";
const primaryButton = cx(
  buttonClass,
  "bg-primary text-primary-foreground hover:bg-primary/90",
);
const secondaryButton = cx(buttonClass, "border hover:bg-accent");
const fieldClass =
  "h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

interface ProposalProps {
  question: QuestionProposal;
  added: boolean;
  onAdd: () => void;
  onDismiss: () => void;
}

/** A proposed question as its teacher reads it before adding it, answers shown. */
function Proposal({ question, added, onAdd, onDismiss }: ProposalProps) {
  const { strings } = useEditorEnvironment();
  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <span className="text-xs font-medium text-muted-foreground">
        {KIND_LABEL[question.kind](strings)}
      </span>
      <p dir="auto" className="text-sm font-medium">
        {question.kind === "gaps" ? question.passage : question.prompt}
      </p>
      {question.options.length > 0 ? (
        <ul className="grid gap-1 text-sm">
          {question.options.map((option, index) => (
            <li key={index} dir="auto" className="flex items-center gap-1.5">
              {option.correct ? (
                <Check
                  className="size-4 text-success"
                  aria-label={strings.assistantCorrect}
                />
              ) : (
                <span className="size-4" aria-hidden />
              )}
              {option.text}
            </li>
          ))}
        </ul>
      ) : null}
      {question.kind === "text" && question.answers.length > 0 ? (
        <p dir="auto" className="text-sm text-muted-foreground">
          {strings.assistantAccepts(question.answers.join(" · "))}
        </p>
      ) : null}
      {question.items.length > 0 ? (
        <ol className="list-decimal ps-5 text-sm">
          {question.items.map((item, index) => (
            <li key={index} dir="auto">
              {item}
            </li>
          ))}
        </ol>
      ) : null}
      {question.pairs.length > 0 ? (
        <ul className="grid gap-1 text-sm">
          {question.pairs.map((pair, index) => (
            <li key={index} dir="auto">
              {pair.prompt} — {pair.answer}
            </li>
          ))}
        </ul>
      ) : null}
      {question.explanation ? (
        <p dir="auto" className="text-xs text-muted-foreground">
          {strings.assistantExplanation}: {question.explanation}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={added}
          onClick={onAdd}
        >
          {added ? strings.assistantAdded : strings.assistantAdd}
        </button>
        {added ? null : (
          <button type="button" className={secondaryButton} onClick={onDismiss}>
            {strings.assistantDismiss}
          </button>
        )}
      </div>
    </li>
  );
}

interface Found {
  question: QuestionProposal;
  node: ContentNode;
  added: boolean;
}

interface PanelProps {
  assistant: EditorAssistant;
  task: Task;
  source: Source;
  language?: ContentLocale;
  onTaskChange: (task: Task) => void;
  onClose: () => void;
}

/**
 * Asks the model and shows what comes back as it is written: questions to
 * read and add one by one, or a rewrite to put in place of the text or
 * discard. Nothing enters the document until the teacher says so, and
 * closing the panel stops the request.
 */
function AssistantPanel({
  assistant,
  task,
  source,
  language,
  onTaskChange,
  onClose,
}: PanelProps) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const id = useId();
  const [count, setCount] = useState<(typeof QUESTION_COUNTS)[number]>(5);
  const [level, setLevel] = useState<ReadingLevel>("upper_primary");
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [rewrite, setRewrite] = useState("");
  const [paragraphs, setParagraphs] = useState<string[] | null>(null);
  const request = useRef<AbortController | null>(null);
  const anchor = useRef(source.anchor);
  useEffect(() => () => request.current?.abort(), []);

  const levelKeys = source.keys.length > 0 ? source.rewritable : [];
  const nothing = task === "level" && levelKeys.length === 0;

  const ask = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRunning(true);
    setError(null);
    setNote(strings.assistantWriting);
    setFound([]);
    setRewrite("");
    setParagraphs(null);
    const content = contentOf(
      editor,
      task === "level" ? levelKeys : source.keys,
    );
    const asked: EditorAssistantRequest =
      task === "questions"
        ? {
            task,
            content,
            language: languageOf(content, language),
            count,
          }
        : { task, content, language: languageOf(content, language), level };
    try {
      for await (const event of assistant.run(asked, controller.signal)) {
        if (controller.signal.aborted) break;
        if (event.type === "started")
          setNote(strings.assistantRemaining(event.remaining));
        else if (event.type === "waiting")
          setNote(strings.assistantWaiting(event.seconds));
        else if (event.type === "text")
          setRewrite((current) => current + event.text);
        else if (event.type === "question")
          setFound((current) => [
            ...current,
            { question: event.question, node: event.node, added: false },
          ]);
        else if (event.type === "levelled") setParagraphs(event.paragraphs);
        else if (event.type === "error")
          setError(assistant.describe({ message: event.code }));
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(assistant.describe(failure));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setRunning(false);
      }
    }
  };

  const stop = () => {
    request.current?.abort();
    request.current = null;
    setRunning(false);
    setNote(null);
  };

  const add = (index: number) => {
    const item = found[index];
    if (!item) return;
    editor.update(
      () => {
        const question = $parseSerializedNode(item.node);
        const at = anchor.current ? $getNodeByKey(anchor.current) : null;
        if (!at?.isAttached()) $getRoot().append(question);
        else if ($isParagraphNode(at) && at.getTextContentSize() === 0)
          at.replace(question);
        else at.insertAfter(question);
        anchor.current = question.getKey();
      },
      { discrete: true },
    );
    setFound((current) =>
      current.map((entry, at) =>
        at === index ? { ...entry, added: true } : entry,
      ),
    );
  };

  const replace = () => {
    if (!paragraphs) return;
    const attached = editor
      .getEditorState()
      .read(
        () =>
          levelKeys.length > 0 &&
          levelKeys.every((key) => $getNodeByKey(key)?.isAttached()),
      );
    if (!attached) {
      setError(strings.assistantChanged);
      return;
    }
    editor.update(
      () => {
        const nodes = levelKeys.map((key) => $getNodeByKey(key));
        const last = nodes.at(-1);
        if (!last) return;
        let after = last;
        for (const words of paragraphs) {
          const paragraph = $createParagraphNode().append(
            $createTextNode(words),
          );
          after.insertAfter(paragraph);
          after = paragraph;
        }
        for (const node of nodes) node?.remove();
      },
      { discrete: true },
    );
    onClose();
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          data-editor-prompt=""
          className="fixed start-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] -translate-y-1/2 grid-rows-[auto_1fr_auto] gap-4 overflow-hidden rounded-xl border bg-background p-5 shadow-xl outline-none ltr:-translate-x-1/2 rtl:translate-x-1/2"
        >
          <div className="grid gap-1">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="size-4" aria-hidden />
              {strings.assistant}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              {strings.assistantSends(assistant.provider)}
            </Dialog.Description>
          </div>
          <div className="grid min-h-0 content-start gap-4 overflow-y-auto">
            <fieldset className="grid gap-2" disabled={running}>
              <legend className="sr-only">{strings.assistant}</legend>
              {(
                [
                  {
                    choice: "questions",
                    name: strings.assistantSuggest,
                    hint: strings.assistantSuggestHint,
                  },
                  {
                    choice: "level",
                    name: strings.assistantLevel,
                    hint: strings.assistantLevelHint,
                  },
                ] as const
              ).map((option) => (
                <div
                  key={option.choice}
                  className="flex items-start gap-2 rounded-md border p-2.5 has-checked:border-primary has-checked:bg-accent"
                >
                  <input
                    id={`${id}-${option.choice}`}
                    type="radio"
                    name={`${id}-task`}
                    className="mt-1"
                    aria-describedby={`${id}-${option.choice}-hint`}
                    checked={task === option.choice}
                    onChange={() => onTaskChange(option.choice)}
                  />
                  <div className="grid gap-0.5">
                    <label
                      htmlFor={`${id}-${option.choice}`}
                      className="cursor-pointer text-sm font-medium"
                    >
                      {option.name}
                    </label>
                    <span
                      id={`${id}-${option.choice}-hint`}
                      className="text-xs text-muted-foreground"
                    >
                      {option.hint}
                    </span>
                  </div>
                </div>
              ))}
            </fieldset>
            <p className="text-sm text-muted-foreground">
              {nothing
                ? strings.assistantNoText
                : source.keys.length > 0
                  ? strings.assistantFromSelection
                  : strings.assistantFromDocument}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              {task === "questions" ? (
                <label className="grid gap-1 text-sm" htmlFor={`${id}-count`}>
                  {strings.assistantCount}
                  <select
                    id={`${id}-count`}
                    className={fieldClass}
                    value={count}
                    disabled={running}
                    onChange={(event) =>
                      setCount(
                        Number(
                          event.target.value,
                        ) as (typeof QUESTION_COUNTS)[number],
                      )
                    }
                  >
                    {QUESTION_COUNTS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="grid gap-1 text-sm" htmlFor={`${id}-level`}>
                  {strings.assistantReadingLevel}
                  <select
                    id={`${id}-level`}
                    className={fieldClass}
                    value={level}
                    disabled={running}
                    onChange={(event) =>
                      setLevel(event.target.value as ReadingLevel)
                    }
                  >
                    {READING_LEVELS.map((value) => (
                      <option key={value} value={value}>
                        {strings.assistantLevels[value]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {running ? (
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={stop}
                >
                  {strings.assistantStop}
                </button>
              ) : (
                <button
                  type="button"
                  className={primaryButton}
                  disabled={nothing}
                  onClick={() => void ask()}
                >
                  <Sparkles aria-hidden className="size-4" />
                  {strings.assistantAsk}
                </button>
              )}
            </div>
            <div aria-live="polite" className="grid gap-1 text-sm">
              {note && !error ? (
                <p className="text-muted-foreground">{note}</p>
              ) : null}
              {error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            {task === "questions" && found.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {strings.assistantCheck}
                </p>
                <ul className="grid gap-3">
                  {found.map((item, index) => (
                    <Proposal
                      key={item.question.prompt + index}
                      question={item.question}
                      added={item.added}
                      onAdd={() => add(index)}
                      onDismiss={() =>
                        setFound((current) =>
                          current.filter((_, at) => at !== index),
                        )
                      }
                    />
                  ))}
                </ul>
              </>
            ) : null}
            {task === "level" && (rewrite || paragraphs) ? (
              <div
                dir="auto"
                className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap"
              >
                {paragraphs
                  ? paragraphs.map((words, index) => <p key={index}>{words}</p>)
                  : rewrite}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {task === "level" && paragraphs && !running ? (
              <>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => {
                    setParagraphs(null);
                    setRewrite("");
                  }}
                >
                  {strings.assistantDiscard}
                </button>
                <button
                  type="button"
                  className={primaryButton}
                  onClick={replace}
                >
                  {strings.assistantReplace}
                </button>
              </>
            ) : (
              <Dialog.Close className={secondaryButton}>
                {strings.assistantClose}
              </Dialog.Close>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Writing help on the floating bar, for the text selected. */
export function AssistantTool() {
  const [editor] = useLexicalComposerContext();
  const { assistant, strings } = useEditorEnvironment();
  if (!assistant) return null;
  return (
    <ToolButton
      label={strings.assistant}
      onClick={() =>
        editor.dispatchCommand(OPEN_ASSISTANT_COMMAND, {
          task: "level",
          selection: true,
        })
      }
    >
      <Sparkles aria-hidden />
    </ToolButton>
  );
}

export interface AssistantPluginProps {
  /** The language the document is written in; without it, read from its words. */
  language?: ContentLocale;
}

/**
 * The school's language model, where the host offers it: the panel the
 * floating bar and the insert menu open, on the selection or the whole
 * document.
 */
export function AssistantPlugin({ language }: AssistantPluginProps) {
  const [editor] = useLexicalComposerContext();
  const { assistant } = useEditorEnvironment();
  const [open, setOpen] = useState<{
    task: Task;
    source: Source;
    at: number;
  } | null>(null);
  useEffect(
    () =>
      editor.registerCommand(
        OPEN_ASSISTANT_COMMAND,
        ({ task, selection }) => {
          if (!assistant) return false;
          const source = editor.getEditorState().read(() => {
            const selected = $selectedSource();
            return selection
              ? selected
              : { keys: [], rewritable: [], anchor: selected.anchor };
          });
          setOpen((current) => ({
            task:
              task === "level" && source.rewritable.length === 0
                ? "questions"
                : task,
            source,
            at: (current?.at ?? 0) + 1,
          }));
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, assistant],
  );
  if (!assistant || !open) return null;
  return (
    <AssistantPanel
      key={open.at}
      assistant={assistant}
      task={open.task}
      source={open.source}
      language={language}
      onTaskChange={(task) =>
        setOpen((current) => (current ? { ...current, task } : current))
      }
      onClose={() => setOpen(null)}
    />
  );
}
