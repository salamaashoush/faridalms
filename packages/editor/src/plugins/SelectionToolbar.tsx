import type { FootnoteSource } from "@faridalms/domain/citations";
import type {
  ContentNode,
  FeedbackTime,
  FileDisplay,
  ImageSize,
  QuestionKind,
  StandardTarget,
  TextSize,
} from "@faridalms/domain/content";
import type { ReferenceElement } from "@floating-ui/dom";
import type {
  BaseSelection,
  ElementFormatType,
  LexicalNode,
  NodeKey,
} from "lexical";

import { Menu } from "@base-ui/react/menu";
import { parseNumber } from "@faridalms/domain/answers";
import {
  FEEDBACK_TIMES,
  fileDisplays,
  imageSizes,
  TEXT_SIZES,
} from "@faridalms/domain/content";
import { fileFamily } from "@faridalms/domain/file";
import {
  MAX_HINTS,
  MAX_LABEL_EXTRAS,
  MAX_LINE_STEPS,
} from "@faridalms/domain/learning";
import {
  isWrittenForm,
  MATH_FORMS,
  PRECISION_FORMS,
} from "@faridalms/domain/math-forms";
import {
  blankOf,
  locked,
  lockOf,
  PROJECT_LOCKS,
  sameFiles,
} from "@faridalms/domain/project";
import { SCRATCH_FEATURES } from "@faridalms/domain/scratch-project";
import { MAX_BLOCK_STANDARDS } from "@faridalms/domain/standards";
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
  SKIP_DOM_SELECTION_TAG,
} from "lexical";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ALargeSmall,
  AppWindow,
  Asterisk,
  Baseline,
  BookA,
  BookmarkPlus,
  BookX,
  Bold,
  Boxes,
  Captions,
  CaseSensitive,
  Check,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  Code,
  CodeXml,
  Download,
  ExternalLink,
  FileUp,
  Eye,
  EyeOff,
  FastForward,
  ImageOff,
  ImagePlus,
  Images,
  Italic,
  Library,
  Lightbulb,
  ListPlus,
  Link,
  ListChecks,
  ChartColumnBig,
  Tags,
  ListOrdered,
  ListTodo,
  Lock,
  MessageCircleQuestion,
  MessageSquare,
  Move,
  Pencil,
  PenLine,
  Plus,
  Puzzle,
  Shuffle,
  SpellCheck,
  Strikethrough,
  Subscript,
  Target,
  Superscript,
  TextQuote,
  Trash2,
  Underline,
  VenetianMask,
  Unlink,
  UsersRound,
  Grid2x2,
  RemoveFormatting,
  ScanSearch,
  ScrollText,
  Signature,
  Sigma,
  Volume2,
  WrapText,
  ArrowRightLeft,
  AudioLines,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { BlockType } from "../blocks";
import type { MarkFormat } from "../formatting";
import type { MathNode } from "../nodes/math";
import type { NarrationTarget } from "../nodes/narration";
import type {
  PartPicture,
  QuestionSettings,
  QuestionOptionNode,
} from "../nodes/question";
import type { EmbedNode } from "../nodes/rich";
import type { TermFacts } from "../nodes/term";
import type { EditorColor } from "../strings";
import type { TimedWords } from "./narration";

import {
  $anchorFor,
  $blockTypeOf,
  $currentBlock,
  $turnInto,
  blockDefinitions,
  serialized,
} from "../blocks";
import { useEditorEnvironment } from "../context";
import { CopyLinkButton } from "../files";
import { mediaClock } from "../format";
import {
  $activeFormats,
  $applyColor,
  $applyTextSize,
  $clearFormatting,
  $currentLinkUrl,
  $selectionColors,
  $selectionTextSize,
  applyLink,
  backgroundColors,
  normaliseUrl,
  OPEN_LINK_EDITOR_COMMAND,
  textColors,
} from "../formatting";
import { MathInput } from "../math-input";
import { $isDrawNode, useBankTags } from "../nodes/draw";
import { $insertFootnote, $isFootnoteNode } from "../nodes/footnote";
import { $isLtiNode, $setLtiContent } from "../nodes/lti";
import { $insertMath, $isMathNode } from "../nodes/math";
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
  $isQuestionPassageNode,
  $markableAtCaret,
  $partAddress,
  $partPicture,
  $setPartPicture,
  $toggleMark,
  QuestionPassageNode,
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
import { $isStandardsNode } from "../nodes/standards";
import { $defineSelection, $isTermNode, $termOf } from "../nodes/term";
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
import { FootnotePanel } from "./footnote-panel";
import { NarrationPanel, OPEN_NARRATION_COMMAND } from "./narration";
import { PictureLibrary, pictureFile } from "./picture-library";
import { RegionPad } from "./regions";
import { StandardsPad } from "./standards";
import { TermPanel } from "./term-panel";
import { TracePad } from "./trace";

type Mode =
  | "hidden"
  | "math"
  | "draw"
  | "format"
  | "link-edit"
  | "link-view"
  | "block"
  | "file"
  | "lti"
  | "question"
  | "question-text"
  | "question-hints"
  | "question-number"
  | "narration"
  | "trace"
  | "regions"
  | "picture"
  | "standards"
  | "standards-block"
  | "footnote"
  | "term"
  | "term-view";

/** A chosen formula: what the bar writes and how it sits. */
interface MathFacts {
  key: NodeKey;
  latex: string;
  block: boolean;
  rtl: boolean;
}

/** A chosen footnote: its words, and the source it cites. */
interface FootnoteFacts {
  key: NodeKey;
  note: string;
  source: FootnoteSource | null;
}

/** The term the caret is in: its words and what they mean. */
interface TermBarFacts {
  key: NodeKey;
  words: string;
  facts: TermFacts;
  /** Just defined, so its panel opens to write what it means. */
  fresh: boolean;
}

/** A chosen link to an outside tool, and the tool it opens. */
interface LtiBarFacts {
  key: NodeKey;
  toolId: string;
}

/** A chosen standards block and the standards it names. */
interface NamingFacts {
  key: NodeKey;
  targets: StandardTarget[];
}

/** A chosen draw from the bank: what it draws by, how many, and their worth. */
interface DrawFacts {
  key: NodeKey;
  tag: string;
  count: number;
  points: number;
}

/** The question the caret is in: what the bar shows and changes. */
interface QuestionBarFacts {
  key: NodeKey;
  settings: QuestionSettings;
  /** The option the caret is in, whose feedback the bar edits. */
  option: { key: NodeKey; feedback: string } | null;
  /** The choice or line of code the caret is in, and whether it is marked. */
  mark: { key: NodeKey; correct: boolean } | null;
  /** The part the caret is in, when it may show a picture. */
  part: { key: NodeKey; picture: PartPicture | null } | null;
  /** What a recording made from here reads: the part the caret is in, else the question. */
  narration: { key: NodeKey; fileId: string | null };
  /** The code exercise test the caret is in. */
  test: { key: NodeKey; hidden: boolean } | null;
}

type QuestionText = "explanation" | "feedback" | "alt" | "bank";

const POINTS = [0, 1, 2, 3, 4, 5, 6, 8, 10];
const DRAW_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
const TRIES = [null, 1, 2, 3, 5] as const;
/** Extra words a word bank takes, as many as a choice has options. */
const MAX_BANK_WORDS = 8;
/** Questions answered in one go, whose feedback can wait. */
const DEFERRABLE = new Set<QuestionKind>([
  "choice",
  "text",
  "math",
  "gaps",
  "highlight",
  "number",
  "matching",
  "ordering",
  "sorting",
  "labelling",
  "crossword",
  "wordsearch",
]);
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
  "reading",
  "drawing",
  "photo",
] as const;
type AnswerBy = (typeof ANSWER_BY)[number];
// Counting goes to twenty (MAX_COUNT); a glimpse lasts FLASH_SECONDS.
const COUNTS = Array.from({ length: 20 }, (_, index) => index + 1);
// How far a maths answer's numbers may be from the key: exact, or to decimals.
const MATH_TOLERANCES = [0, 0.001, 0.01, 0.1, 0.5, 1] as const;
/** A form, or a precision with how many figures or places, as `figures:3`. */
const MATH_FORM_CHOICES = [
  null,
  ...MATH_FORMS.filter(isWrittenForm),
  "figures:2",
  "figures:3",
  "figures:4",
  "places:0",
  "places:1",
  "places:2",
  "places:3",
] as const;
const MATH_UNITS = [null, "convert", "same"] as const;
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
    descriptions: boolean;
    transcript: boolean;
    noSkipping: boolean;
    /** A YouTube or Vimeo video, whose service keeps its captions. */
    framed: boolean;
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

const EDITOR_LOCKS = ["all", ...PROJECT_LOCKS] as const;

/**
 * A menu of things to tick, each on or off, which stays open as they are.
 * The bar stops reading the question while one of its menus is open, so
 * what is ticked is kept here until the bar hands down the question's own
 * list again, which it does once the caret is back in the text.
 */
function BarChecks<T extends string>({
  label,
  values,
  picked,
  text,
  onChange,
  onOpenChange,
  finalFocus,
}: {
  label: string;
  values: readonly T[];
  picked: readonly T[];
  text: (value: T) => string;
  onChange: (picked: T[]) => void;
  onOpenChange: (open: boolean) => void;
  finalFocus: ReturnType<typeof textFocus>;
}) {
  const [ticked, setTicked] = useState<{
    since: readonly T[];
    now: readonly T[];
  } | null>(null);
  const shown = ticked?.since === picked ? ticked.now : picked;
  return (
    <Menu.Root onOpenChange={onOpenChange}>
      <Menu.Trigger
        aria-label={label}
        data-active={shown.length > 0 || undefined}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground data-active:text-primary"
      >
        <ListTodo className="size-4" aria-hidden />
        {shown.length > 0 ? shown.length : null}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={6} align="start">
          <Menu.Popup className={menuPopupClass} finalFocus={finalFocus}>
            <Menu.Group>
              <Menu.GroupLabel className="px-2 py-1.5 text-[13px] leading-[18px] text-muted-foreground">
                {label}
              </Menu.GroupLabel>
              {values.map((value) => (
                <Menu.CheckboxItem
                  key={value}
                  className={menuItemClass}
                  closeOnClick={false}
                  checked={shown.includes(value)}
                  onCheckedChange={(checked) => {
                    // Kept in the order the list gives, however they were ticked.
                    const next = values.filter((item) =>
                      item === value ? checked : shown.includes(item),
                    );
                    setTicked({ since: picked, now: next });
                    onChange(next);
                  }}
                >
                  <span className="flex-1">{text(value)}</span>
                  <Menu.CheckboxItemIndicator>
                    <Check className="size-4 text-primary" aria-hidden />
                  </Menu.CheckboxItemIndicator>
                </Menu.CheckboxItem>
              ))}
            </Menu.Group>
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

/** A YouTube or Vimeo video's facts for the bar, or none for any other embed. */
function framedRecording(
  recording: ReturnType<EmbedNode["getRecording"]>,
): BlockFacts["recording"] {
  return recording ? { ...recording, framed: true } : null;
}

interface Facts {
  formats: MarkFormat[];
  block: BlockType | null;
  link: string | null;
  color: string;
  background: string;
  size: TextSize | null;
  /** The selection is in a defined term. */
  term: boolean;
}

const empty: Facts = {
  formats: [],
  block: null,
  link: null,
  color: "",
  background: "",
  size: null,
  term: false,
};

const sameFacts = (a: Facts, b: Facts) =>
  a.block === b.block &&
  a.link === b.link &&
  a.color === b.color &&
  a.background === b.background &&
  a.size === b.size &&
  a.term === b.term &&
  a.formats.length === b.formats.length &&
  a.formats.every((format, index) => format === b.formats[index]);

export function SelectionToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const {
    strings,
    media,
    studio,
    puzzles,
    bank,
    standards,
    lockQuestions,
    narration: narrates,
    lessonActivities,
    feedbackTiming,
    locale,
    questions,
    tools,
  } = useEditorEnvironment();
  const [mode, setMode] = useState<Mode>("hidden");
  const [math, setMath] = useState<MathFacts | null>(null);
  const [footnote, setFootnote] = useState<FootnoteFacts | null>(null);
  const [term, setTerm] = useState<TermBarFacts | null>(null);
  const [drawing, setDrawing] = useState<DrawFacts | null>(null);
  const [naming, setNaming] = useState<NamingFacts | null>(null);
  // The standards panel tags the question the caret is in, or names a block's.
  const [tagging, setTagging] = useState<"question" | "block">("question");
  const tags = useBankTags(mode === "draw" ? bank : undefined);
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
  const versionInput = useRef<HTMLInputElement>(null);
  // An upload under way, or failed, is about the file it was for.
  const [versioning, setVersioning] = useState<{
    key: string;
    state: "busy" | "failed";
  } | null>(null);
  const [ltiFacts, setLtiFacts] = useState<LtiBarFacts | null>(null);
  // A pick under way in a tool's window, or one the browser would not
  // open, is about the link it was for.
  const [picking, setPicking] = useState<{
    key: NodeKey;
    state: "busy" | "blocked";
    cancel?: () => void;
  } | null>(null);
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
    line: false,
    from: "",
    to: "",
    step: "",
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
          size: $selectionTextSize(),
          term: $termOf(selection.anchor.getNode()) !== null,
        },
      };
    });

  const readTerm = (key?: NodeKey) =>
    editor.getEditorState().read((): Omit<TermBarFacts, "fresh"> | null => {
      const selection = $getSelection();
      const node = key
        ? $getNodeByKey(key)
        : $isRangeSelection(selection)
          ? $termOf(selection.anchor.getNode())
          : null;
      if (!$isTermNode(node)) return null;
      return {
        key: node.getKey(),
        words: node.getTextContent(),
        facts: node.getFacts(),
      };
    });

  const readMath = () =>
    editor.getEditorState().read((): MathFacts | null => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return null;
      const nodes = selection.getNodes();
      const node = nodes.length === 1 ? nodes[0] : null;
      if (!$isMathNode(node)) return null;
      return {
        key: node.getKey(),
        latex: node.getLatex(),
        block: node.isBlock(),
        rtl: node.isRtl(),
      };
    });

  const readFootnote = () =>
    editor.getEditorState().read((): FootnoteFacts | null => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return null;
      const nodes = selection.getNodes();
      const node = nodes.length === 1 ? nodes[0] : null;
      if (!$isFootnoteNode(node)) return null;
      return {
        key: node.getKey(),
        note: node.getNote(),
        source: node.getSource(),
      };
    });

  const readDraw = () =>
    editor.getEditorState().read((): DrawFacts | null => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return null;
      const nodes = selection.getNodes();
      const node = nodes.length === 1 ? nodes[0] : null;
      if (!$isDrawNode(node)) return null;
      return { key: node.getKey(), ...node.getSettings() };
    });

  const readStandardsBlock = () =>
    editor.getEditorState().read((): NamingFacts | null => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return null;
      const nodes = selection.getNodes();
      const node = nodes.length === 1 ? nodes[0] : null;
      if (!$isStandardsNode(node)) return null;
      return { key: node.getKey(), targets: node.getTargets() };
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
        recording: $isMediaNode(node)
          ? { ...node.getRecording(), framed: false }
          : $isEmbedNode(node)
            ? framedRecording(node.getRecording())
            : null,
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
      const mark = $markableAtCaret();
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
      // A drawing may be made over a picture, as a colouring page.
      if (
        !part &&
        (node.getSettings().kind === "counting" ||
          node.getSettings().kind === "spelling" ||
          node.getSettings().kind === "hotspot" ||
          node.getSettings().kind === "labelling" ||
          (node.getSettings().kind === "written" &&
            node.getSettings().answerWith === "drawing"))
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
        mark: mark ? { key: mark.getKey(), correct: mark.isCorrect() } : null,
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

  const readLti = () =>
    editor.getEditorState().read((): LtiBarFacts | null => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return null;
      const nodes = selection.getNodes();
      const node = nodes.length === 1 ? nodes[0] : null;
      if (!$isLtiNode(node)) return null;
      const { toolId } = node.getLink();
      const tool = tools?.list.find((row) => row.id === toolId);
      // A single tool with nothing to pick from leaves the bar nothing to offer.
      if (
        !tools ||
        (tools.list.length < 2 && !(tool?.deepLinking && tools.pick))
      )
        return null;
      return { key: node.getKey(), toolId };
    });

  const startPick = (link: LtiBarFacts) => {
    const key = link.key;
    const started = tools?.pick?.(link.toolId) ?? null;
    if (!started) {
      setPicking({ key, state: "blocked" });
      return;
    }
    setPicking({ key, state: "busy", cancel: started.cancel });
    void started.picked.then((picked) => {
      setPicking((current) =>
        current?.cancel === started.cancel ? null : current,
      );
      if (!picked) return;
      updateFromOutside(editor, () => {
        const node = $getNodeByKey(key);
        if ($isLtiNode(node) && node.getLink().toolId === link.toolId)
          $setLtiContent(node, { picked });
      });
    });
  };

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
      modeRef.current === "picture" ||
      modeRef.current === "standards" ||
      modeRef.current === "math" ||
      modeRef.current === "footnote" ||
      modeRef.current === "term"
    )
      return;
    const root = editor.getRootElement();
    const focused = root !== null && root.contains(document.activeElement);
    const formula = focused ? readMath() : null;
    if (formula) {
      setMath(formula);
      setReference(editor.getElementByKey(formula.key));
      return show("math");
    }
    const noted = focused ? readFootnote() : null;
    if (noted) {
      setFootnote(noted);
      setReference(editor.getElementByKey(noted.key));
      return show("footnote");
    }
    const draw = focused && !lockQuestions ? readDraw() : null;
    if (draw) {
      setDrawing(draw);
      setReference(editor.getElementByKey(draw.key));
      return show("draw");
    }
    const named = focused && standards ? readStandardsBlock() : null;
    if (named) {
      setNaming(named);
      setReference(editor.getElementByKey(named.key));
      return show("standards-block");
    }
    const file = focused ? readFile() : null;
    if (file) {
      setFileFacts(file);
      setReference(editor.getElementByKey(file.key));
      return show("file");
    }
    const linked = focused ? readLti() : null;
    if (linked) {
      setLtiFacts(linked);
      setReference(editor.getElementByKey(linked.key));
      return show("lti");
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
    // Typing reads the same facts on every key; new ones only when they
    // differ, or the whole bar would draw again with each letter.
    setFacts((current) =>
      sameFacts(current, state.facts) ? current : state.facts,
    );
    if (!state.collapsed && !state.code && state.text.trim()) {
      setReference(selectionReference(root));
      return show("format");
    }
    const defined = state.collapsed && state.facts.term ? readTerm() : null;
    if (defined) {
      setTerm({ ...defined, fresh: false });
      setReference(editor.getElementByKey(defined.key));
      return show("term-view");
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

  /** Opens a term's panel, defining the selected words first when asked. */
  const openTerm = (key: NodeKey | null, fresh: boolean) => {
    const found = key ? readTerm(key) : null;
    if (!found) return;
    setTerm({ ...found, fresh });
    setReference(editor.getElementByKey(found.key));
    show("term");
  };
  const define = () => {
    let key: NodeKey | null = null;
    updateFromOutside(editor, () => {
      key = $defineSelection()?.getKey() ?? null;
    });
    openTerm(key, true);
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
    // A menu hands focus back to the text once it has shut. A chosen block
    // keeps its selection through that, which no selection change reports,
    // so its bar comes back when the text has focus again.
    const focused = () => requestAnimationFrame(() => onRefresh());
    document.addEventListener("pointerup", up);
    return mergeRegister(
      () => document.removeEventListener("pointerup", up),
      editor.registerRootListener((next, previous) => {
        previous?.removeEventListener("pointerdown", down);
        previous?.removeEventListener("focus", focused);
        next?.addEventListener("pointerdown", down);
        next?.addEventListener("focus", focused);
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
      mode === "picture" ||
      mode === "standards" ||
      mode === "math" ||
      mode === "footnote" ||
      mode === "term"
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
        modeRef.current === "picture" ||
        modeRef.current === "standards" ||
        modeRef.current === "math" ||
        modeRef.current === "footnote" ||
        modeRef.current === "term"
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

  if (mode === "math" && math) {
    // Typing in the field writes the formula as it goes; focus stays there.
    const change = (patch: (node: MathNode) => void) =>
      editor.update(
        () => {
          const node = $getNodeByKey(math.key);
          if ($isMathNode(node)) patch(node);
        },
        { tag: SKIP_DOM_SELECTION_TAG },
      );
    const close = () => {
      show("hidden");
      updateFromOutside(editor, () => {
        const node = $getNodeByKey(math.key);
        if (!$isMathNode(node)) return;
        node.selectNext(0, 0);
        // A formula left empty is not kept.
        if (!node.getLatex().trim()) node.remove();
      });
    };
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        boundary={boundary}
        className="flex w-[34rem] max-w-[calc(100vw-1rem)] items-center gap-1 p-1.5"
        keepInView
        role="toolbar"
        label={strings.mathField}
      >
        <div ref={toolbar} className="contents">
          <MathInput
            key={math.key}
            value={math.latex}
            locale={locale}
            label={strings.mathField}
            onInput={(latex) => change((node) => node.setLatex(latex))}
            onEnter={close}
            onEscape={close}
            focused
          />
          <ToolButton
            label={strings.mathBlock}
            active={math.block}
            onClick={() => {
              change((node) => node.setBlock(!math.block));
              setMath({ ...math, block: !math.block });
            }}
          >
            <WrapText aria-hidden />
          </ToolButton>
          <ToolButton
            label={strings.mathRtl}
            active={math.rtl}
            onClick={() => {
              change((node) => node.setRtl(!math.rtl));
              setMath({ ...math, rtl: !math.rtl });
            }}
          >
            <ArrowRightLeft aria-hidden />
          </ToolButton>
          <ToolButton label={strings.questionDone} onClick={close}>
            <Check aria-hidden />
          </ToolButton>
          <ToolButton
            label={strings.mathRemove}
            onClick={() => {
              show("hidden");
              updateFromOutside(editor, () => {
                const node = $getNodeByKey(math.key);
                if (!$isMathNode(node)) return;
                node.selectNext(0, 0);
                node.remove();
              });
            }}
          >
            <Trash2 aria-hidden />
          </ToolButton>
        </div>
      </Floating>
    );
  }

  if (mode === "footnote" && footnote) {
    const close = () => {
      show("hidden");
      updateFromOutside(editor, () => {
        const node = $getNodeByKey(footnote.key);
        if (!$isFootnoteNode(node)) return;
        node.selectNext(0, 0);
        // A footnote left without words or a source is not kept.
        if (!node.getNote().trim() && !node.getSource()) node.remove();
      });
    };
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        boundary={boundary}
        className="w-[30rem] max-w-[calc(100vw-1rem)] p-3"
        keepInView
        label={strings.footnote}
      >
        <div ref={toolbar} className="contents">
          <FootnotePanel
            key={footnote.key}
            nodeKey={footnote.key}
            note={footnote.note}
            source={footnote.source}
            onClose={close}
            onRemove={() => {
              show("hidden");
              updateFromOutside(editor, () => {
                const node = $getNodeByKey(footnote.key);
                if (!$isFootnoteNode(node)) return;
                node.selectNext(0, 0);
                node.remove();
              });
            }}
          />
        </div>
      </Floating>
    );
  }

  if (mode === "term" && term) {
    const leave = (unwrap: boolean) => {
      show("hidden");
      updateFromOutside(editor, () => {
        const node = $getNodeByKey(term.key);
        if (!$isTermNode(node)) return;
        // A term left without a meaning is only its words again.
        if (unwrap || !node.getFacts().definition.trim()) {
          const last = node.getLastDescendant();
          node.unwrap();
          last?.selectEnd();
        } else node.selectNext(0, 0);
      });
    };
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        boundary={boundary}
        className="w-[26rem] max-w-[calc(100vw-1rem)] p-3"
        keepInView
        label={strings.termDefinition}
      >
        <div ref={toolbar} className="contents">
          <TermPanel
            key={term.key}
            nodeKey={term.key}
            words={term.words}
            facts={term.facts}
            fresh={term.fresh}
            onClose={() => leave(false)}
            onRemove={() => leave(true)}
          />
        </div>
      </Floating>
    );
  }

  if (mode === "term-view" && term) {
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        className="flex max-w-[min(24rem,calc(100vw-1rem))] items-center gap-1 p-1"
        keepFocus
        role="toolbar"
        label={strings.termDefinition}
      >
        <span className="flex min-w-0 items-center gap-1.5 px-2 py-1 text-sm">
          <BookA
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span dir="auto" className="truncate">
            {term.facts.definition}
          </span>
        </span>
        <ToolButton
          label={strings.termEdit}
          onClick={() => openTerm(term.key, true)}
        >
          <Pencil aria-hidden />
        </ToolButton>
        <ToolButton
          label={strings.termRemove}
          onClick={() => {
            show("hidden");
            updateFromOutside(editor, () => {
              const node = $getNodeByKey(term.key);
              if ($isTermNode(node)) node.unwrap();
            });
          }}
        >
          <BookX aria-hidden />
        </ToolButton>
      </Floating>
    );
  }

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
              {layout.recording.framed ? null : (
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
              )}
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
              {layout.recording.video ? (
                <ToolButton
                  label={
                    layout.recording.descriptions
                      ? strings.descriptions
                      : strings.descriptionsAdd
                  }
                  active={layout.recording.descriptions}
                  onClick={() =>
                    editor.dispatchCommand(OPEN_RECORDING_COMMAND, {
                      key: layout.key,
                      tab: "descriptions",
                    })
                  }
                >
                  <AudioLines aria-hidden />
                </ToolButton>
              ) : null}
              {layout.recording.framed ? null : (
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
              )}
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
                        if ($isEmbedNode(node))
                          node.setNoSkipping(!node.getRecording()?.noSkipping);
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
        | "backwards"
        | "anonymous"
        | "gallery"
        | "classResults",
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
            : field === "bank"
              ? (settings.bank ?? []).join(", ")
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
    const feedbackText = (value: FeedbackTime) =>
      value === "end"
        ? strings.questionFeedbackEnd
        : value === "teacher"
          ? strings.questionFeedbackTeacher
          : strings.questionFeedbackNow;
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
    const formText = (choice: string | null) => {
      const [form = "any", places] = (choice ?? "any").split(":");
      if (form === "figures")
        return strings.questionMathFigures(Number(places));
      if (form === "places") return strings.questionMathPlaces(Number(places));
      const written = MATH_FORMS.find((each) => each === form);
      return strings.questionMathForms[
        written && isWrittenForm(written) ? written : "any"
      ];
    };
    const unitsText = (value: "convert" | "same" | null) =>
      value === "convert"
        ? strings.questionMathUnitsConvert
        : value === "same"
          ? strings.questionMathUnitsSame
          : strings.questionMathUnitsNone;
    const toleranceText = (value: number) =>
      value === 0
        ? strings.questionToleranceExact
        : strings.questionToleranceWithin(
            new Intl.NumberFormat(locale).format(value),
          );
    const flashText = (value: number | null) =>
      value === null
        ? strings.questionFlashOff
        : strings.questionFlashSeconds(value);
    const answerByText = (value: AnswerBy) =>
      value === null
        ? strings.questionByWriting
        : value === "reading"
          ? strings.questionRead
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
      (settings.reading && settings.recordSeconds !== null
        ? "reading"
        : settings.recordVideo
          ? settings.recordSeconds === 180
            ? "video-180"
            : "video-90"
          : (ANSWER_BY.find((value) => value === settings.recordSeconds) ??
            null));
    // Reading aloud reads the question's passage, which only it keeps.
    const answerBy = (value: AnswerBy) =>
      withSelection(() => {
        const node = $getNodeByKey(question.key);
        if (!$isQuestionNode(node)) return;
        const reading = value === "reading";
        node.setSettings(
          reading
            ? {
                answerWith: null,
                recordSeconds: 180,
                recordVideo: false,
                reading,
              }
            : value === "video-90" || value === "video-180"
              ? {
                  answerWith: null,
                  recordSeconds: value === "video-90" ? 90 : 180,
                  recordVideo: true,
                  reading,
                }
              : typeof value === "string"
                ? {
                    answerWith: value,
                    recordSeconds: null,
                    recordVideo: false,
                    reading,
                  }
                : {
                    answerWith: null,
                    recordSeconds: value,
                    recordVideo: false,
                    reading,
                  },
        );
        const passages = node.getChildren().filter($isQuestionPassageNode);
        if (reading && passages.length === 0)
          node.append(new QuestionPassageNode());
        if (!reading) for (const passage of passages) passage.remove();
      });
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
          {settings.suggested ? (
            <ToolButton
              label={strings.questionKeep}
              onClick={() => change({ suggested: false })}
            >
              <Check aria-hidden />
            </ToolButton>
          ) : null}
          {/* A poll counts for nothing, and is answered once. */}
          {settings.kind === "poll" ? null : (
            <BarMenu
              label={strings.questionPoints(settings.points)}
              current={strings.questionPoints(settings.points)}
              values={POINTS}
              text={(value) => strings.questionPoints(value)}
              onPick={(points) => change({ points })}
              onOpenChange={trackMenu}
              finalFocus={textFocus(editor)}
            />
          )}
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
                  onPick={answerBy}
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
            <>
              <BarChecks
                label={strings.questionChecks}
                values={SCRATCH_FEATURES}
                picked={settings.projectChecks}
                text={(feature) => strings.questionCheckNames[feature]}
                onChange={(projectChecks) =>
                  // The caret is left where it is: putting it back would
                  // take the focus from the menu, which stays open.
                  editor.update(
                    () => {
                      const node = $getNodeByKey(question.key);
                      if ($isQuestionNode(node))
                        node.setSettings({ projectChecks });
                    },
                    { tag: SKIP_DOM_SELECTION_TAG },
                  )
                }
                onOpenChange={trackMenu}
                finalFocus={textFocus(editor)}
              />
              {studio ? (
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
              ) : null}
            </>
          ) : settings.kind === "puzzle" ? (
            puzzles && settings.puzzle ? (
              <ToolButton
                label={strings.questionPuzzleEdit}
                onClick={() => {
                  const key = question.key;
                  const puzzle = settings.puzzle;
                  if (!puzzle) return;
                  // The designer covers the page, so the question is found
                  // again by its key once the teacher has saved.
                  void puzzles.edit(puzzle).then((next) => {
                    if (!next) return;
                    updateFromOutside(editor, () => {
                      const node = $getNodeByKey(key);
                      if ($isQuestionNode(node))
                        node.setSettings({ puzzle: next });
                    });
                  });
                }}
              >
                <Grid2x2 aria-hidden />
              </ToolButton>
            ) : null
          ) : settings.kind === "project" ? (
            studio ? (
              <>
                {settings.projectLanguage === "microbit" ? (
                  <BarMenu
                    label={strings.questionEditors}
                    current={
                      strings.questionEditorNames[
                        lockOf(settings.projectFiles) ?? "all"
                      ]
                    }
                    values={EDITOR_LOCKS}
                    text={(lock) => strings.questionEditorNames[lock]}
                    onPick={(lock) => {
                      // The hold is the project's own, so it is written into
                      // the files students start from: the blank project's
                      // where the teacher has built none.
                      const blank = blankOf("microbit", "en", false);
                      const held = locked(
                        settings.projectFiles.length > 0
                          ? settings.projectFiles
                          : blank,
                        lock === "all" ? null : lock,
                      );
                      change({
                        projectFiles: sameFiles(held, blank) ? [] : held,
                      });
                    }}
                    onOpenChange={trackMenu}
                    finalFocus={textFocus(editor)}
                  />
                ) : null}
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
                      .editFiles(
                        settings.projectFiles,
                        settings.projectLanguage,
                      )
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
              {feedbackTiming &&
              DEFERRABLE.has(settings.kind) &&
              !(settings.kind === "matching" && settings.memory) ? (
                <BarMenu
                  label={strings.questionFeedbackAt}
                  current={feedbackText(settings.feedbackAt)}
                  values={FEEDBACK_TIMES}
                  text={feedbackText}
                  onPick={(feedbackAt) => change({ feedbackAt })}
                  onOpenChange={trackMenu}
                  finalFocus={textFocus(editor)}
                />
              ) : null}
              {/* An answer whose feedback waits is one go, changed until then. */}
              {(feedbackTiming && settings.feedbackAt !== "now") ||
              settings.kind === "poll" ? null : (
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
            </>
          )}
          {settings.kind === "math" ? (
            <>
              <BarMenu
                label={strings.questionMathTolerance}
                current={toleranceText(settings.tolerance)}
                values={MATH_TOLERANCES}
                text={toleranceText}
                onPick={(tolerance) => change({ tolerance })}
                onOpenChange={trackMenu}
                finalFocus={textFocus(editor)}
              />
              <BarMenu
                label={strings.questionMathForm}
                current={formText(
                  settings.mathForm && PRECISION_FORMS.has(settings.mathForm)
                    ? `${settings.mathForm}:${settings.mathPlaces ?? 0}`
                    : settings.mathForm,
                )}
                values={MATH_FORM_CHOICES}
                text={formText}
                onPick={(choice) => {
                  const [form, places] = (choice ?? "").split(":");
                  const mathForm =
                    MATH_FORMS.find((each) => each === form) ?? null;
                  change({
                    mathForm,
                    mathPlaces: places === undefined ? null : Number(places),
                  });
                }}
                onOpenChange={trackMenu}
                finalFocus={textFocus(editor)}
              />
              <BarMenu
                label={strings.questionMathUnits}
                current={unitsText(settings.mathUnits)}
                values={MATH_UNITS}
                text={unitsText}
                onPick={(mathUnits) => change({ mathUnits })}
                onOpenChange={trackMenu}
                finalFocus={textFocus(editor)}
              />
            </>
          ) : null}
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
          {settings.kind === "wordsearch"
            ? toggle(
                "backwards",
                strings.questionBackwards,
                <Move aria-hidden />,
              )
            : null}
          {settings.kind === "gaps" ? (
            <ToolButton
              label={strings.questionBank}
              active={settings.bank !== null}
              onClick={() =>
                change({ bank: settings.bank === null ? [] : null })
              }
            >
              <Boxes aria-hidden />
            </ToolButton>
          ) : null}
          {settings.kind === "gaps" && settings.bank !== null ? (
            <ToolButton
              label={strings.questionBankWords}
              active={settings.bank.length > 0}
              onClick={() => write("bank")}
            >
              <ListPlus aria-hidden />
            </ToolButton>
          ) : null}
          {(settings.kind === "project" || settings.kind === "scratch") &&
          lessonActivities
            ? toggle("gallery", strings.questionGallery, <Images aria-hidden />)
            : null}
          {(settings.kind === "hotspot" || settings.kind === "labelling") &&
          question.part?.picture &&
          media ? (
            <ToolButton
              label={
                settings.kind === "labelling"
                  ? strings.questionMarkLabels
                  : strings.questionMarkPlaces
              }
              active={settings.places.length > 0}
              onClick={() => {
                saved.current = editor
                  .getEditorState()
                  .read(() => $getSelection()?.clone() ?? null);
                show("regions");
              }}
            >
              {settings.kind === "labelling" ? (
                <Tags aria-hidden />
              ) : (
                <ScanSearch aria-hidden />
              )}
            </ToolButton>
          ) : null}
          {settings.kind === "labelling" ? (
            <ToolButton
              label={strings.questionLabelExtras}
              active={(settings.bank ?? []).length > 0}
              onClick={() => write("bank")}
            >
              <ListPlus aria-hidden />
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
                  line: settings.line !== null,
                  from: String(settings.line?.from ?? 0),
                  to: String(settings.line?.to ?? 10),
                  step: String(settings.line?.step ?? 1),
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
          {settings.kind === "poll" ? (
            <>
              {toggle(
                "multiple",
                strings.questionPollSeveral,
                <ListChecks aria-hidden />,
              )}
              {toggle(
                "classResults",
                strings.questionClassResults,
                <ChartColumnBig aria-hidden />,
              )}
              {toggle(
                "anonymous",
                strings.questionAnonymous,
                <VenetianMask aria-hidden />,
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
          {settings.kind === "poll" ? null : (
            <ToolButton
              label={strings.questionHint}
              active={settings.hints.length > 0}
              onClick={writeHints}
            >
              <Lightbulb aria-hidden />
            </ToolButton>
          )}
          <ToolButton
            label={strings.questionExplanation}
            active={Boolean(settings.explanation)}
            onClick={() => write("explanation")}
          >
            <MessageCircleQuestion aria-hidden />
          </ToolButton>
          {standards && settings.kind !== "poll" ? (
            <ToolButton
              label={strings.questionStandards}
              active={settings.standards.length > 0}
              onClick={() => {
                saved.current = editor
                  .getEditorState()
                  .read(() => $getSelection()?.clone() ?? null);
                setTagging("question");
                show("standards");
              }}
            >
              <Target aria-hidden />
            </ToolButton>
          ) : null}
          {question.mark ? (
            <ToolButton
              label={
                settings.kind === "parsons"
                  ? strings.questionDistractor
                  : strings.questionRightAnswer
              }
              shortcut="Mod+Enter"
              active={question.mark.correct}
              onClick={() =>
                withSelection(() => {
                  const option = question.mark
                    ? $getNodeByKey(question.mark.key)
                    : null;
                  if ($isQuestionOptionNode(option)) $toggleMark(option);
                })
              }
            >
              {settings.kind === "parsons" ? (
                <CircleX aria-hidden />
              ) : (
                <CircleCheck aria-hidden />
              )}
            </ToolButton>
          ) : null}
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
          {bank ? (
            <ToolButton
              label={strings.bankKeep}
              onClick={() => {
                const kept = editor.getEditorState().read(() => {
                  const node = $getNodeByKey(question.key);
                  return $isQuestionNode(node)
                    ? (serialized(node) as unknown as ContentNode)
                    : null;
                });
                if (kept)
                  bank.keep({
                    root: {
                      type: "root",
                      version: 1,
                      direction: null,
                      format: "",
                      indent: 0,
                      children: [kept],
                    },
                  });
              }}
            >
              <BookmarkPlus aria-hidden />
            </ToolButton>
          ) : null}
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
            places={question.settings.places}
            labels={question.settings.kind === "labelling"}
            onClose={close}
            onDone={(places) => {
              withSelection(() => {
                const node = $getNodeByKey(question.key);
                if ($isQuestionNode(node)) node.setSettings({ places });
              });
              close();
            }}
          />
        </div>
      </Floating>
    );
  }

  if (mode === "standards-block" && naming && standards) {
    return (
      <Floating
        reference={reference}
        placement="top"
        boundary={boundary}
        className="flex items-center gap-0.5 p-1"
        keepFocus
        role="toolbar"
        label={strings.standardsBlockOptions}
      >
        <div ref={toolbar} className="contents">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              saved.current = editor
                .getEditorState()
                .read(() => $getSelection()?.clone() ?? null);
              setTagging("block");
              show("standards");
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
          >
            <Target aria-hidden />
            {strings.standardsChoose}
          </button>
        </div>
      </Floating>
    );
  }

  if (mode === "standards" && tagging === "block" && naming && standards) {
    const close = () => {
      show("standards-block");
      focusText(editor);
    };
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        boundary={boundary}
        className="w-96 max-w-[calc(100vw-1rem)] p-2"
        keepInView
      >
        <div ref={toolbar}>
          <StandardsPad
            standards={standards}
            chosen={naming.targets.map((target) => target.id)}
            seen={naming.targets.map((target) => ({
              ...target,
              frameworkTitle: "",
            }))}
            max={MAX_BLOCK_STANDARDS}
            onClose={close}
            onDone={(_, refs) => {
              const targets = refs.map(({ id, code, statement }) => ({
                id,
                code,
                statement,
              }));
              withSelection(() => {
                const node = $getNodeByKey(naming.key);
                if ($isStandardsNode(node)) node.setTargets(targets);
              });
              setNaming({ key: naming.key, targets });
              close();
            }}
          />
        </div>
      </Floating>
    );
  }

  if (mode === "standards" && tagging === "question" && question && standards) {
    const close = () => {
      show("question");
      focusText(editor);
    };
    return (
      <Floating
        reference={reference}
        placement="top-start"
        boundary={boundary}
        className="w-96 max-w-[calc(100vw-1rem)] p-2"
        keepInView
      >
        <div ref={toolbar}>
          <StandardsPad
            standards={standards}
            chosen={question.settings.standards}
            onClose={close}
            onDone={(ids) => {
              withSelection(() => {
                const node = $getNodeByKey(question.key);
                if ($isQuestionNode(node)) node.setSettings({ standards: ids });
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
      bank:
        question.settings.kind === "labelling"
          ? strings.questionLabelExtras
          : strings.questionBankWords,
    };
    const limits: Record<QuestionText, number> = {
      explanation: 1000,
      feedback: 300,
      alt: 300,
      bank: 800,
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
        if (!$isQuestionNode(node)) return;
        if (editing === "bank")
          node.setSettings({
            bank: [
              ...new Set(
                value
                  .split(/[,،\n]/u)
                  .map((word) => word.trim())
                  .filter((word) => word !== ""),
              ),
            ].slice(
              0,
              question.settings.kind === "labelling"
                ? MAX_LABEL_EXTRAS
                : MAX_BANK_WORDS,
            ),
          });
        else node.setSettings({ [editing]: value });
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
      from: parseNumber(numbers.from),
      to: parseNumber(numbers.to),
      step: parseNumber(numbers.step),
    };
    const line =
      numbers.line &&
      parsed.from !== null &&
      parsed.to !== null &&
      parsed.step !== null &&
      parsed.step > 0 &&
      parsed.from < parsed.to &&
      (parsed.to - parsed.from) / parsed.step <= MAX_LINE_STEPS
        ? { from: parsed.from, to: parsed.to, step: parsed.step }
        : null;
    const valid =
      (numbers.mode === "exact"
        ? parsed.value !== null &&
          parsed.tolerance !== null &&
          parsed.tolerance >= 0
        : parsed.min !== null &&
          parsed.max !== null &&
          parsed.min <= parsed.max) &&
      (!numbers.line || line !== null);
    const done = () => {
      if (!valid) return;
      withSelection(() => {
        const node = $getNodeByKey(question.key);
        if (!$isQuestionNode(node)) return;
        node.setSettings({
          ...(numbers.mode === "exact"
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
              }),
          line,
        });
      });
      show("question");
      focusText(editor);
    };
    const input = (
      key: "value" | "tolerance" | "min" | "max" | "from" | "to" | "step",
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
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={numbers.line}
              onChange={(event) =>
                setNumbers((current) => ({
                  ...current,
                  line: event.target.checked,
                }))
              }
            />
            {strings.questionLine}
          </label>
          {numbers.line ? (
            <div className="grid grid-cols-3 gap-2">
              {input("from", strings.questionLineFrom)}
              {input("to", strings.questionLineTo)}
              {input("step", strings.questionLineStep)}
            </div>
          ) : null}
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

  if (mode === "draw" && drawing) {
    const change = (settings: Partial<Omit<DrawFacts, "key">>) =>
      withSelection(() => {
        const node = $getNodeByKey(drawing.key);
        if ($isDrawNode(node)) node.setSettings(settings);
      });
    const counted = new Map(
      (tags ?? []).map((item) => [item.tag, item.questions]),
    );
    return (
      <Floating
        reference={reference}
        placement="top"
        boundary={boundary}
        className="flex flex-wrap items-center gap-0.5 p-1"
        keepFocus
        role="toolbar"
        label={strings.drawOptions}
      >
        <div ref={toolbar} className="contents">
          {tags && tags.length === 0 ? (
            <span className="inline-flex h-8 items-center px-2 text-sm text-muted-foreground">
              {strings.drawNoTags}
            </span>
          ) : (
            <BarMenu
              label={strings.drawTag}
              current={drawing.tag || strings.drawTagNone}
              values={[...counted.keys()]}
              text={(tag) => `${tag} · ${counted.get(tag) ?? 0}`}
              onPick={(tag) => change({ tag })}
              onOpenChange={trackMenu}
              finalFocus={textFocus(editor)}
            />
          )}
          {separator}
          <BarMenu
            label={strings.drawCountLabel}
            current={strings.drawCount(drawing.count)}
            values={DRAW_COUNTS}
            text={(count) => strings.drawCount(count)}
            onPick={(count) => change({ count })}
            onOpenChange={trackMenu}
            finalFocus={textFocus(editor)}
          />
          <BarMenu
            label={strings.drawPointsLabel}
            current={strings.drawPointsEach(drawing.points)}
            values={POINTS}
            text={(points) => strings.drawPointsEach(points)}
            onPick={(points) => change({ points })}
            onOpenChange={trackMenu}
            finalFocus={textFocus(editor)}
          />
        </div>
      </Floating>
    );
  }

  if (mode === "lti" && ltiFacts && tools) {
    const tool = tools.list.find((row) => row.id === ltiFacts.toolId);
    const pick = picking?.key === ltiFacts.key ? picking : null;
    const action =
      "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4";
    return (
      <Floating
        reference={reference}
        placement="top"
        boundary={boundary}
        className="flex items-center gap-0.5 p-1"
        keepFocus
        role="toolbar"
        label={strings.ltiOptions}
      >
        <div ref={toolbar} className="contents">
          {tools.list.length > 1 ? (
            <Menu.Root onOpenChange={trackMenu}>
              <Menu.Trigger
                aria-label={strings.ltiChooseTool}
                className={action}
              >
                <AppWindow aria-hidden />
                <span className="max-w-48 truncate" dir="auto">
                  {tool?.name ?? strings.ltiChooseTool}
                </span>
                <ChevronDown className="size-3.5 opacity-60" aria-hidden />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner className="z-50" sideOffset={6} align="start">
                  <Menu.Popup
                    className={menuPopupClass}
                    finalFocus={textFocus(editor)}
                  >
                    {tools.list.map((row) => (
                      <Menu.Item
                        key={row.id}
                        className={menuItemClass}
                        onClick={() =>
                          withSelection(() => {
                            const node = $getNodeByKey(ltiFacts.key);
                            if (
                              $isLtiNode(node) &&
                              node.getLink().toolId !== row.id
                            )
                              $setLtiContent(node, { toolId: row.id });
                          })
                        }
                      >
                        <span className="flex-1" dir="auto">
                          {row.name}
                        </span>
                        {ltiFacts.toolId === row.id ? (
                          <span className="size-1.5 rounded-full bg-primary" />
                        ) : null}
                      </Menu.Item>
                    ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          ) : null}
          {tool?.deepLinking && tools.pick ? (
            <>
              {tools.list.length > 1 ? separator : null}
              {pick?.state === "busy" ? (
                <>
                  <output className="px-2 text-sm text-muted-foreground">
                    {strings.ltiPicking}
                  </output>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick.cancel?.()}
                    className={action}
                  >
                    <X aria-hidden />
                    {strings.ltiPickCancel}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => startPick(ltiFacts)}
                  className={action}
                >
                  <Library aria-hidden />
                  {pick?.state === "blocked"
                    ? strings.ltiPickBlocked
                    : strings.ltiPick}
                </button>
              )}
            </>
          ) : null}
        </div>
      </Floating>
    );
  }

  if (mode === "file" && fileFacts) {
    const fileUrl = media?.url(fileFacts.fileId);
    const versioned =
      versioning?.key === fileFacts.key ? versioning.state : "idle";
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
          {media ? (
            <>
              {separator}
              {/* A worksheet copied to each student comes back as the
                  version they worked on, in the same place. */}
              <button
                type="button"
                disabled={versioned === "busy"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => versionInput.current?.click()}
                className={action}
              >
                <FileUp aria-hidden />
                {versioned === "failed"
                  ? strings.fileNewVersionFailed
                  : strings.fileNewVersion}
              </button>
              <input
                ref={versionInput}
                type="file"
                hidden
                tabIndex={-1}
                aria-hidden
                accept={media.accept.file.join(",")}
                onChange={(event) => {
                  const [chosen] = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (!chosen) return;
                  const key = fileFacts.key;
                  setVersioning({ key, state: "busy" });
                  media
                    .upload(chosen, "file")
                    .then((uploaded) => {
                      setVersioning(null);
                      updateFromOutside(editor, () => {
                        const node = $getNodeByKey(key);
                        if ($isFileNode(node)) node.setFile(uploaded);
                      });
                    })
                    .catch(() => setVersioning({ key, state: "failed" }));
                }}
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
    {
      format: "superscript",
      label: strings.superscript,
      icon: Superscript,
      shortcut: "Mod+.",
    },
    {
      format: "subscript",
      label: strings.subscript,
      icon: Subscript,
      shortcut: "Mod+,",
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
        <ToolButton
          label={strings.mathInsert}
          shortcut={shortcutLabel("Alt+=")}
          onClick={() => editor.update(() => void $insertMath())}
        >
          <Sigma aria-hidden />
        </ToolButton>
        <ToolButton
          label={strings.footnoteAdd}
          shortcut={shortcutLabel("Mod+Alt+F")}
          onClick={() => editor.update(() => void $insertFootnote())}
        >
          <Asterisk aria-hidden />
        </ToolButton>
        <ToolButton
          label={strings.termDefine}
          active={facts.term}
          onClick={define}
        >
          <BookA aria-hidden />
        </ToolButton>
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
        <TextSizeMenu
          size={facts.size}
          onOpenChange={trackMenu}
          onPick={(size) => withSelection(() => $applyTextSize(size))}
        />
        <ToolButton
          label={strings.clearFormatting}
          shortcut={shortcutLabel("Mod+\\")}
          onClick={() => withSelection(() => $clearFormatting())}
        >
          <RemoveFormatting aria-hidden />
        </ToolButton>
      </div>
    </Floating>
  );
}

/** How big the selected words are, from small to huge, as shares of the text around them. */
function TextSizeMenu({
  size,
  onOpenChange,
  onPick,
}: {
  size: TextSize | null;
  onOpenChange: (open: boolean) => void;
  onPick: (size: TextSize | null) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  return (
    <Menu.Root onOpenChange={onOpenChange}>
      <Tip label={strings.textSize}>
        <Menu.Trigger
          aria-label={strings.textSize}
          className="inline-flex h-8 items-center gap-0.5 rounded-md px-1.5 text-foreground/80 hover:bg-accent hover:text-foreground"
        >
          <ALargeSmall className="size-4" aria-hidden />
          <ChevronDown className="size-3 opacity-60" aria-hidden />
        </Menu.Trigger>
      </Tip>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={6} align="start">
          <Menu.Popup
            className={cx(menuPopupClass, "w-44")}
            finalFocus={textFocus(editor)}
          >
            {(["small", null, "large", "huge"] as const).map((each) => (
              <Menu.Item
                key={each ?? "normal"}
                className={menuItemClass}
                onClick={() => onPick(each)}
              >
                <span
                  className="flex-1"
                  style={each ? { fontSize: TEXT_SIZES[each] } : undefined}
                >
                  {strings.textSizes[each ?? "normal"]}
                </span>
                {size === each ? (
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
