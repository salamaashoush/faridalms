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
import { MAX_HINTS } from "@faridalms/domain/learning";
import { $isCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
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
  Captions,
  CaseSensitive,
  ChevronDown,
  Clock,
  Code,
  CodeXml,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FastForward,
  ImageOff,
  ImagePlus,
  Images,
  Italic,
  Lightbulb,
  Link,
  ListChecks,
  ListOrdered,
  Lock,
  MessageCircleQuestion,
  MessageSquare,
  Pencil,
  PenLine,
  Plus,
  Puzzle,
  Shuffle,
  SpellCheck,
  Strikethrough,
  TextQuote,
  Trash2,
  Underline,
  Unlink,
  UsersRound,
  Grid2x2,
  ScanSearch,
  ScrollText,
  Signature,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { BlockType } from "../blocks";
import type { MarkFormat } from "../formatting";
import type { NarrationTarget } from "../nodes/narration";
import type {
  PartPicture,
  QuestionSettings,
  QuestionOptionNode,
} from "../nodes/question";
import type { EditorColor } from "../strings";
import type { TimedWords } from "./narration";
import type { Region } from "./regions";

import {
  $anchorFor,
  $blockTypeOf,
  $currentBlock,
  $turnInto,
  blockDefinitions,
} from "../blocks";
import { useEditorEnvironment } from "../context";
import { CopyLinkButton } from "../files";
import { mediaClock } from "../format";
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
import {
  $findNarrated,
  $holdsNarration,
  $narrationOf,
  $narrationTarget,
  $narrationWordsOf,
  $setNarration,
  $setNarrationWords,
} from "../nodes/narration";
import {
  $findPart,
  $holdsPicture,
  $isQuestionNode,
  $isQuestionOptionNode,
  $isQuestionPairNode,
  $partAddress,
  $partPicture,
  $setPartPicture,
} from "../nodes/question";
import {
  $isDiagramNode,
  $isEmbedNode,
  $isMediaNode,
  ASK_AT_MOMENT_COMMAND,
  EDIT_DIAGRAM_COMMAND,
  OPEN_RECORDING_COMMAND,
  playerOf,
} from "../nodes/rich";
import { focusText, textFocus, updateFromOutside } from "../outside";
import { editorInSlot } from "../slots";
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
import { NarrationPanel, OPEN_NARRATION_COMMAND } from "./narration";
import { PictureLibrary, pictureFile } from "./picture-library";
import { RegionPad } from "./regions";
import { TracePad } from "./trace";

type Mode =
  | "hidden"
  | "format"
  | "link-edit"
  | "link-view"
  | "block"
  | "file"
  | "question"
  | "question-text"
  | "question-hints"
  | "question-number"
  | "narration"
  | "trace"
  | "regions"
  | "picture";

/** The question the caret is in: what the bar shows and changes. */
interface QuestionBarFacts {
  key: NodeKey;
  settings: QuestionSettings;
  /** The option the caret is in, whose feedback the bar edits. */
  option: { key: NodeKey; feedback: string } | null;
  /** The part the caret is in, when it may show a picture. */
  part: { key: NodeKey; picture: PartPicture | null } | null;
  /** What a recording made from here reads: the part the caret is in, else the question. */
  narration: { key: NodeKey; fileId: string | null };
  /** The code exercise test the caret is in. */
  test: { key: NodeKey; hidden: boolean } | null;
}

type QuestionText = "explanation" | "feedback" | "alt";

const POINTS = [0, 1, 2, 3, 4, 5, 6, 8, 10];
const TRIES = [null, 1, 2, 3, 5] as const;
const CODE_LANGUAGES = ["python", "javascript", "html", "text"] as const;
/** Languages a code exercise can be marked in. */
const PROGRAM_LANGUAGES = ["python", "javascript"] as const;
const WORD_LIMITS = [null, 50, 100, 150, 200, 300, 500] as const;
// Writing, or speaking for up to so many seconds (RECORD_SECONDS in the domain).
const ANSWER_BY = [
  null,
  15,
  45,
  90,
  180,
  "video-90",
  "video-180",
  "drawing",
  "photo",
] as const;
type AnswerBy = (typeof ANSWER_BY)[number];
// Counting goes to twenty (MAX_COUNT); a glimpse lasts FLASH_SECONDS.
const COUNTS = Array.from({ length: 20 }, (_, index) => index + 1);
const FLASH = [null, 2, 3, 5] as const;

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
  /** A recording's captions, chapters and transcript, which the bar opens. */
  recording: {
    video: boolean;
    captions: boolean;
    chapters: boolean;
    transcript: boolean;
    noSkipping: boolean;
  } | null;
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
  const {
    strings,
    media,
    studio,
    lockQuestions,
    narration: narrates,
    lessonActivities,
    locale,
    questions,
  } = useEditorEnvironment();
  const [mode, setMode] = useState<Mode>("hidden");
  const [reference, setReference] = useState<ReferenceElement | null>(null);
  const [facts, setFacts] = useState<Facts>(empty);
  const [layout, setLayout] = useState<BlockFacts | null>(null);
  // A selected video's bar offers a question at the moment it is paused on,
  // so the bar follows its player while it shows.
  const [, setMoment] = useState(0);
  const followed =
    mode === "block" && layout?.recording?.video ? layout.key : null;
  useEffect(() => {
    const element = followed ? playerOf(editor, followed) : null;
    if (!element) return undefined;
    const tick = () => setMoment(Math.floor(element.currentTime));
    element.addEventListener("timeupdate", tick);
    element.addEventListener("seeked", tick);
    return () => {
      element.removeEventListener("timeupdate", tick);
      element.removeEventListener("seeked", tick);
    };
  }, [editor, followed]);
  const [fileFacts, setFileFacts] = useState<FileBarFacts | null>(null);
  const [question, setQuestion] = useState<QuestionBarFacts | null>(null);
  const [editing, setEditing] = useState<QuestionText>("explanation");
  const [draftText, setDraftText] = useState("");
  const [hintDrafts, setHintDrafts] = useState<{ id: string; text: string }[]>(
    [],
  );
  const hintFields = useRef(new Map<string, HTMLTextAreaElement>());
  useEffect(() => {
    if (mode === "question-hints")
      [...hintFields.current.values()].at(-1)?.focus();
  }, [mode]);
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
  const [partProblem, setPartProblem] = useState<string | null>(null);
  const picturePart = useRef<NodeKey | null>(null);
  const [narrating, setNarrating] = useState<{
    target: NarrationTarget;
    fileId: string | null;
    words: TimedWords | null;
  } | null>(null);
  /**
   * Chooses a picture for the question part the caret is in. The chooser is
   * made on the spot rather than drawn in the bar, since the bar closes while
   * the system's file dialog has focus.
   */
  /** Stores a picture and puts it on a part, found again by its address. */
  const placePartPicture = async (
    partKey: NodeKey,
    file: File,
    alt: string,
  ) => {
    if (!media) return;
    const address = editor.getEditorState().read(() => {
      const node = $getNodeByKey(partKey);
      return node ? $partAddress(node) : null;
    });
    if (!address) return;
    const slot = editor.getRootElement()?.id;
    const uploaded = await media.upload(file, "image");
    updateFromOutside(editorInSlot(slot) ?? editor, () => {
      const part = $findPart(address);
      if (part) $setPartPicture(part, { fileId: uploaded.fileId, alt });
    });
  };
  const choosePartPicture = (partKey: NodeKey) => {
    if (!media) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = media.accept.image.join(",");
    const place = async (file: File) => {
      try {
        await placePartPicture(partKey, file, "");
      } catch {
        setPartProblem(strings.uploadFailed);
      }
    };
    // Attached while open: Safari on iOS opens no chooser for a detached input.
    input.hidden = true;
    input.addEventListener("change", () => {
      const [file] = input.files ?? [];
      input.remove();
      if (file) void place(file);
    });
    input.addEventListener("cancel", () => input.remove());
    document.body.append(input);
    input.click();
  };

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
        recording: $isMediaNode(node) ? node.getRecording() : null,
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
      let part: LexicalNode | null = null;
      let voiced: LexicalNode | null = null;
      let pair: LexicalNode | null = null;
      while (node && !$isQuestionNode(node)) {
        if ($isQuestionOptionNode(node)) option = node;
        if ($isQuestionPairNode(node)) pair = node;
        if (!part && $holdsPicture(node)) part = node;
        if (!voiced && $holdsNarration(node)) voiced = node;
        node = node.getParent();
      }
      if (!$isQuestionNode(node)) return null;
      voiced ??= node;
      // A counting question's picture is of what is counted, on the question.
      if (
        !part &&
        (node.getSettings().kind === "counting" ||
          node.getSettings().kind === "spelling" ||
          node.getSettings().kind === "hotspot")
      )
        part = node;
      // Lines of code and a program's tests are text alone, with no
      // picture or feedback of their own.
      const code =
        node.getSettings().kind === "parsons" ||
        node.getSettings().kind === "program";
      if (code) {
        option = null;
        part = null;
      }
      return {
        key: node.getKey(),
        settings: node.getSettings(),
        option: option
          ? { key: option.getKey(), feedback: option.getFeedback() }
          : null,
        part: part ? { key: part.getKey(), picture: $partPicture(part) } : null,
        narration: { key: voiced.getKey(), fileId: $narrationOf(voiced) },
        test:
          code && $isQuestionPairNode(pair)
            ? { key: pair.getKey(), hidden: pair.isHidden() }
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
      modeRef.current === "question-hints" ||
      modeRef.current === "question-number" ||
      modeRef.current === "narration" ||
      modeRef.current === "trace" ||
      modeRef.current === "regions" ||
      modeRef.current === "picture"
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
    const asked = lockQuestions ? null : readQuestion();
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

  /** Opens the narration panel at a block or part, from the block menu or the question bar. */
  const openNarration = (key: NodeKey) => {
    const found = editor.getEditorState().read(() => {
      const node = $getNodeByKey(key);
      const target = node ? $narrationTarget(node) : null;
      if (!node || !target) return null;
      // A passage of the page lights its words, and a question its prompt's;
      // a question's parts are too short to time.
      const text = $isQuestionNode(node)
        ? (node.getFirstChild()?.getTextContent() ?? "")
        : $isElementNode(node) && node.getParent() === $getRoot()
          ? node.getTextContent()
          : null;
      return {
        target,
        fileId: $narrationOf(node),
        words: text === null ? null : { text, times: $narrationWordsOf(node) },
      };
    });
    const element = editor.getElementByKey(key);
    if (!found || !element) return;
    saved.current = editor
      .getEditorState()
      .read(() => $getSelection()?.clone() ?? null);
    setNarrating(found);
    setReference(element);
    show("narration");
  };

  const onRefresh = useEffectEvent(refresh);
  const onOpenNarration = useEffectEvent(openNarration);
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
      editor.registerCommand(
        OPEN_NARRATION_COMMAND,
        (key) => {
          onOpenNarration(key);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, editable]);

  useEffect(() => {
    if (
      mode === "hidden" ||
      mode === "link-edit" ||
      mode === "question-text" ||
      mode === "question-hints" ||
      mode === "question-number" ||
      mode === "narration" ||
      mode === "trace" ||
      mode === "regions" ||
      mode === "picture"
    )
      return undefined;
    const onFocus = () => {
      // Opening the link box or a question's text or number form moves focus
      // into its field while this listener, wired for the bar, is still
      // attached; a check queued by the click's blur runs after the switch.
      if (
        modeRef.current === "link-edit" ||
        modeRef.current === "question-text" ||
        modeRef.current === "question-hints" ||
        modeRef.current === "question-number" ||
        modeRef.current === "narration" ||
        modeRef.current === "trace" ||
        modeRef.current === "regions" ||
        modeRef.current === "picture"
      )
        return;
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
    const { pictureId } = layout;
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
          {pictureId && media ? (
            <>
              <a
                href={`${media.url(pictureId)}?download`}
                download
                aria-label={strings.downloadFile}
                className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
              >
                <Download aria-hidden />
              </a>
              <CopyLinkButton
                url={media.url(pictureId)}
                strings={strings}
                className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4 [&>span]:sr-only"
              />
              {media.people ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => media.people?.(pictureId)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
                >
                  <UsersRound aria-hidden />
                  {strings.picturePeople}
                </button>
              ) : null}
              {separator}
            </>
          ) : null}
          {layout.recording ? (
            <>
              <ToolButton
                label={
                  layout.recording.captions
                    ? strings.captionsReplace
                    : strings.captionsNeeded
                }
                active={layout.recording.captions}
                className="relative"
                onClick={() =>
                  editor.dispatchCommand(OPEN_RECORDING_COMMAND, {
                    key: layout.key,
                    tab: "captions",
                  })
                }
              >
                <Captions aria-hidden />
                {layout.recording.captions ? null : (
                  <span
                    aria-hidden
                    className="absolute end-1 top-1 size-1.5 rounded-full bg-warning"
                  />
                )}
              </ToolButton>
              {layout.recording.video ? (
                <ToolButton
                  label={
                    layout.recording.chapters
                      ? strings.chapters
                      : strings.chaptersAdd
                  }
                  active={layout.recording.chapters}
                  onClick={() =>
                    editor.dispatchCommand(OPEN_RECORDING_COMMAND, {
                      key: layout.key,
                      tab: "chapters",
                    })
                  }
                >
                  <ListOrdered aria-hidden />
                </ToolButton>
              ) : null}
              <ToolButton
                label={
                  layout.recording.transcript
                    ? strings.transcript
                    : strings.transcriptAdd
                }
                active={layout.recording.transcript}
                onClick={() =>
                  editor.dispatchCommand(OPEN_RECORDING_COMMAND, {
                    key: layout.key,
                    tab: "transcript",
                  })
                }
              >
                <ScrollText aria-hidden />
              </ToolButton>
              {questions ? (
                <>
                  {separator}
                  <ToolButton
                    label={strings.mediaNoSkipping}
                    active={layout.recording.noSkipping}
                    onClick={() =>
                      editor.update(() => {
                        const node = $getNodeByKey(layout.key);
                        if ($isMediaNode(node))
                          node.setNoSkipping(!node.getRecording().noSkipping);
                      })
                    }
                  >
                    {layout.recording.noSkipping ? (
                      <Lock aria-hidden />
                    ) : (
                      <FastForward aria-hidden />
                    )}
                  </ToolButton>
                  {layout.recording.video ? (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        editor.dispatchCommand(
                          ASK_AT_MOMENT_COMMAND,
                          layout.key,
                        )
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
                    >
                      <MessageCircleQuestion aria-hidden />
                      {strings.questionAskAt(
                        mediaClock(
                          playerOf(editor, layout.key)?.currentTime ?? 0,
                        ),
                      )}
                    </button>
                  ) : null}
                </>
              ) : null}
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
        | "tehMarbuta"
        | "memory"
        | "gallery",
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
          : field === "alt"
            ? (question.part?.picture?.alt ?? "")
            : settings[field],
      );
      show("question-text");
    };
    const writeHints = () => {
      saved.current = editor
        .getEditorState()
        .read(() => $getSelection()?.clone() ?? null);
      setHintDrafts(
        (settings.hints.length > 0 ? settings.hints : [""]).map((text) => ({
          id: crypto.randomUUID(),
          text,
        })),
      );
      show("question-hints");
    };
    const triesText = (value: number | null) =>
      value === null
        ? strings.questionTriesUntilRight
        : strings.questionTriesCount(value);
    const wordsText = (value: number | null) =>
      value === null ? strings.questionNoLimit : strings.questionWords(value);
    const formatCount = (value: number) =>
      new Intl.NumberFormat(locale).format(value);
    const layoutText = (value: "scatter" | "line" | "frame") =>
      value === "line"
        ? strings.questionCountLine
        : value === "frame"
          ? strings.questionCountFrame
          : strings.questionCountScatter;
    const flashText = (value: number | null) =>
      value === null
        ? strings.questionFlashOff
        : strings.questionFlashSeconds(value);
    const answerByText = (value: AnswerBy) =>
      value === null
        ? strings.questionByWriting
        : value === "drawing"
          ? strings.questionByDrawing
          : value === "photo"
            ? strings.questionByPhoto
            : value === "video-90"
              ? strings.questionByVideo(90)
              : value === "video-180"
                ? strings.questionByVideo(180)
                : strings.questionBySpeaking(value);
    const answeredBy: AnswerBy =
      settings.answerWith ??
      (settings.recordVideo
        ? settings.recordSeconds === 180
          ? "video-180"
          : "video-90"
        : (ANSWER_BY.find((value) => value === settings.recordSeconds) ??
          null));
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
          {settings.videoAt === null ? null : (
            <>
              <span className="inline-flex h-8 items-center gap-1.5 px-1.5 text-sm whitespace-nowrap text-muted-foreground [&_svg]:size-4">
                <Clock aria-hidden />
                <bdi className="tabular-nums">
                  {strings.questionVideoAt(mediaClock(settings.videoAt))}
                </bdi>
              </span>
              <ToolButton
                label={strings.questionVideoAtClear}
                onClick={() => change({ videoAt: null })}
              >
                <X aria-hidden />
              </ToolButton>
            </>
          )}
          {settings.kind === "written" ? (
            <>
              {lessonActivities ? (
                <BarMenu
                  label={strings.questionAnswerBy}
                  current={answerByText(answeredBy)}
                  values={ANSWER_BY}
                  text={answerByText}
                  onPick={(value) =>
                    change(
                      value === "video-90" || value === "video-180"
                        ? {
                            answerWith: null,
                            recordSeconds: value === "video-90" ? 90 : 180,
                            recordVideo: true,
                          }
                        : typeof value === "string"
                          ? {
                              answerWith: value,
                              recordSeconds: null,
                              recordVideo: false,
                            }
                          : {
                              answerWith: null,
                              recordSeconds: value,
                              recordVideo: false,
                            },
                    )
                  }
                  onOpenChange={trackMenu}
                  finalFocus={textFocus(editor)}
                />
              ) : null}
              {settings.recordSeconds === null &&
              settings.answerWith === null ? (
                <BarMenu
                  label={strings.questionWordLimit}
                  current={wordsText(settings.wordLimit)}
                  values={WORD_LIMITS}
                  text={wordsText}
                  onPick={(wordLimit) => change({ wordLimit })}
                  onOpenChange={trackMenu}
                  finalFocus={textFocus(editor)}
                />
              ) : null}
            </>
          ) : settings.kind === "scratch" ? (
            studio ? (
              <>
                <ToolButton
                  label={
                    settings.projectFileId
                      ? strings.questionStarterEdit
                      : strings.questionStarterBuild
                  }
                  active={settings.projectFileId !== null}
                  onClick={() => {
                    // The studio covers the page, so the question is found
                    // again by its key once the teacher is done.
                    const key = question.key;
                    void studio.edit(settings.projectFileId).then((next) => {
                      if (next === undefined) return;
                      updateFromOutside(editor, () => {
                        const node = $getNodeByKey(key);
                        if ($isQuestionNode(node))
                          node.setSettings({ projectFileId: next });
                      });
                    });
                  }}
                >
                  <Puzzle aria-hidden />
                </ToolButton>
                {settings.projectFileId ? (
                  <ToolButton
                    label={strings.questionStarterRemove}
                    onClick={() => change({ projectFileId: null })}
                  >
                    <X aria-hidden />
                  </ToolButton>
                ) : null}
              </>
            ) : null
          ) : settings.kind === "project" ? (
            studio ? (
              <>
                <ToolButton
                  label={
                    settings.projectFiles.length > 0
                      ? strings.questionStarterEdit
                      : strings.questionStarterBuild
                  }
                  active={settings.projectFiles.length > 0}
                  onClick={() => {
                    const key = question.key;
                    void studio
                      .editFiles(settings.projectFiles)
                      .then((projectFiles) => {
                        updateFromOutside(editor, () => {
                          const node = $getNodeByKey(key);
                          if ($isQuestionNode(node))
                            node.setSettings({ projectFiles });
                        });
                      });
                  }}
                >
                  <CodeXml aria-hidden />
                </ToolButton>
                {settings.projectFiles.length > 0 ? (
                  <ToolButton
                    label={strings.questionStarterRemove}
                    onClick={() => change({ projectFiles: [] })}
                  >
                    <X aria-hidden />
                  </ToolButton>
                ) : null}
              </>
            ) : null
          ) : (
            <>
              {settings.kind === "program" ? (
                <BarMenu
                  label={strings.questionLanguage}
                  current={strings.questionLanguages[settings.codeLanguage]}
                  values={PROGRAM_LANGUAGES}
                  text={(language) => strings.questionLanguages[language]}
                  onPick={(codeLanguage) => change({ codeLanguage })}
                  onOpenChange={trackMenu}
                  finalFocus={textFocus(editor)}
                />
              ) : null}
              {settings.kind === "parsons" ? (
                <BarMenu
                  label={strings.questionLanguage}
                  current={strings.questionLanguages[settings.codeLanguage]}
                  values={CODE_LANGUAGES}
                  text={(language) => strings.questionLanguages[language]}
                  onPick={(codeLanguage) => change({ codeLanguage })}
                  onOpenChange={trackMenu}
                  finalFocus={textFocus(editor)}
                />
              ) : null}
              <BarMenu
                label={strings.questionTries}
                current={triesText(settings.tries)}
                values={TRIES}
                text={triesText}
                onPick={(tries) => change({ tries })}
                onOpenChange={trackMenu}
                finalFocus={textFocus(editor)}
              />
            </>
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
          {settings.kind === "counting" ? (
            <>
              <BarMenu
                label={strings.questionCount}
                current={formatCount(settings.count)}
                values={COUNTS}
                text={formatCount}
                onPick={(count) => change({ count })}
                onOpenChange={trackMenu}
                finalFocus={textFocus(editor)}
              />
              <BarMenu
                label={strings.questionCountMode}
                current={
                  settings.countMode === "make"
                    ? strings.questionCountMake
                    : strings.questionCountAsk
                }
                values={["count", "make"] as const}
                text={(value) =>
                  value === "make"
                    ? strings.questionCountMake
                    : strings.questionCountAsk
                }
                onPick={(countMode) => change({ countMode })}
                onOpenChange={trackMenu}
                finalFocus={textFocus(editor)}
              />
              {settings.countMode === "count" ? (
                <>
                  <BarMenu
                    label={strings.questionCountLayout}
                    current={layoutText(settings.countLayout)}
                    values={["scatter", "line", "frame"] as const}
                    text={layoutText}
                    onPick={(countLayout) => change({ countLayout })}
                    onOpenChange={trackMenu}
                    finalFocus={textFocus(editor)}
                  />
                  <BarMenu
                    label={strings.questionFlash}
                    current={flashText(settings.flashSeconds)}
                    values={FLASH}
                    text={flashText}
                    onPick={(flashSeconds) => change({ flashSeconds })}
                    onOpenChange={trackMenu}
                    finalFocus={textFocus(editor)}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {settings.kind === "matching" && lessonActivities
            ? toggle("memory", strings.questionMemory, <Grid2x2 aria-hidden />)
            : null}
          {settings.kind === "project" && lessonActivities
            ? toggle("gallery", strings.questionGallery, <Images aria-hidden />)
            : null}
          {settings.kind === "hotspot" && question.part?.picture && media ? (
            <ToolButton
              label={strings.questionMarkPlaces}
              active={settings.regions.length > 0}
              onClick={() => {
                saved.current = editor
                  .getEditorState()
                  .read(() => $getSelection()?.clone() ?? null);
                show("regions");
              }}
            >
              <ScanSearch aria-hidden />
            </ToolButton>
          ) : null}
          {settings.kind === "tracing" ? (
            <ToolButton
              label={strings.questionDrawTrace}
              active={settings.trace.length > 0}
              onClick={() => {
                saved.current = editor
                  .getEditorState()
                  .read(() => $getSelection()?.clone() ?? null);
                show("trace");
              }}
            >
              <Signature aria-hidden />
            </ToolButton>
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
          {question.test ? (
            <ToolButton
              label={strings.questionHiddenTest}
              active={question.test.hidden}
              onClick={() =>
                withSelection(() => {
                  const pair = question.test
                    ? $getNodeByKey(question.test.key)
                    : null;
                  if ($isQuestionPairNode(pair))
                    pair.setHidden(!pair.isHidden());
                })
              }
            >
              {question.test.hidden ? (
                <EyeOff aria-hidden />
              ) : (
                <Eye aria-hidden />
              )}
            </ToolButton>
          ) : null}
          <ToolButton
            label={strings.questionHint}
            active={settings.hints.length > 0}
            onClick={writeHints}
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
          {narrates && media ? (
            <ToolButton
              label={strings.narration}
              active={Boolean(question.narration.fileId)}
              onClick={() => openNarration(question.narration.key)}
            >
              <Volume2 aria-hidden />
            </ToolButton>
          ) : null}
          {question.part && media ? (
            question.part.picture ? (
              <>
                <ToolButton
                  label={strings.questionPictureDescribe}
                  active={Boolean(question.part.picture.alt)}
                  onClick={() => write("alt")}
                >
                  <TextQuote aria-hidden />
                </ToolButton>
                <ToolButton
                  label={strings.questionPictureRemove}
                  onClick={() =>
                    withSelection(() => {
                      const part = question.part
                        ? $getNodeByKey(question.part.key)
                        : null;
                      if (part) $setPartPicture(part, null);
                    })
                  }
                >
                  <ImageOff aria-hidden />
                </ToolButton>
              </>
            ) : (
              <ToolButton
                label={strings.questionPicture}
                onClick={() => {
                  setPartProblem(null);
                  if (!question.part) return;
                  if (media.pictures) {
                    picturePart.current = question.part.key;
                    saved.current = editor
                      .getEditorState()
                      .read(() => $getSelection()?.clone() ?? null);
                    show("picture");
                  } else choosePartPicture(question.part.key);
                }}
              >
                <ImagePlus aria-hidden />
              </ToolButton>
            )
          ) : null}
          {partProblem ? (
            <span role="alert" className="px-1 text-xs text-destructive">
              {partProblem}
            </span>
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

  if (mode === "picture" && media) {
    const close = () => {
      show("question");
      focusText(editor);
    };
    const partKey = picturePart.current;
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        boundary={boundary}
        className="w-[26rem] max-w-[calc(100vw-1rem)] p-3"
        keepInView
      >
        <div ref={toolbar}>
          <PictureLibrary
            onClose={close}
            onUpload={() => {
              close();
              if (partKey) choosePartPicture(partKey);
            }}
            onPick={async (picture) => {
              if (!partKey) return;
              await placePartPicture(
                partKey,
                await pictureFile(picture),
                picture.label,
              );
              close();
            }}
          />
        </div>
      </Floating>
    );
  }

  if (mode === "regions" && question?.part?.picture && media) {
    const close = () => {
      show("question");
      focusText(editor);
    };
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        boundary={boundary}
        className="w-[28rem] max-w-[calc(100vw-1rem)] p-3"
        keepInView
      >
        <div ref={toolbar}>
          <RegionPad
            src={media.url(question.part.picture.fileId)}
            alt={question.part.picture.alt}
            regions={question.settings.regions.map(
              ([left = 0, top = 0, width = 0, height = 0]): Region => [
                left,
                top,
                width,
                height,
              ],
            )}
            onClose={close}
            onDone={(regions) => {
              withSelection(() => {
                const node = $getNodeByKey(question.key);
                if ($isQuestionNode(node)) node.setSettings({ regions });
              });
              close();
            }}
          />
        </div>
      </Floating>
    );
  }

  if (mode === "trace" && question) {
    const close = () => {
      show("question");
      focusText(editor);
    };
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        boundary={boundary}
        className="w-80 max-w-[calc(100vw-1rem)] p-3"
        keepInView
      >
        <div ref={toolbar}>
          <TracePad
            strokes={question.settings.trace}
            onClose={close}
            onDone={(trace) => {
              withSelection(() => {
                const node = $getNodeByKey(question.key);
                if ($isQuestionNode(node)) node.setSettings({ trace });
              });
              close();
            }}
          />
        </div>
      </Floating>
    );
  }

  if (mode === "narration" && narrating) {
    const close = () => {
      show("hidden");
      setNarrating(null);
      focusText(editor);
    };
    const slot = editor.getRootElement()?.id;
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        boundary={boundary}
        keepInView
        className="w-80 max-w-[calc(100vw-1rem)] p-3"
      >
        <div ref={toolbar}>
          <NarrationPanel
            fileId={narrating.fileId}
            onChange={(fileId) => {
              const { target, words } = narrating;
              setNarrating({
                target,
                fileId,
                words: words ? { ...words, times: [] } : null,
              });
              // The upload may finish after a first save restarted the editor.
              updateFromOutside(editorInSlot(slot) ?? editor, () => {
                const node = $findNarrated(target);
                if (node) $setNarration(node, fileId);
              });
            }}
            onClose={close}
            words={narrating.words}
            onWords={(times) => {
              const { target, words } = narrating;
              setNarrating({
                ...narrating,
                words: words ? { ...words, times } : null,
              });
              updateFromOutside(editorInSlot(slot) ?? editor, () => {
                const node = $findNarrated(target);
                if (node) $setNarrationWords(node, times);
              });
            }}
          />
        </div>
      </Floating>
    );
  }

  if (mode === "question-text" && question) {
    const labels: Record<QuestionText, string> = {
      explanation: strings.questionExplanation,
      feedback: strings.questionFeedback,
      alt: strings.questionPictureDescribe,
    };
    const limits: Record<QuestionText, number> = {
      explanation: 1000,
      feedback: 300,
      alt: 300,
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
        if (editing === "alt") {
          const part = question.part ? $getNodeByKey(question.part.key) : null;
          const picture = part ? $partPicture(part) : null;
          if (part && picture)
            $setPartPicture(part, { ...picture, alt: value });
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

  if (mode === "question-hints" && question) {
    const done = () => {
      const hints = hintDrafts
        .map((hint) => hint.text.trim())
        .filter((hint) => hint !== "");
      withSelection(() => {
        const node = $getNodeByKey(question.key);
        if ($isQuestionNode(node)) node.setSettings({ hints });
      });
      show("question");
      focusText(editor);
    };
    const cancel = () => {
      show("question");
      focusText(editor);
    };
    const focusHint = (id: string | undefined) =>
      requestAnimationFrame(() => {
        if (id) hintFields.current.get(id)?.focus();
      });
    const add = () => {
      const id = crypto.randomUUID();
      setHintDrafts([...hintDrafts, { id, text: "" }]);
      focusHint(id);
    };
    const remove = (index: number) => {
      const rest = hintDrafts.filter((_, at) => at !== index);
      const next =
        rest.length > 0 ? rest : [{ id: crypto.randomUUID(), text: "" }];
      setHintDrafts(next);
      focusHint(next[Math.min(index, next.length - 1)]?.id);
    };
    const count = new Intl.NumberFormat(locale);
    return (
      <Floating
        reference={reference}
        placement="top-start"
        className="flex w-96 max-w-[calc(100vw-1rem)] flex-col gap-1.5 p-2"
      >
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            done();
          }}
        >
          <div className="grid gap-0.5">
            <p className="text-xs font-medium text-muted-foreground">
              {strings.questionHint}
            </p>
            <p className="text-xs leading-4 text-muted-foreground">
              {strings.questionHintsHelp}
            </p>
          </div>
          <ol className="grid gap-1.5">
            {hintDrafts.map((hint, index) => (
              <li key={hint.id} className="flex items-start gap-1">
                <span
                  aria-hidden
                  className="mt-1.5 w-4 shrink-0 text-center text-xs leading-5 font-medium text-muted-foreground tabular-nums"
                >
                  {count.format(index + 1)}
                </span>
                <textarea
                  ref={(element) => {
                    if (element) hintFields.current.set(hint.id, element);
                    else hintFields.current.delete(hint.id);
                  }}
                  aria-label={strings.questionHintNumber(index + 1)}
                  dir="auto"
                  rows={2}
                  maxLength={500}
                  value={hint.text}
                  onChange={(event) => {
                    const text = event.target.value;
                    setHintDrafts(
                      hintDrafts.map((item) =>
                        item.id === hint.id ? { ...item, text } : item,
                      ),
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      done();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancel();
                    }
                  }}
                  className="block min-w-0 flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <ToolButton
                  label={strings.questionHintRemove(index + 1)}
                  onClick={() => remove(index)}
                >
                  <X aria-hidden />
                </ToolButton>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between gap-2">
            {hintDrafts.length < MAX_HINTS ? (
              <button
                type="button"
                onClick={add}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
              >
                <Plus aria-hidden />
                {strings.questionHintAdd}
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {strings.questionDone}
            </button>
          </div>
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
