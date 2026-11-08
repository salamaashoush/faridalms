import "./prism";
import type { ContentDocument } from "@faridalms/domain/content";
import type { Digits } from "@faridalms/domain/people";
import type { Provider } from "@lexical/yjs";
import type { EditorState } from "lexical";
import type { Doc } from "yjs";

import {
  contentDocumentSchema,
  contentPlainText,
  readingStats,
} from "@faridalms/domain/content";
import { CodePrismExtension } from "@lexical/code-prism";
import { HistoryExtension } from "@lexical/history";
import { registerMarkdownShortcuts } from "@lexical/markdown";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { mergeRegister } from "@lexical/utils";
import {
  $getRoot,
  $parseSerializedNode,
  $setSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  defineExtension,
  KEY_DOWN_COMMAND,
} from "lexical";
import {
  memo,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as v from "valibot";

import type {
  EditorAssistant,
  EditorBank,
  EditorComments,
  EditorShared,
  EditorMentions,
  EditorTools,
  EditorMedia,
  EditorPuzzles,
  EditorStandards,
  EditorStudio,
} from "./context";
import type { EditorStrings } from "./strings";

import { EditorEnvironmentProvider, useEditorEnvironment } from "./context";
import { ShortcutsExtension } from "./extensions";
import { editorFrame } from "./frame";
import { contentExtensions } from "./headless";
import { markdownShortcuts } from "./markdown";
import {
  setArabicNotation,
  setPartPictureUrl,
  setQuestionLabels,
  setQuestionsAsked,
} from "./nodes";
import { AssistantPlugin } from "./plugins/assistant";
import { BankPlugin } from "./plugins/bank";
import { BlockHandlePlugin } from "./plugins/BlockHandle";
import { Cmi5ImportPlugin } from "./plugins/cmi5";
import { CodeBlockPlugin } from "./plugins/code-block";
import { CommentsPlugin } from "./plugins/comments";
import { DiagramPlugin } from "./plugins/diagram";
import { DirectionPlugin } from "./plugins/Direction";
import { DocumentStatus } from "./plugins/document-status";
import { EmbedPlugin } from "./plugins/embed";
import { MediaPlugin } from "./plugins/media";
import { MentionsPlugin } from "./plugins/mentions";
import { NarrationMarksPlugin } from "./plugins/narration";
import { PastePlugin } from "./plugins/paste";
import { PlaceholderPlugin } from "./plugins/Placeholder";
import { QtiImportPlugin } from "./plugins/qti";
import { QuestionGuardPlugin } from "./plugins/questions";
import { SelectionToolbarPlugin } from "./plugins/SelectionToolbar";
import { SharedPlugin } from "./plugins/shared";
import { SlashMenuPlugin } from "./plugins/SlashMenu";
import { TablePlugin } from "./plugins/Table";
import { TableInsertPlugin } from "./plugins/table-size";
import { ToolbarPlugin } from "./plugins/Toolbar";
import { WordImportPlugin } from "./plugins/word";
import { holdSlot } from "./slots";
import { editorTheme } from "./theme";
import { cx } from "./ui";

const QUIET_REPLACE = "fe-quiet-replace";
const TYPING_PAUSE_MS = 200;
const MAX_TYPING_WAIT_MS = 1000;
interface Stats {
  characters: number;
  words: number;
  minutes: number;
}

const statsOf = (document: ContentDocument): Stats => ({
  characters: contentPlainText(document).length,
  ...readingStats(document),
});

/**
 * The counts under the text, kept outside React state so a new count draws
 * the footer that shows it and nothing else in the editor.
 */
function statsStore(initial: Stats) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next: Stats) => {
      if (
        next.characters === current.characters &&
        next.words === current.words &&
        next.minutes === current.minutes
      )
        return;
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type StatsStore = ReturnType<typeof statsStore>;

const useStats = (store: StatsStore) =>
  useSyncExternalStore(store.subscribe, store.get, store.get);

/**
 * Live editing: the document's shared state comes from the provider, which
 * the host builds for a room it holds a ticket for. The server fills a new
 * room from stored content, so the editor never seeds it.
 */
export interface EditorCollaboration {
  id: string;
  providerFactory: (id: string, docs: Map<string, Doc>) => Provider;
  username: string;
  color: string;
}

export interface EditorProps {
  id: string;
  label: string;
  value: ContentDocument;
  onChange: (value: ContentDocument) => void;
  onValidityChange?: (valid: boolean) => void;
  strings: EditorStrings;
  variant?: "document" | "field";
  toolbar?: boolean;
  disabled?: boolean;
  media?: EditorMedia;
  /** The coding studio, which coding questions need. */
  studio?: EditorStudio;
  /** The puzzle designer, which puzzle questions need. */
  puzzles?: EditorPuzzles;
  /** The question bank, to keep questions and ask kept ones. */
  bank?: EditorBank;
  /** The school's standards, to tag questions with. */
  standards?: EditorStandards;
  /** Blocks kept once and shown in many documents. */
  shared?: EditorShared;
  /** Finds whom and what may be mentioned with @. */
  mentions?: EditorMentions;
  /** The school's outside tools, to link to. */
  tools?: EditorTools;
  /** Comments the document's writers leave each other, kept outside it. */
  comments?: EditorComments;
  /** Help from the school's language model, where the host offers it. */
  assistant?: EditorAssistant;
  placeholder?: string;
  initialFocus?: boolean;
  locale?: string;
  /** The digits the school writes Arabic in, for the numbers a document draws. */
  digits?: Digits;
  describedBy?: string;
  collaboration?: EditorCollaboration;
  /**
   * Puts this content in place of what the editor holds each time `at`
   * changes, as an edit, so a live room passes it on to everyone in it.
   * A quiet one is not told back through `onChange`, for a caller that
   * already holds it and keeps its own history.
   */
  replace?: { to: ContentDocument; at: number; quiet?: boolean };
  /** Told whether files are still uploading into the document. */
  onUploadingChange?: (uploading: boolean) => void;
  /** The document may ask questions, as a lesson or quiz does. */
  questions?: boolean;
  /** The document is a form a family fills in, whose questions mark nothing. */
  forms?: boolean;
  /** The document may stop at continue gates; a lesson may, a quiz may not. */
  gates?: boolean;
  /** Each attempt at the quiz may draw questions from the bank. */
  draws?: boolean;
  /** Questions students have started answering, kept from change. */
  lockQuestions?: boolean;
  /** A brief may set part of itself aside as each student's copy. */
  starter?: boolean;
  /** A student's work may acknowledge using an AI tool. */
  aiUse?: boolean;
  /** Blocks and question parts may carry a recording that reads them aloud. */
  narration?: boolean;
  /** Activities only a lesson offers: spoken answers and counting. */
  lessonActivities?: boolean;
  /** Questions may keep how they went until the end or the teacher's word. */
  feedbackTiming?: boolean;
  /** How the school sets a new formula written in Arabic text. */
  arabicMath?: "ltr" | "rtl";
  /** Told once a live document has arrived from its room and is drawn. */
  onSynced?: () => void;
  /** The language the document is written in; without it, read from its words. */
  language?: "en" | "ar";
  /** Young children read the document, so its page is set as they will see it. */
  young?: boolean;
}

export default function Editor({
  strings,
  media,
  studio,
  puzzles,
  bank,
  standards,
  shared,
  mentions,
  tools,
  comments,
  assistant,
  locale,
  digits,
  value,
  collaboration,
  questions = false,
  forms = false,
  gates = questions && !forms,
  draws = false,
  lockQuestions = false,
  starter = false,
  aiUse = false,
  narration = false,
  lessonActivities = false,
  feedbackTiming = false,
  arabicMath = "ltr",
  onSynced,
  ...props
}: EditorProps) {
  // Live editing keeps its own undo history in the shared document, so the
  // local one stays out, and the content comes from the room rather than here.
  const [extension] = useState(() =>
    defineExtension({
      name: "faridalms/editor",
      namespace: "faridalms-content",
      theme: editorTheme,
      $initialEditorState: collaboration ? null : JSON.stringify(value),
      dependencies: [
        ...contentExtensions,
        ...(collaboration ? [] : [HistoryExtension]),
        CodePrismExtension,
        ShortcutsExtension,
      ],
    }),
  );
  const environment = useMemo(
    () => ({
      strings,
      media,
      studio,
      puzzles,
      bank,
      standards,
      shared,
      mentions,
      tools,
      comments,
      assistant,
      locale:
        locale ??
        (typeof document === "undefined"
          ? "en"
          : document.documentElement.lang || "en"),
      questions,
      forms,
      gates,
      draws,
      lockQuestions,
      starter,
      aiUse,
      narration,
      lessonActivities,
      feedbackTiming,
      arabicMath,
      ...(digits ? { digits } : {}),
    }),
    [
      strings,
      media,
      studio,
      puzzles,
      bank,
      standards,
      shared,
      mentions,
      tools,
      comments,
      assistant,
      locale,
      questions,
      forms,
      gates,
      draws,
      lockQuestions,
      starter,
      aiUse,
      narration,
      lessonActivities,
      feedbackTiming,
      arabicMath,
      digits,
    ],
  );
  // Counted from what the editor opens with, which the host has already
  // checked, rather than by checking the editor's copy again.
  const [stats] = useState(() => statsStore(statsOf(value)));
  const [synced, setSynced] = useState(false);
  const factory = collaboration?.providerFactory;
  const providerFactory = useMemo(
    () =>
      factory &&
      ((id: string, docs: Map<string, Doc>) => {
        const provider = factory(id, docs);
        provider.on("sync", (isSynced: boolean) => {
          if (isSynced) setSynced(true);
        });
        return provider;
      }),
    [factory],
  );
  const composer = (
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <Surface {...props} stats={stats} synced={synced} onSynced={onSynced} />
      {collaboration && providerFactory ? (
        <CollaborationPlugin
          id={collaboration.id}
          providerFactory={providerFactory}
          shouldBootstrap={false}
          username={collaboration.username}
          cursorColor={collaboration.color}
        />
      ) : null}
    </LexicalExtensionComposer>
  );
  return (
    <EditorEnvironmentProvider value={environment}>
      {collaboration ? (
        <LexicalCollaboration>{composer}</LexicalCollaboration>
      ) : (
        composer
      )}
    </EditorEnvironmentProvider>
  );
}

interface SurfaceProps extends Omit<
  EditorProps,
  "value" | "media" | "locale" | "strings" | "assistant"
> {
  stats: StatsStore;
  synced: boolean;
}

// The host draws its page again with every change it is handed; the
// surface and its plugins draw only when what they are given changes.
const Surface = memo(function Surface({
  id,
  label,
  onChange,
  onValidityChange,
  variant = "field",
  toolbar = true,
  disabled = false,
  placeholder,
  initialFocus,
  describedBy,
  replace,
  onUploadingChange,
  stats,
  synced,
  onSynced,
  language,
  young = false,
}: SurfaceProps) {
  const [editor] = useLexicalComposerContext();
  const { strings, media, arabicMath, digits, forms } = useEditorEnvironment();
  useEffect(
    () => setArabicNotation(editor, arabicMath === "rtl"),
    [editor, arabicMath],
  );
  // Question parts draw their pictures as they are first created, as labels
  // below are, so the address is known before the first render.
  useState(() =>
    setPartPictureUrl(editor, (fileId) => media?.url(fileId) ?? ""),
  );
  useState(() => setQuestionsAsked(editor, Boolean(forms)));
  // Question nodes draw their labels as they are first created, before any
  // effect could run, so the words are in place from the first render.
  useState(() =>
    setQuestionLabels(editor, {
      kinds: {
        choice: strings.questionChoice,
        poll: strings.questionPoll,
        labelling: strings.questionLabelling,
        crossword: strings.questionCrossword,
        wordsearch: strings.questionWordSearch,
        text: strings.questionTyped,
        math: strings.questionMath,
        written: strings.questionWritten,
        number: strings.questionNumber,
        ordering: strings.questionOrdering,
        matching: strings.questionMatching,
        sorting: strings.questionSorting,
        gaps: strings.questionGaps,
        highlight: strings.questionHighlight,
        counting: strings.questionCounting,
        tracing: strings.questionTracing,
        spelling: strings.questionSpelling,
        hotspot: strings.questionHotspot,
        scratch: strings.questionScratch,
        project: strings.questionProject,
        parsons: strings.questionParsons,
        program: strings.questionProgram,
        puzzle: strings.questionPuzzle,
      },
      spoken: strings.questionSpoken,
      filmed: strings.questionFilmed,
      reading: strings.questionRead,
      readingPassage: strings.questionReadingPassage,
      readingPrompt: strings.questionReadingPrompt,
      pictured: {
        drawing: strings.questionDrawing,
        photo: strings.questionPhoto,
      },
      count: strings.questionCountLabel,
      wordTiles: strings.questionWordTiles,
      starter: strings.questionStarterSet,
      checks: strings.questionChecksCount,
      editors: strings.questionEditorNames,
      pythonProject: strings.questionPython,
      microbitProject: strings.questionMicrobit,
      arrowsPuzzle: strings.questionArrows,
      videoAt: strings.questionVideoAt,
      standards: strings.questionStandardsCount,
      suggested: strings.questionSuggested,
      date: strings.questionDate,
      required: strings.questionRequired,
      codeLine: strings.questionCodeLine,
      distractor: strings.questionDistractor,
      testInput: strings.questionTestInput,
      crosswordWord: strings.questionCrosswordWord,
      crosswordClue: strings.questionCrosswordClue,
      hiddenWord: strings.questionHiddenWord,
      testOutput: strings.questionTestOutput,
      hiddenTest: strings.questionHiddenTest,
      extraTiles: strings.questionExtraTiles,
      points: strings.questionPoints,
      answerIs: strings.questionAnswerIs,
      prompt: strings.questionPrompt,
      option: strings.questionOption,
      answer: strings.questionAnswer,
      accepted: strings.questionAccepted,
      pairPrompt: strings.questionPairPrompt,
      pairAnswer: strings.questionPairAnswer,
      extra: strings.questionExtra,
      groupName: strings.questionGroupName,
      item: strings.questionItem,
      passage: strings.questionPassage,
      statementTrue: strings.questionTrue,
      statementFalse: strings.questionFalse,
      whyPrompt: strings.questionWhyPrompt,
    }),
  );
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [invalid, setInvalid] = useState(false);

  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) return undefined;
    const before = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => {
      window.document.body.style.overflow = before;
    };
  }, [focused]);

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (initialFocus) editor.focus();
  }, [editor, initialFocus]);

  useEffect(() => holdSlot(id, editor), [id, editor]);

  // The room's state lands as an update of its own; a frame later it is drawn.
  useEffect(() => {
    if (!synced || !onSynced) return undefined;
    const frame = requestAnimationFrame(onSynced);
    return () => cancelAnimationFrame(frame);
  }, [synced, onSynced]);

  useEffect(
    () => registerMarkdownShortcuts(editor, markdownShortcuts),
    [editor],
  );

  const replaced = useRef(replace?.at);
  useEffect(() => {
    if (!replace || replace.at === replaced.current) return;
    replaced.current = replace.at;
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        for (const child of replace.to.root.children ?? [])
          root.append($parseSerializedNode(child));
        // The caret pointed into the text just thrown away; leaving it unset
        // keeps the commit from moving focus into the editor mid-update.
        $setSelection(null);
      },
      replace.quiet ? { tag: QUIET_REPLACE } : undefined,
    );
  }, [editor, replace]);

  // Each change is checked against the content schema and handed to the
  // host, which draws its whole page again. Neither may stand between a
  // key and its letter on screen: a change goes in a task of its own once
  // typing pauses, or a second into a burst that does not, and the host
  // draws it as a transition that a key pressed meanwhile interrupts.
  // Leaving the editor, Escape and shortcuts hand it over at once, so a
  // save never misses the last words typed.
  useEffect(() => {
    let pending: { state: EditorState; quiet: boolean; since: number } | null =
      null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (urgent: boolean) => {
      clearTimeout(timer);
      timer = undefined;
      if (!pending) return;
      const { state, quiet } = pending;
      pending = null;
      const result = v.safeParse(contentDocumentSchema, state.toJSON());
      if (result.success) stats.set(statsOf(result.output));
      const hand = () => {
        setInvalid(!result.success);
        onValidityChange?.(result.success);
        if (result.success && !quiet) onChange(result.output);
      };
      if (urgent) hand();
      else startTransition(hand);
    };
    return mergeRegister(
      editor.registerUpdateListener(
        ({ editorState, dirtyElements, dirtyLeaves, tags }) => {
          if (!dirtyElements.size && !dirtyLeaves.size) return;
          const now = performance.now();
          pending = {
            state: editorState,
            quiet: (pending?.quiet ?? true) && tags.has(QUIET_REPLACE),
            since: pending?.since ?? now,
          };
          clearTimeout(timer);
          timer = setTimeout(
            () => settle(false),
            Math.max(
              0,
              Math.min(
                TYPING_PAUSE_MS,
                pending.since + MAX_TYPING_WAIT_MS - now,
              ),
            ),
          );
        },
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          settle(true);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            event.key === "Escape" ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          )
            settle(true);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      () => settle(true),
    );
  }, [editor, stats, onChange, onValidityChange]);

  const document = variant === "document";
  const errorId = `${id}-error`;
  const described = [describedBy, invalid ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={editorFrame.surface(document, invalid, focused)}>
      {toolbar && !disabled ? (
        <div className={editorFrame.toolbar(document, focused)}>
          <ToolbarPlugin disabled={disabled} />
        </div>
      ) : null}
      <div
        ref={setAnchor}
        className={cx(editorFrame.content(document), young && "fe-young")}
        data-digits={digits}
      >
        <ContentEditable
          id={id}
          aria-label={label}
          aria-multiline="true"
          aria-invalid={invalid}
          aria-describedby={described || undefined}
          lang={language}
          className={editorFrame.editable(document)}
        />
        <BlockHandlePlugin anchor={anchor} />
        <CodeBlockPlugin anchor={anchor} />
        <TablePlugin anchor={anchor} />
      </div>
      <DirectionPlugin language={language} />
      <PlaceholderPlugin empty={placeholder ?? strings.emptyPlaceholder} />
      <SlashMenuPlugin />
      <SelectionToolbarPlugin />
      <NarrationMarksPlugin />
      <MediaPlugin onBusyChange={onUploadingChange} />
      <WordImportPlugin />
      <QtiImportPlugin />
      <Cmi5ImportPlugin />
      <EmbedPlugin />
      <TableInsertPlugin />
      <BankPlugin />
      <SharedPlugin />
      <MentionsPlugin />
      <CommentsPlugin />
      <AssistantPlugin language={language} />
      <PastePlugin />
      <QuestionGuardPlugin />
      <DiagramPlugin />
      {!document ? (
        <FieldFooter stats={stats} />
      ) : disabled ? null : (
        <DocumentFooter
          stats={stats}
          focused={focused}
          onFocusedChange={setFocused}
        />
      )}
      {invalid ? (
        <p
          id={errorId}
          role="alert"
          className="px-4 py-2 text-sm text-destructive"
        >
          {strings.invalid}
        </p>
      ) : null}
    </div>
  );
});

interface FieldFooterProps {
  stats: StatsStore;
}

function FieldFooter({ stats }: FieldFooterProps) {
  const { strings } = useEditorEnvironment();
  const { characters } = useStats(stats);
  return (
    <div className={editorFrame.footer(false)}>
      <span>{strings.placeholder}</span>
      <span>{strings.characters(characters)}</span>
    </div>
  );
}

interface DocumentFooterProps {
  stats: StatsStore;
  focused: boolean;
  onFocusedChange: (focused: boolean) => void;
}

function DocumentFooter({
  stats,
  focused,
  onFocusedChange,
}: DocumentFooterProps) {
  const { words, minutes } = useStats(stats);
  return (
    <DocumentStatus
      words={words}
      minutes={minutes}
      focused={focused}
      onFocusedChange={onFocusedChange}
    />
  );
}
