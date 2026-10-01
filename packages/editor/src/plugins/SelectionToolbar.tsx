import type { FileDisplay, ImageSize } from "@faridalms/domain/content";
import type { ReferenceElement } from "@floating-ui/dom";
import type {
  BaseSelection,
  ElementFormatType,
  LexicalNode,
  NodeKey,
} from "lexical";

import { Menu } from "@base-ui/react/menu";
import { parseNumber } from "@faridalms/domain/answers";
import { fileDisplays, imageSizes } from "@faridalms/domain/content";
import { fileFamily } from "@faridalms/domain/file";
import { $isCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
} from "lexical";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  CaseSensitive,
  ChevronDown,
  Code,
  Download,
  ExternalLink,
  Eye,
  Italic,
  Lightbulb,
  Link,
  ListChecks,
  MessageCircleQuestion,
  MessageSquare,
  Pencil,
  PenLine,
  Shuffle,
  SpellCheck,
  Strikethrough,
  Trash2,
  Underline,
  Unlink,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { BlockType } from "../blocks";
import type { MarkFormat } from "../formatting";
import type { QuestionSettings, QuestionOptionNode } from "../nodes/question";
import type { EditorColor } from "../strings";

import {
  $anchorFor,
  $blockTypeOf,
  $currentBlock,
  $turnInto,
  blockDefinitions,
} from "../blocks";
import { useEditorEnvironment } from "../context";
import { CopyLinkButton } from "../files";
import {
  $activeFormats,
  $applyColor,
  $currentLinkUrl,
  $selectionColors,
  applyLink,
  backgroundColors,
  normaliseUrl,
  OPEN_LINK_EDITOR_COMMAND,
  textColors,
} from "../formatting";
import { $isFileNode, $isImageNode, OPEN_FILE_COMMAND } from "../nodes/media";
import { $isQuestionNode, $isQuestionOptionNode } from "../nodes/question";
import {
  $isDiagramNode,
  $isEmbedNode,
  $isMediaNode,
  EDIT_DIAGRAM_COMMAND,
} from "../nodes/rich";
import { focusText, textFocus, updateFromOutside } from "../outside";
import { editorColors } from "../strings";
import {
  Floating,
  Tip,
  ToolButton,
  cx,
  menuItemClass,
  menuPopupClass,
  selectionReference,
  shortcutLabel,
} from "../ui";

type Mode =
  | "hidden"
  | "format"
  | "link-edit"
  | "link-view"
  | "block"
  | "file"
  | "question"
  | "question-text"
  | "question-number";

/** The question the caret is in: what the bar shows and changes. */
interface QuestionBarFacts {
  key: NodeKey;
  settings: QuestionSettings;
  /** The option the caret is in, whose feedback the bar edits. */
  option: { key: NodeKey; feedback: string } | null;
}

type QuestionText = "hint" | "explanation" | "feedback";

const POINTS = [0, 1, 2, 3, 4, 5, 6, 8, 10];
const TRIES = [null, 1, 2, 3, 5] as const;
const WORD_LIMITS = [null, 50, 100, 150, 200, 300, 500] as const;

/** A selected file: what the bar opens, shares or shows. */
interface FileBarFacts {
  key: NodeKey;
  fileId: string;
  name: string;
  mime: string;
  display: FileDisplay;
}

/** A selected picture, drawing, video or embed: what the bar can change. */
interface BlockFacts {
  key: NodeKey;
  drawing: boolean;
  /** A picture's file, which the bar downloads or links. */
  pictureId: string | null;
  size: ImageSize;
  format: ElementFormatType;
  /** The document's direction, which decides which side start is. */
  rtl: boolean;
}

const separator = <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />;

/** A setting picked from a short list, shown by its current value. */
function BarMenu<T>({
  label,
  current,
  values,
  text,
  onPick,
  onOpenChange,
  finalFocus,
}: {
  label: string;
  current: string;
  values: readonly T[];
  text: (value: T) => string;
  onPick: (value: T) => void;
  onOpenChange: (open: boolean) => void;
  finalFocus: ReturnType<typeof textFocus>;
}) {
  return (
    <Menu.Root onOpenChange={onOpenChange}>
      <Menu.Trigger
        aria-label={label}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
      >
        {current}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={6} align="start">
          <Menu.Popup className={menuPopupClass} finalFocus={finalFocus}>
            {values.map((value) => (
              <Menu.Item
                key={String(value)}
                className={menuItemClass}
                onClick={() => onPick(value)}
              >
                <span className="flex-1">{text(value)}</span>
                {text(value) === current ? (
                  <span className="size-1.5 rounded-full bg-primary" />
                ) : null}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function $layoutBlock(key: NodeKey | null) {
  const node = key ? $getNodeByKey(key) : null;
  return $isImageNode(node) ||
    $isDiagramNode(node) ||
    $isMediaNode(node) ||
    $isEmbedNode(node)
    ? node
    : null;
}

interface Facts {
  formats: MarkFormat[];
  block: BlockType | null;
  link: string | null;
  color: string;
  background: string;
}

const empty: Facts = {
  formats: [],
  block: null,
  link: null,
  color: "",
  background: "",
};

export function SelectionToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const { strings, media } = useEditorEnvironment();
  const [mode, setMode] = useState<Mode>("hidden");
  const [reference, setReference] = useState<ReferenceElement | null>(null);
  const [facts, setFacts] = useState<Facts>(empty);
  const [layout, setLayout] = useState<BlockFacts | null>(null);
  const [fileFacts, setFileFacts] = useState<FileBarFacts | null>(null);
  const [question, setQuestion] = useState<QuestionBarFacts | null>(null);
  const [editing, setEditing] = useState<QuestionText>("hint");
  const [draftText, setDraftText] = useState("");
  const [numbers, setNumbers] = useState({
    mode: "exact" as "exact" | "range",
    value: "",
    tolerance: "",
    percent: false,
    min: "",
    max: "",
  });
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);
  const saved = useRef<BaseSelection | null>(null);
  const pointer = useRef(false);
  const menus = useRef(0);
  const toolbar = useRef<HTMLDivElement>(null);

  const read = () =>
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return null;
      const block = $currentBlock();
      return {
        collapsed: selection.isCollapsed(),
        code: $isCodeNode(block),
        text: selection.getTextContent(),
        facts: {
          formats: $activeFormats(),
          block: $blockTypeOf($anchorFor("paragraph")),
          link: $currentLinkUrl(),
          ...$selectionColors(),
        },
      };
    });

  const readBlock = () =>
    editor.getEditorState().read((): Omit<BlockFacts, "rtl"> | null => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return null;
      const nodes = selection.getNodes();
      const node =
        nodes.length === 1 ? $layoutBlock(nodes[0]?.getKey() ?? null) : null;
      if (!node) return null;
      return {
        key: node.getKey(),
        drawing: $isDiagramNode(node),
        pictureId: $isImageNode(node) ? node.getFileId() : null,
        size: node.getSize(),
        format: node.getFormat(),
      };
    });

  const readQuestion = () =>
    editor.getEditorState().read((): QuestionBarFacts | null => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return null;
      let node: LexicalNode | null = selection.anchor.getNode();
      let option: QuestionOptionNode | null = null;
      while (node && !$isQuestionNode(node)) {
        if ($isQuestionOptionNode(node)) option = node;
        node = node.getParent();
      }
      if (!$isQuestionNode(node)) return null;
      return {
        key: node.getKey(),
        settings: node.getSettings(),
        option: option
          ? { key: option.getKey(), feedback: option.getFeedback() }
          : null,
      };
    });

  const readFile = () =>
    editor.getEditorState().read((): FileBarFacts | null => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return null;
      const nodes = selection.getNodes();
      const node = nodes.length === 1 ? nodes[0] : null;
      if (!$isFileNode(node)) return null;
      const file = node.getFile();
      return {
        key: node.getKey(),
        fileId: file.fileId,
        name: file.name,
        mime: file.mime,
        display: file.display,
      };
    });

  const modeRef = useRef<Mode>("hidden");
  const show = (next: Mode) => {
    modeRef.current = next;
    setMode(next);
  };

  const refresh = () => {
    if (pointer.current || menus.current > 0) return;
    if (
      modeRef.current === "link-edit" ||
      modeRef.current === "question-text" ||
      modeRef.current === "question-number"
    )
      return;
    const root = editor.getRootElement();
    const focused = root !== null && root.contains(document.activeElement);
    const file = focused ? readFile() : null;
    if (file) {
      setFileFacts(file);
      setReference(editor.getElementByKey(file.key));
      return show("file");
    }
    const selected = focused ? readBlock() : null;
    if (selected) {
      const element = editor.getElementByKey(selected.key);
      setLayout({
        ...selected,
        rtl: element ? getComputedStyle(element).direction === "rtl" : false,
      });
      setReference(element?.querySelector("figure") ?? element);
      return show("block");
    }
    const state = focused ? read() : null;
    if (!state) return show("hidden");
    setFacts(state.facts);
    if (!state.collapsed && !state.code && state.text.trim()) {
      setReference(selectionReference(root));
      return show("format");
    }
    if (state.collapsed && state.facts.link) {
      const anchor = window.getSelection()?.anchorNode;
      const element =
        anchor instanceof Element ? anchor : anchor?.parentElement;
      setReference(element?.closest("a") ?? selectionReference(root));
      return show("link-view");
    }
    const asked = readQuestion();
    if (asked) {
      setQuestion(asked);
      setReference(editor.getElementByKey(asked.key));
      return show("question");
    }
    show("hidden");
  };

  const openLinkEditor = () => {
    const state = read();
    saved.current = editor
      .getEditorState()
      .read(() => $getSelection()?.clone() ?? null);
    setUrl(state?.facts.link ?? "");
    setInvalid(false);
    setReference(selectionReference(editor.getRootElement()) ?? reference);
    show("link-edit");
  };

  const onRefresh = useEffectEvent(refresh);
  const onOpenLink = useEffectEvent(openLinkEditor);
  const onEscape = useEffectEvent(() => {
    if (modeRef.current === "hidden") return false;
    show("hidden");
    return true;
  });
  const onPointerDown = useEffectEvent(() => {
    pointer.current = true;
    if (modeRef.current !== "link-edit") show("hidden");
  });

  useEffect(() => {
    if (!editable) return undefined;
    const down = () => onPointerDown();
    const up = () => {
      if (!pointer.current) return;
      pointer.current = false;
      requestAnimationFrame(() => onRefresh());
    };
    document.addEventListener("pointerup", up);
    return mergeRegister(
      () => document.removeEventListener("pointerup", up),
      editor.registerRootListener((next, previous) => {
        previous?.removeEventListener("pointerdown", down);
        next?.addEventListener("pointerdown", down);
      }),
      editor.registerUpdateListener(() => onRefresh()),
      editor.registerCommand(
        OPEN_LINK_EDITOR_COMMAND,
        () => {
          onOpenLink();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            !event.shiftKey &&
            event.key.toLowerCase() === "k"
          ) {
            event.preventDefault();
            onOpenLink();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => onEscape(),
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, editable]);

  useEffect(() => {
    if (
      mode === "hidden" ||
      mode === "link-edit" ||
      mode === "question-text" ||
      mode === "question-number"
    )
      return undefined;
    const onFocus = () => {
      // Opening the link box moves focus into its field while this listener,
      // wired for the formatting bar, is still attached.
      if (modeRef.current === "link-edit") return;
      const active = document.activeElement;
      const root = editor.getRootElement();
      if (
        menus.current === 0 &&
        !toolbar.current?.contains(active) &&
        !root?.contains(active)
      )
        onEscape();
    };
    document.addEventListener("focusin", onFocus);
    const onBlur = () => requestAnimationFrame(onFocus);
    const root = editor.getRootElement();
    root?.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("focusin", onFocus);
      root?.removeEventListener("blur", onBlur);
    };
  }, [editor, mode]);

  if (!editable || mode === "hidden" || !reference) return null;

  const trackMenu = (open: boolean) => {
    if (open) {
      saved.current = editor
        .getEditorState()
        .read(() => $getSelection()?.clone() ?? null);
      menus.current += 1;
    } else menus.current = Math.max(0, menus.current - 1);
  };

  const withSelection = (change: () => void) =>
    updateFromOutside(editor, () => {
      if (saved.current) $setSelection(saved.current.clone());
      change();
    });

  // The text area below the fixed toolbar, so the bar never covers that one.
  const boundary = editor.getRootElement()?.parentElement ?? null;

  if (mode === "block" && layout) {
    const sizes: Record<ImageSize, string> = {
      small: strings.sizeSmall,
      medium: strings.sizeMedium,
      large: strings.sizeLarge,
      full: strings.sizeFull,
    };
    const aligned =
      layout.format === "start" || layout.format === "end"
        ? layout.format
        : "center";
    const alignments = [
      {
        value: "start",
        label: strings.alignStart,
        icon: layout.rtl ? AlignRight : AlignLeft,
      },
      { value: "center", label: strings.alignCenter, icon: AlignCenter },
      {
        value: "end",
        label: strings.alignEnd,
        icon: layout.rtl ? AlignLeft : AlignRight,
      },
    ] as const;
    return (
      <Floating
        reference={reference}
        placement="top"
        boundary={boundary}
        className="flex items-center gap-0.5 p-1"
        keepFocus
        role="toolbar"
        label={strings.blockOptions}
      >
        <div ref={toolbar} className="contents">
          {layout.drawing ? (
            <>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  editor.dispatchCommand(EDIT_DIAGRAM_COMMAND, layout.key)
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
              >
                <PenLine aria-hidden />
                {strings.diagramEdit}
              </button>
              {separator}
            </>
          ) : null}
          {layout.pictureId && media ? (
            <>
              <a
                href={`${media.url(layout.pictureId)}?download`}
                download
                aria-label={strings.downloadFile}
                className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
              >
                <Download aria-hidden />
              </a>
              <CopyLinkButton
                url={media.url(layout.pictureId)}
                strings={strings}
                className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4 [&>span]:sr-only"
              />
              {separator}
            </>
          ) : null}
          {alignments.map((alignment) => (
            <ToolButton
              key={alignment.value}
              label={alignment.label}
              active={layout.size !== "full" && aligned === alignment.value}
              disabled={layout.size === "full"}
              onClick={() =>
                editor.update(() =>
                  $layoutBlock(layout.key)?.setFormat(alignment.value),
                )
              }
            >
              <alignment.icon aria-hidden />
            </ToolButton>
          ))}
          {separator}
          <Menu.Root onOpenChange={trackMenu}>
            <Menu.Trigger
              aria-label={strings.blockSize}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
            >
              {sizes[layout.size]}
              <ChevronDown className="size-3.5 opacity-60" aria-hidden />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="z-50" sideOffset={6} align="start">
                <Menu.Popup
                  className={menuPopupClass}
                  finalFocus={textFocus(editor)}
                >
                  {imageSizes.map((value) => (
                    <Menu.Item
                      key={value}
                      className={menuItemClass}
                      onClick={() =>
                        withSelection(() =>
                          $layoutBlock(layout.key)?.setSize(value),
                        )
                      }
                    >
                      <span className="flex-1">{sizes[value]}</span>
                      {layout.size === value ? (
                        <span className="size-1.5 rounded-full bg-primary" />
                      ) : null}
                    </Menu.Item>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </Floating>
    );
  }

  if (mode === "question" && question) {
    const { settings } = question;
    const change = (patch: Partial<QuestionSettings>) =>
      withSelection(() => {
        const node = $getNodeByKey(question.key);
        if ($isQuestionNode(node)) node.setSettings(patch);
      });
    const toggle = (
      key:
        | "multiple"
        | "shuffle"
        | "caseSensitive"
        | "closeEnough"
        | "tehMarbuta",
      label: string,
      icon: React.ReactNode,
    ) => (
      <ToolButton
        label={label}
        active={settings[key]}
        onClick={() =>
          editor.update(() => {
            const node = $getNodeByKey(question.key);
            if ($isQuestionNode(node))
              node.setSettings({ [key]: !node.getSettings()[key] });
          })
        }
      >
        {icon}
      </ToolButton>
    );
    const write = (field: QuestionText) => {
      saved.current = editor
        .getEditorState()
        .read(() => $getSelection()?.clone() ?? null);
      setEditing(field);
      setDraftText(
        field === "feedback"
          ? (question.option?.feedback ?? "")
          : settings[field],
      );
      show("question-text");
    };
    const triesText = (value: number | null) =>
      value === null
        ? strings.questionTriesUntilRight
        : strings.questionTriesCount(value);
    const wordsText = (value: number | null) =>
      value === null ? strings.questionNoLimit : strings.questionWords(value);
    return (
      <Floating
        reference={reference}
        placement="top-start"
        boundary={boundary}
        className="flex flex-wrap items-center gap-0.5 p-1"
        keepFocus
        role="toolbar"
        label={strings.questionOptions}
      >
        <div ref={toolbar} className="contents">
          <BarMenu
            label={strings.questionPoints(settings.points)}
            current={strings.questionPoints(settings.points)}
            values={POINTS}
            text={(value) => strings.questionPoints(value)}
            onPick={(points) => change({ points })}
            onOpenChange={trackMenu}
            finalFocus={textFocus(editor)}
          />
          {settings.kind === "written" ? (
            <BarMenu
              label={strings.questionWordLimit}
              current={wordsText(settings.wordLimit)}
              values={WORD_LIMITS}
              text={wordsText}
              onPick={(wordLimit) => change({ wordLimit })}
              onOpenChange={trackMenu}
              finalFocus={textFocus(editor)}
            />
          ) : (
            <BarMenu
              label={strings.questionTries}
              current={triesText(settings.tries)}
              values={TRIES}
              text={triesText}
              onPick={(tries) => change({ tries })}
              onOpenChange={trackMenu}
              finalFocus={textFocus(editor)}
            />
          )}
          {settings.kind === "ordering" ? (
            <BarMenu
              label={strings.questionScoring}
              current={
                settings.scoring === "all"
                  ? strings.questionScoringAll
                  : strings.questionScoringNeighbours
              }
              values={["all", "neighbours"] as const}
              text={(value) =>
                value === "all"
                  ? strings.questionScoringAll
                  : strings.questionScoringNeighbours
              }
              onPick={(scoring) => change({ scoring })}
              onOpenChange={trackMenu}
              finalFocus={textFocus(editor)}
            />
          ) : null}
          {settings.kind === "number" ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                saved.current = editor
                  .getEditorState()
                  .read(() => $getSelection()?.clone() ?? null);
                setNumbers({
                  mode: settings.numberMode,
                  value: String(settings.answerValue),
                  tolerance: settings.tolerance
                    ? String(settings.tolerance)
                    : "",
                  percent: settings.percent,
                  min: String(settings.rangeMin),
                  max: String(settings.rangeMax),
                });
                show("question-number");
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
            >
              {strings.questionSetAnswer}
            </button>
          ) : null}
          {separator}
          {settings.kind === "choice" ? (
            <>
              {toggle(
                "multiple",
                strings.questionSeveral,
                <ListChecks aria-hidden />,
              )}
              {toggle(
                "shuffle",
                strings.questionShuffle,
                <Shuffle aria-hidden />,
              )}
            </>
          ) : null}
          {settings.kind === "text" || settings.kind === "gaps" ? (
            <>
              {toggle(
                "caseSensitive",
                strings.questionMatchCase,
                <CaseSensitive aria-hidden />,
              )}
              {toggle(
                "closeEnough",
                strings.questionCloseEnough,
                <SpellCheck aria-hidden />,
              )}
              {toggle(
                "tehMarbuta",
                strings.questionTehMarbuta,
                <span aria-hidden className="text-base leading-none">
                  ة
                </span>,
              )}
            </>
          ) : null}
          <ToolButton
            label={strings.questionHint}
            active={Boolean(settings.hint)}
            onClick={() => write("hint")}
          >
            <Lightbulb aria-hidden />
          </ToolButton>
          <ToolButton
            label={strings.questionExplanation}
            active={Boolean(settings.explanation)}
            onClick={() => write("explanation")}
          >
            <MessageCircleQuestion aria-hidden />
          </ToolButton>
          {question.option ? (
            <ToolButton
              label={strings.questionFeedback}
              active={Boolean(question.option.feedback)}
              onClick={() => write("feedback")}
            >
              <MessageSquare aria-hidden />
            </ToolButton>
          ) : null}
          {separator}
          <ToolButton
            label={strings.questionDelete}
            onClick={() => {
              editor.update(() => {
                const node = $getNodeByKey(question.key);
                if (!$isQuestionNode(node)) return;
                const paragraph = $createParagraphNode();
                node.replace(paragraph);
                paragraph.selectStart();
              });
              show("hidden");
            }}
          >
            <Trash2 aria-hidden />
          </ToolButton>
        </div>
      </Floating>
    );
  }

  if (mode === "question-text" && question) {
    const labels: Record<QuestionText, string> = {
      hint: strings.questionHint,
      explanation: strings.questionExplanation,
      feedback: strings.questionFeedback,
    };
    const limits: Record<QuestionText, number> = {
      hint: 500,
      explanation: 1000,
      feedback: 300,
    };
    const done = () => {
      const value = draftText.trim();
      withSelection(() => {
        if (editing === "feedback") {
          const option = question.option
            ? $getNodeByKey(question.option.key)
            : null;
          if ($isQuestionOptionNode(option)) option.setFeedback(value);
          return;
        }
        const node = $getNodeByKey(question.key);
        if ($isQuestionNode(node)) node.setSettings({ [editing]: value });
      });
      show("question");
      focusText(editor);
    };
    return (
      <Floating
        reference={reference}
        placement="top-start"
        className="flex w-96 max-w-[calc(100vw-1rem)] flex-col gap-1.5 p-2"
      >
        <form
          className="grid gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            done();
          }}
        >
          <label className="text-xs font-medium text-muted-foreground">
            {labels[editing]}
            <textarea
              ref={(element) => element?.focus()}
              dir="auto"
              rows={2}
              maxLength={limits[editing]}
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  done();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  show("question");
                  focusText(editor);
                }
              }}
              className="mt-1 block w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </label>
          <button
            type="submit"
            className="h-8 justify-self-end rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {strings.questionDone}
          </button>
        </form>
      </Floating>
    );
  }

  if (mode === "question-number" && question) {
    const field =
      "h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
    const parsed = {
      value: parseNumber(numbers.value),
      tolerance: numbers.tolerance ? parseNumber(numbers.tolerance) : 0,
      min: parseNumber(numbers.min),
      max: parseNumber(numbers.max),
    };
    const valid =
      numbers.mode === "exact"
        ? parsed.value !== null &&
          parsed.tolerance !== null &&
          parsed.tolerance >= 0
        : parsed.min !== null &&
          parsed.max !== null &&
          parsed.min <= parsed.max;
    const done = () => {
      if (!valid) return;
      withSelection(() => {
        const node = $getNodeByKey(question.key);
        if (!$isQuestionNode(node)) return;
        node.setSettings(
          numbers.mode === "exact"
            ? {
                numberMode: "exact",
                answerValue: parsed.value ?? 0,
                tolerance: parsed.tolerance ?? 0,
                percent: numbers.percent,
              }
            : {
                numberMode: "range",
                rangeMin: parsed.min ?? 0,
                rangeMax: parsed.max ?? 0,
              },
        );
      });
      show("question");
      focusText(editor);
    };
    const input = (
      key: "value" | "tolerance" | "min" | "max",
      label: string,
      focus = false,
    ) => (
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        {label}
        <input
          ref={focus ? (element) => element?.focus() : undefined}
          type="text"
          inputMode="decimal"
          dir="ltr"
          value={numbers[key]}
          onChange={(event) =>
            setNumbers((current) => ({ ...current, [key]: event.target.value }))
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              show("question");
              focusText(editor);
            }
          }}
          className={field}
        />
      </label>
    );
    return (
      <Floating
        reference={reference}
        placement="top-start"
        className="flex w-80 max-w-[calc(100vw-1rem)] flex-col gap-2 p-2"
      >
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            done();
          }}
        >
          <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5">
            {(["exact", "range"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={numbers.mode === value}
                onClick={() =>
                  setNumbers((current) => ({ ...current, mode: value }))
                }
                className="h-7 rounded px-2 text-xs font-medium text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
              >
                {value === "exact"
                  ? strings.questionExact
                  : strings.questionRange}
              </button>
            ))}
          </div>
          {numbers.mode === "exact" ? (
            <div className="grid grid-cols-2 items-end gap-2">
              {input("value", strings.questionValue, true)}
              {input("tolerance", strings.questionTolerance)}
              <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={numbers.percent}
                  onChange={(event) =>
                    setNumbers((current) => ({
                      ...current,
                      percent: event.target.checked,
                    }))
                  }
                />
                {strings.questionPercent}
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {input("min", strings.questionMin, true)}
              {input("max", strings.questionMax)}
            </div>
          )}
          <button
            type="submit"
            disabled={!valid}
            className="h-8 justify-self-end rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {strings.questionDone}
          </button>
        </form>
      </Floating>
    );
  }

  if (mode === "file" && fileFacts) {
    const fileUrl = media?.url(fileFacts.fileId);
    const pdf = fileFamily(fileFacts.name, fileFacts.mime) === "pdf";
    const action =
      "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4";
    const displays: Record<FileDisplay, string> = {
      card: strings.fileAsCard,
      preview: strings.fileAsPreview,
    };
    return (
      <Floating
        reference={reference}
        placement="top"
        boundary={boundary}
        className="flex items-center gap-0.5 p-1"
        keepFocus
        role="toolbar"
        label={strings.fileOptions}
      >
        <div ref={toolbar} className="contents">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              editor.dispatchCommand(OPEN_FILE_COMMAND, fileFacts.key)
            }
            className={action}
          >
            <Eye aria-hidden />
            {strings.openFile}
          </button>
          {fileUrl ? (
            <>
              <a
                href={`${fileUrl}?download`}
                download={fileFacts.name}
                aria-label={strings.downloadFile}
                className={action}
              >
                <Download aria-hidden />
              </a>
              <CopyLinkButton
                url={fileUrl}
                strings={strings}
                className={`${action} [&>span]:sr-only`}
              />
            </>
          ) : null}
          {pdf ? (
            <>
              {separator}
              <Menu.Root onOpenChange={trackMenu}>
                <Menu.Trigger
                  aria-label={strings.fileDisplay}
                  className={action}
                >
                  {displays[fileFacts.display]}
                  <ChevronDown className="size-3.5 opacity-60" aria-hidden />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner
                    className="z-50"
                    sideOffset={6}
                    align="start"
                  >
                    <Menu.Popup
                      className={menuPopupClass}
                      finalFocus={textFocus(editor)}
                    >
                      {fileDisplays.map((value) => (
                        <Menu.Item
                          key={value}
                          className={menuItemClass}
                          onClick={() =>
                            withSelection(() => {
                              const node = $getNodeByKey(fileFacts.key);
                              if ($isFileNode(node)) node.setDisplay(value);
                            })
                          }
                        >
                          <span className="flex-1">{displays[value]}</span>
                          {fileFacts.display === value ? (
                            <span className="size-1.5 rounded-full bg-primary" />
                          ) : null}
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </>
          ) : null}
        </div>
      </Floating>
    );
  }

  if (mode === "link-edit") {
    const submit = () => {
      const next = url.trim() ? normaliseUrl(url) : null;
      if (url.trim() && !next) {
        setInvalid(true);
        return;
      }
      applyLink(editor, saved.current, next);
      show("hidden");
    };
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        className="flex w-80 max-w-[calc(100vw-1rem)] flex-col gap-1.5 p-2"
      >
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={(element) => element?.focus()}
            type="text"
            inputMode="url"
            dir="ltr"
            aria-label={strings.linkUrl}
            aria-invalid={invalid}
            placeholder="https://"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                show("hidden");
                focusText(editor);
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive"
          />
          <button
            type="submit"
            className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {strings.linkApply}
          </button>
          {facts.link ? (
            <ToolButton
              label={strings.linkRemove}
              onClick={() => {
                applyLink(editor, saved.current, null);
                show("hidden");
              }}
            >
              <Unlink aria-hidden />
            </ToolButton>
          ) : null}
        </form>
        {invalid ? (
          <p role="alert" className="px-0.5 text-xs text-destructive">
            {strings.linkInvalid}
          </p>
        ) : null}
      </Floating>
    );
  }

  if (mode === "link-view" && facts.link) {
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        className="flex max-w-[min(24rem,calc(100vw-1rem))] items-center gap-1 p-1"
        keepFocus
        role="toolbar"
        label={strings.link}
      >
        <a
          href={facts.link}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
          className="flex min-w-0 items-center gap-1.5 truncate rounded-md px-2 py-1 text-sm text-primary hover:bg-accent"
          aria-label={`${strings.linkOpen}: ${facts.link}`}
        >
          <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{facts.link}</span>
        </a>
        <ToolButton label={strings.link} onClick={openLinkEditor}>
          <Pencil aria-hidden />
        </ToolButton>
        <ToolButton
          label={strings.linkRemove}
          onClick={() => {
            applyLink(editor, null, null);
            show("hidden");
          }}
        >
          <Unlink aria-hidden />
        </ToolButton>
      </Floating>
    );
  }

  const marks: {
    format: MarkFormat;
    label: string;
    icon: typeof Bold;
    shortcut: string;
  }[] = [
    { format: "bold", label: strings.bold, icon: Bold, shortcut: "Mod+B" },
    {
      format: "italic",
      label: strings.italic,
      icon: Italic,
      shortcut: "Mod+I",
    },
    {
      format: "underline",
      label: strings.underline,
      icon: Underline,
      shortcut: "Mod+U",
    },
    {
      format: "strikethrough",
      label: strings.strikethrough,
      icon: Strikethrough,
      shortcut: "Mod+Shift+S",
    },
    {
      format: "code",
      label: strings.inlineCode,
      icon: Code,
      shortcut: "Mod+E",
    },
  ];
  const current = blockDefinitions.find((block) => block.type === facts.block);
  const convertible = blockDefinitions.filter((block) => block.convertible);

  return (
    <Floating
      reference={reference}
      placement="top"
      boundary={boundary}
      className="flex items-center gap-0.5 p-1"
      keepFocus
      role="toolbar"
      label={strings.formatting}
    >
      <div ref={toolbar} className="contents">
        <Menu.Root onOpenChange={trackMenu}>
          <Menu.Trigger
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
            aria-label={strings.turnInto}
          >
            {current ? current.label(strings) : strings.turnInto}
            <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-50" sideOffset={6} align="start">
              <Menu.Popup
                className={cx(menuPopupClass, "max-h-80 overflow-y-auto")}
                finalFocus={textFocus(editor)}
              >
                {convertible.map((block) => (
                  <Menu.Item
                    key={block.type}
                    className={menuItemClass}
                    onClick={() =>
                      withSelection(() => {
                        const target = $anchorFor(block.type);
                        if (target) $turnInto(target, block.type);
                      })
                    }
                  >
                    <block.icon aria-hidden />
                    <span className="flex-1">{block.label(strings)}</span>
                    {facts.block === block.type ? (
                      <span className="size-1.5 rounded-full bg-primary" />
                    ) : null}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        {separator}
        {marks.map((mark) => (
          <ToolButton
            key={mark.format}
            label={mark.label}
            shortcut={shortcutLabel(mark.shortcut)}
            active={facts.formats.includes(mark.format)}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, mark.format)
            }
          >
            <mark.icon aria-hidden />
          </ToolButton>
        ))}
        {separator}
        <ToolButton
          label={strings.link}
          shortcut={shortcutLabel("Mod+K")}
          active={Boolean(facts.link)}
          onClick={openLinkEditor}
        >
          <Link aria-hidden />
        </ToolButton>
        <ColorMenu
          facts={facts}
          onOpenChange={trackMenu}
          onPick={(property, value) =>
            withSelection(() => $applyColor(property, value))
          }
        />
      </div>
    </Floating>
  );
}

function ColorMenu({
  facts,
  onOpenChange,
  onPick,
}: {
  facts: Facts;
  onOpenChange: (open: boolean) => void;
  onPick: (
    property: "color" | "background-color",
    value: string | null,
  ) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const swatch = (color: EditorColor, background: boolean) => (
    <Menu.Item
      key={`${background ? "bg" : "fg"}-${color}`}
      className={menuItemClass}
      onClick={() =>
        onPick(
          background ? "background-color" : "color",
          background ? backgroundColors[color] : textColors[color],
        )
      }
    >
      <span
        aria-hidden
        className="flex size-5 items-center justify-center rounded border text-xs font-semibold"
        style={
          background
            ? { backgroundColor: backgroundColors[color] }
            : { color: textColors[color] }
        }
      >
        A
      </span>
      <span className="flex-1">{strings.colors[color]}</span>
      {(background ? facts.background : facts.color) ===
      (background ? backgroundColors[color] : textColors[color]) ? (
        <span className="size-1.5 rounded-full bg-primary" />
      ) : null}
    </Menu.Item>
  );
  return (
    <Menu.Root onOpenChange={onOpenChange}>
      <Tip label={strings.textColor}>
        <Menu.Trigger
          aria-label={strings.textColor}
          className="inline-flex h-8 items-center gap-0.5 rounded-md px-1.5 text-foreground/80 hover:bg-accent hover:text-foreground"
        >
          <Baseline
            className="size-4"
            style={facts.color ? { color: facts.color } : undefined}
            aria-hidden
          />
          <ChevronDown className="size-3 opacity-60" aria-hidden />
        </Menu.Trigger>
      </Tip>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={6} align="start">
          <Menu.Popup
            className={cx(menuPopupClass, "max-h-96 w-56 overflow-y-auto")}
            finalFocus={textFocus(editor)}
          >
            <Menu.Group>
              <Menu.GroupLabel className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
                {strings.textColor}
              </Menu.GroupLabel>
              <Menu.Item
                className={menuItemClass}
                onClick={() => onPick("color", null)}
              >
                <span
                  aria-hidden
                  className="flex size-5 items-center justify-center rounded border text-xs font-semibold"
                >
                  A
                </span>
                <span className="flex-1">{strings.defaultColor}</span>
              </Menu.Item>
              {editorColors.map((color) => swatch(color, false))}
            </Menu.Group>
            <Menu.Separator className="-mx-1 my-1 h-px bg-border" />
            <Menu.Group>
              <Menu.GroupLabel className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
                {strings.highlight}
              </Menu.GroupLabel>
              <Menu.Item
                className={menuItemClass}
                onClick={() => onPick("background-color", null)}
              >
                <span aria-hidden className="size-5 rounded border" />
                <span className="flex-1">{strings.defaultColor}</span>
              </Menu.Item>
              {editorColors.map((color) => swatch(color, true))}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
