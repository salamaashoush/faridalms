import "./prism";
import type { ContentDocument } from "@faridalms/domain/content";
import type { Provider } from "@lexical/yjs";
import type { Doc } from "yjs";

import {
  contentDocumentSchema,
  contentPlainText,
} from "@faridalms/domain/content";
import { $isCodeNode, CodeNode, getCodeLanguageOptions } from "@lexical/code";
import { CodePrismExtension } from "@lexical/code-prism";
import { HistoryExtension } from "@lexical/history";
import { registerMarkdownShortcuts } from "@lexical/markdown";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import {
  $getNodeByKey,
  $getRoot,
  $parseSerializedNode,
  $setSelection,
  defineExtension,
} from "lexical";
import { useEffect, useMemo, useRef, useState } from "react";
import * as v from "valibot";

import type { EditorMedia, EditorStudio } from "./context";
import type { EditorStrings } from "./strings";

import { $currentBlock } from "./blocks";
import { EditorEnvironmentProvider, useEditorEnvironment } from "./context";
import { ShortcutsExtension } from "./extensions";
import { editorFrame } from "./frame";
import { contentExtensions } from "./headless";
import { markdownShortcuts } from "./markdown";
import {
  $codeRunOf,
  $setCodeRun,
  runnableLanguage,
  setPartPictureUrl,
  setQuestionLabels,
} from "./nodes";
import { BlockHandlePlugin } from "./plugins/BlockHandle";
import { DiagramPlugin } from "./plugins/diagram";
import { DirectionPlugin } from "./plugins/Direction";
import { EmbedPlugin } from "./plugins/embed";
import { MediaPlugin } from "./plugins/media";
import { NarrationMarksPlugin } from "./plugins/narration";
import { PastePlugin } from "./plugins/paste";
import { PlaceholderPlugin } from "./plugins/Placeholder";
import { QuestionGuardPlugin } from "./plugins/questions";
import { SelectionToolbarPlugin } from "./plugins/SelectionToolbar";
import { SlashMenuPlugin } from "./plugins/SlashMenu";
import { TablePlugin } from "./plugins/Table";
import { ToolbarPlugin } from "./plugins/Toolbar";
import { holdSlot } from "./slots";
import { editorTheme } from "./theme";

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
  placeholder?: string;
  initialFocus?: boolean;
  locale?: string;
  describedBy?: string;
  collaboration?: EditorCollaboration;
  /**
   * Puts this content in place of what the editor holds each time `at`
   * changes, as an edit, so a live room passes it on to everyone in it.
   */
  replace?: { to: ContentDocument; at: number };
  /** Told whether files are still uploading into the document. */
  onUploadingChange?: (uploading: boolean) => void;
  /** The document may ask questions, as a lesson or quiz does. */
  questions?: boolean;
  /** The document may stop at continue gates; a lesson may, a quiz may not. */
  gates?: boolean;
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
  /** Told once a live document has arrived from its room and is drawn. */
  onSynced?: () => void;
}

export default function Editor({
  strings,
  media,
  studio,
  locale,
  value,
  collaboration,
  questions = false,
  gates = questions,
  lockQuestions = false,
  starter = false,
  aiUse = false,
  narration = false,
  lessonActivities = false,
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
      locale:
        locale ??
        (typeof document === "undefined"
          ? "en"
          : document.documentElement.lang || "en"),
      questions,
      gates,
      lockQuestions,
      starter,
      aiUse,
      narration,
      lessonActivities,
    }),
    [
      strings,
      media,
      studio,
      locale,
      questions,
      gates,
      lockQuestions,
      starter,
      aiUse,
      narration,
      lessonActivities,
    ],
  );
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
      <Surface {...props} synced={synced} onSynced={onSynced} />
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

function Surface({
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
  synced,
  onSynced,
}: Omit<EditorProps, "value" | "media" | "locale" | "strings"> & {
  synced: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings, media } = useEditorEnvironment();
  // Question parts draw their pictures as they are first created, as labels
  // below are, so the address is known before the first render.
  useState(() =>
    setPartPictureUrl(editor, (fileId) => media?.url(fileId) ?? ""),
  );
  // Question nodes draw their labels as they are first created, before any
  // effect could run, so the words are in place from the first render.
  useState(() =>
    setQuestionLabels(editor, {
      kinds: {
        choice: strings.questionChoice,
        text: strings.questionTyped,
        written: strings.questionWritten,
        number: strings.questionNumber,
        ordering: strings.questionOrdering,
        matching: strings.questionMatching,
        sorting: strings.questionSorting,
        gaps: strings.questionGaps,
        counting: strings.questionCounting,
        tracing: strings.questionTracing,
        spelling: strings.questionSpelling,
        hotspot: strings.questionHotspot,
        scratch: strings.questionScratch,
        project: strings.questionProject,
        parsons: strings.questionParsons,
        program: strings.questionProgram,
      },
      spoken: strings.questionSpoken,
      filmed: strings.questionFilmed,
      pictured: {
        drawing: strings.questionDrawing,
        photo: strings.questionPhoto,
      },
      count: strings.questionCountLabel,
      wordTiles: strings.questionWordTiles,
      starter: strings.questionStarterSet,
      pythonProject: strings.questionPython,
      videoAt: strings.questionVideoAt,
      codeLine: strings.questionCodeLine,
      distractor: strings.questionDistractor,
      testInput: strings.questionTestInput,
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
  const [count, setCount] = useState(() =>
    editor.getEditorState().read(() => {
      const result = v.safeParse(
        contentDocumentSchema,
        editor.getEditorState().toJSON(),
      );
      return result.success ? contentPlainText(result.output).length : 0;
    }),
  );

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
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      for (const child of replace.to.root.children ?? [])
        root.append($parseSerializedNode(child));
      // The caret pointed into the text just thrown away; leaving it unset
      // keeps the commit from moving focus into the editor mid-update.
      $setSelection(null);
    });
  }, [editor, replace]);

  useEffect(
    () =>
      editor.registerUpdateListener(
        ({ editorState, dirtyElements, dirtyLeaves }) => {
          if (!dirtyElements.size && !dirtyLeaves.size) return;
          const result = v.safeParse(
            contentDocumentSchema,
            editorState.toJSON(),
          );
          setInvalid(!result.success);
          onValidityChange?.(result.success);
          if (!result.success) return;
          setCount(contentPlainText(result.output).length);
          onChange(result.output);
        },
      ),
    [editor, onChange, onValidityChange],
  );

  const document = variant === "document";
  const errorId = `${id}-error`;
  const described = [describedBy, invalid ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={editorFrame.surface(document, invalid)}>
      {toolbar && !disabled ? (
        <div className={editorFrame.toolbar(document)}>
          <ToolbarPlugin disabled={disabled} />
        </div>
      ) : null}
      <div ref={setAnchor} className={editorFrame.content(document)}>
        <ContentEditable
          id={id}
          aria-label={label}
          aria-multiline="true"
          aria-invalid={invalid}
          aria-describedby={described || undefined}
          className={editorFrame.editable(document)}
        />
        <BlockHandlePlugin anchor={anchor} />
        <CodeLanguagePlugin anchor={anchor} />
        <TablePlugin anchor={anchor} />
      </div>
      <DirectionPlugin />
      <PlaceholderPlugin empty={placeholder ?? strings.emptyPlaceholder} />
      <SlashMenuPlugin />
      <SelectionToolbarPlugin />
      <NarrationMarksPlugin />
      <MediaPlugin onBusyChange={onUploadingChange} />
      <EmbedPlugin />
      <PastePlugin />
      <QuestionGuardPlugin />
      <DiagramPlugin />
      {document ? null : (
        <div className={editorFrame.footer(document)}>
          <span>{strings.placeholder}</span>
          <span>{strings.characters(count)}</span>
        </div>
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
}

function CodeLanguagePlugin({ anchor }: { anchor: HTMLElement | null }) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [code, setCode] = useState<{
    key: string;
    language: string;
    run: string;
    top: number;
    left: number;
  } | null>(null);
  const options = useMemo(() => getCodeLanguageOptions(), []);

  // A code block students can run says so, since its controls show only
  // while the caret is in it.
  useEffect(
    () =>
      editor.registerMutationListener(
        CodeNode,
        (mutations) => {
          editor.getEditorState().read(() => {
            for (const [key, mutation] of mutations) {
              if (mutation === "destroyed") continue;
              const node = $getNodeByKey(key);
              const element = editor.getElementByKey(key);
              if (!$isCodeNode(node) || !element) continue;
              const run = runnableLanguage(node.getLanguage())
                ? $codeRunOf(node)
                : null;
              if (run) {
                element.dataset.run = run;
                element.dataset.runLabel =
                  run === "predict" ? strings.codePredict : strings.codeRun;
              } else {
                delete element.dataset.run;
                delete element.dataset.runLabel;
              }
            }
          });
        },
        { skipInitialization: false },
      ),
    [editor, strings],
  );

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        const found = editorState.read(() => {
          const block = $currentBlock();
          return $isCodeNode(block)
            ? {
                key: block.getKey(),
                language: block.getLanguage() ?? "",
                run: $codeRunOf(block) ?? "",
              }
            : null;
        });
        const element = found ? editor.getElementByKey(found.key) : null;
        if (!found || !element || !anchor) {
          setCode(null);
          return;
        }
        const box = anchor.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        setCode({
          ...found,
          top: Math.round(rect.top - box.top + anchor.scrollTop + 6),
          left: Math.round(rect.right - box.left - 6),
        });
      }),
    [editor, anchor],
  );

  if (!code || !editor.isEditable()) return null;
  const select =
    "h-7 rounded-md border bg-background/90 px-1.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30";
  return (
    <div
      style={{ top: code.top, left: code.left, transform: "translateX(-100%)" }}
      className="absolute z-10 flex gap-1.5"
    >
      {runnableLanguage(code.language) ? (
        <select
          aria-label={strings.codeStudents}
          value={code.run}
          onChange={(event) => {
            const run = event.target.value;
            editor.update(() => {
              const node = $getNodeByKey(code.key);
              if ($isCodeNode(node))
                $setCodeRun(
                  node,
                  run === "run" || run === "predict" ? run : null,
                );
            });
          }}
          className={select}
        >
          <option value="">{strings.codeRead}</option>
          <option value="run">{strings.codeRun}</option>
          <option value="predict">{strings.codePredict}</option>
        </select>
      ) : null}
      <select
        aria-label={strings.codeLanguage}
        value={code.language}
        onChange={(event) => {
          const language = event.target.value;
          editor.update(() => {
            const node = $getNodeByKey(code.key);
            if (!$isCodeNode(node)) return;
            node.setLanguage(language || null);
            if (!runnableLanguage(language)) $setCodeRun(node, null);
          });
        }}
        className={select}
      >
        <option value="">{strings.plainText}</option>
        {options.map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
