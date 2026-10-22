import type { QuestionKind } from "@faridalms/domain/content";
import type { ListType } from "@lexical/list";
import type {
  ElementNode,
  LexicalNode,
  SerializedElementNode,
  SerializedLexicalNode,
} from "lexical";
import type { LucideIcon } from "lucide-react";

import { $createCodeNode, $isCodeNode } from "@lexical/code";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
} from "@lexical/extension";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
} from "@lexical/rich-text";
import {
  $createTableNodeWithDimensions,
  $isTableCellNode,
  $isTableNode,
} from "@lexical/table";
import {
  $createParagraphNode,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isNodeSelection,
  $isRootNode,
  $parseSerializedNode,
} from "lexical";
import {
  AppWindow,
  ArrowDownUp,
  BookA,
  BookOpenText,
  FileText,
  CodeXml,
  FileCode,
  SquareTerminal,
  ArrowLeftRight,
  Blocks,
  MicVocal,
  ScanSearch,
  Dices,
  Signature,
  Brackets,
  Highlighter,
  Tags,
  Repeat2,
  Grid3x3,
  TextSearch,
  Vote,
  ChevronRight,
  CircleCheck,
  CircuitBoard,
  Copy,
  Clapperboard,
  ChartColumnBig,
  Code,
  Footprints,
  GitCommitVertical,
  Library,
  Sigma,
  SquareRadical,
  Columns2,
  Columns3,
  Heading1,
  Heading2,
  Group,
  Hash,
  Heading3,
  Image,
  Images,
  List,
  ListEnd,
  ListChecks,
  ListOrdered,
  Megaphone,
  MessageSquareText,
  Minus,
  MonitorPlay,
  PanelsTopLeft,
  Paperclip,
  Pilcrow,
  Puzzle,
  Quote,
  Route,
  ScissorsLineDashed,
  Shapes,
  Shuffle,
  Sparkles,
  SquareSplitHorizontal,
  SquareStack,
  Table,
  Target,
  TextCursorInput,
  ToggleRight,
  ToyBrick,
  Video,
} from "lucide-react";

import type { EditorStrings } from "./strings";

import {
  $createAiUseNode,
  $createCalloutNode,
  $createColumnNode,
  $createMathNode,
  $createQuestionNode,
  $createTrueFalseQuestion,
  $createMicrobitQuestion,
  $createPuzzleQuestion,
  $createPythonQuestion,
  $createSketchQuestion,
  $createLtiNode,
  $isLtiNode,
  $selectLti,
  $createReadingQuestion,
  $createWhyQuestion,
  $createColumnsNode,
  $createToggleContentNode,
  $createToggleNode,
  $createPanel,
  $createPanelsNode,
  $createChartNode,
  $createCompareNode,
  $createGalleryNode,
  $isChartNode,
  $isCompareNode,
  $isGalleryNode,
  $createToggleTitleNode,
  $isCalloutNode,
  $isColumnsNode,
  $isDrawNode,
  $isMathNode,
  $isQuestionNode,
  $isToggleNode,
  $isPanelsNode,
  $nearestBlock,
  $selectDraw,
  $selectMath,
  $isStandardsNode,
  $selectStandards,
  StandardsNode,
  $isStarterNode,
  DrawNode,
  GateNode,
  GlossaryNode,
  PageBreakNode,
  StarterNode,
} from "./nodes";

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "number"
  | "check"
  | "quote"
  | "code"
  | "equation"
  | "callout"
  | "toggle"
  | "tabs"
  | "steps"
  | "timeline"
  | "cards"
  | "divider"
  | "table"
  | "columns2"
  | "columns3"
  | "image"
  | "gallery"
  | "compare"
  | "chart"
  | "file"
  | "media"
  | "recording"
  | "embed"
  | "diagram"
  | "choiceQuestion"
  | "typedQuestion"
  | "mathQuestion"
  | "writtenQuestion"
  | "numberQuestion"
  | "orderingQuestion"
  | "parsonsQuestion"
  | "programQuestion"
  | "matchingQuestion"
  | "sortingQuestion"
  | "countingQuestion"
  | "tracingQuestion"
  | "spellingQuestion"
  | "hotspotQuestion"
  | "labellingQuestion"
  | "crosswordQuestion"
  | "wordsearchQuestion"
  | "scratchQuestion"
  | "projectQuestion"
  | "sketchQuestion"
  | "pythonQuestion"
  | "microbitQuestion"
  | "puzzleQuestion"
  | "arrowsQuestion"
  | "gapsQuestion"
  | "highlightQuestion"
  | "trueFalseQuestion"
  | "pollQuestion"
  | "whyQuestion"
  | "readingQuestion"
  | "outsideTool"
  | "gate"
  | "pageBreak"
  | "studentCopy"
  | "aiUse"
  | "bankQuestion"
  | "sharedBlock"
  | "bankDraw"
  | "standards"
  | "glossary"
  | "word";

export type BlockGroup = "text" | "lists" | "media" | "layout" | "questions";

const QUESTION_KIND: Partial<Record<BlockType, QuestionKind>> = {
  choiceQuestion: "choice",
  trueFalseQuestion: "choice",
  pollQuestion: "poll",
  whyQuestion: "written",
  readingQuestion: "written",
  typedQuestion: "text",
  mathQuestion: "math",
  writtenQuestion: "written",
  numberQuestion: "number",
  orderingQuestion: "ordering",
  parsonsQuestion: "parsons",
  programQuestion: "program",
  matchingQuestion: "matching",
  sortingQuestion: "sorting",
  gapsQuestion: "gaps",
  highlightQuestion: "highlight",
  countingQuestion: "counting",
  tracingQuestion: "tracing",
  spellingQuestion: "spelling",
  hotspotQuestion: "hotspot",
  labellingQuestion: "labelling",
  crosswordQuestion: "crossword",
  wordsearchQuestion: "wordsearch",
  scratchQuestion: "scratch",
  projectQuestion: "project",
  sketchQuestion: "project",
  pythonQuestion: "project",
  microbitQuestion: "project",
  puzzleQuestion: "puzzle",
  arrowsQuestion: "puzzle",
};

export interface BlockDefinition {
  type: BlockType;
  group: BlockGroup;
  icon: LucideIcon;
  label: (strings: EditorStrings) => string;
  hint: (strings: EditorStrings) => string;
  keywords: string[];
  shortcut?: string;
  convertible?: boolean;
  media?: boolean;
  prompt?: boolean;
  /** Offered only where the document may ask questions, such as a lesson. */
  question?: boolean;
  /** Offered only in a brief, whose students each get a copy to work in. */
  starter?: boolean;
  /** Offered only in a student's own work. */
  aiUse?: boolean;
  /** Offered only in a lesson, which young children play. */
  activity?: boolean;
  /** Offered only where the coding studio is set up. */
  studio?: boolean;
  /** Offered only where a puzzle's grid can be made. */
  puzzle?: boolean;
  /** Offered only where questions are kept in a bank. */
  bank?: boolean;
  /** Offered only in a quiz drawing from the bank. */
  draw?: boolean;
  /** Offered only where the school's standards can be read. */
  standards?: boolean;
  /** Offered only where blocks are kept to show in many documents. */
  shared?: boolean;
  /** Offered only where the school has outside tools to link to. */
  tools?: boolean;
}

/** Which kinds of block a document may hold. */
export interface BlockScope {
  media: boolean;
  questions: boolean;
  gates: boolean;
  starter: boolean;
  aiUse: boolean;
  activities: boolean;
  studio: boolean;
  puzzles: boolean;
  bank: boolean;
  draws: boolean;
  standards: boolean;
  shared: boolean;
  tools: boolean;
}

export function blockScope(environment: {
  media?: unknown;
  questions?: boolean;
  gates?: boolean;
  starter?: boolean;
  aiUse?: boolean;
  lessonActivities?: boolean;
  studio?: unknown;
  puzzles?: unknown;
  bank?: unknown;
  draws?: boolean;
  standards?: unknown;
  shared?: unknown;
  tools?: { list: readonly unknown[] };
}): BlockScope {
  const questions = Boolean(environment.questions);
  return {
    media: Boolean(environment.media),
    questions,
    gates: environment.gates ?? questions,
    starter: Boolean(environment.starter),
    aiUse: Boolean(environment.aiUse),
    activities: Boolean(environment.lessonActivities),
    studio: Boolean(environment.studio),
    puzzles: Boolean(environment.puzzles),
    bank: questions && Boolean(environment.bank),
    draws: questions && Boolean(environment.bank) && Boolean(environment.draws),
    standards: Boolean(environment.standards),
    shared: Boolean(environment.shared),
    tools: Boolean(environment.tools?.list.length),
  };
}

export const offered = (block: BlockDefinition, scope: BlockScope) =>
  (scope.media || !block.media) &&
  (scope.questions || !block.question) &&
  (scope.gates || block.type !== "gate") &&
  (scope.starter || !block.starter) &&
  (scope.aiUse || !block.aiUse) &&
  (scope.activities || !block.activity) &&
  (scope.studio || !block.studio) &&
  (scope.puzzles || !block.puzzle) &&
  (scope.bank || !block.bank) &&
  (scope.draws || !block.draw) &&
  (scope.standards || !block.standards) &&
  (scope.shared || !block.shared) &&
  (scope.tools || !block.tools);

export const blockDefinitions: BlockDefinition[] = [
  {
    type: "paragraph",
    group: "text",
    icon: Pilcrow,
    label: (s) => s.text,
    hint: (s) => s.textHint,
    keywords: ["text", "paragraph", "plain", "نص", "فقرة"],
    convertible: true,
  },
  {
    type: "h1",
    group: "text",
    icon: Heading1,
    label: (s) => s.heading1,
    hint: (s) => s.heading1Hint,
    keywords: ["h1", "heading", "title", "عنوان"],
    shortcut: "#",
    convertible: true,
  },
  {
    type: "h2",
    group: "text",
    icon: Heading2,
    label: (s) => s.heading2,
    hint: (s) => s.heading2Hint,
    keywords: ["h2", "heading", "subtitle", "عنوان"],
    shortcut: "##",
    convertible: true,
  },
  {
    type: "h3",
    group: "text",
    icon: Heading3,
    label: (s) => s.heading3,
    hint: (s) => s.heading3Hint,
    keywords: ["h3", "heading", "عنوان"],
    shortcut: "###",
    convertible: true,
  },
  {
    type: "bullet",
    group: "lists",
    icon: List,
    label: (s) => s.bulletList,
    hint: (s) => s.bulletListHint,
    keywords: ["bullet", "list", "ul", "unordered", "قائمة", "نقطية"],
    shortcut: "-",
    convertible: true,
  },
  {
    type: "number",
    group: "lists",
    icon: ListOrdered,
    label: (s) => s.numberedList,
    hint: (s) => s.numberedListHint,
    keywords: ["number", "ordered", "ol", "list", "قائمة", "مرقمة"],
    shortcut: "1.",
    convertible: true,
  },
  {
    type: "check",
    group: "lists",
    icon: ListChecks,
    label: (s) => s.checklist,
    hint: (s) => s.checklistHint,
    keywords: ["todo", "task", "check", "checklist", "مهام", "مهمة"],
    shortcut: "[]",
    convertible: true,
  },
  {
    type: "toggle",
    group: "lists",
    icon: ChevronRight,
    label: (s) => s.toggle,
    hint: (s) => s.toggleHint,
    keywords: ["toggle", "collapse", "details", "accordion", "طي", "إخفاء"],
    convertible: true,
  },
  {
    type: "quote",
    group: "text",
    icon: Quote,
    label: (s) => s.quote,
    hint: (s) => s.quoteHint,
    keywords: ["quote", "blockquote", "citation", "اقتباس"],
    shortcut: ">",
    convertible: true,
  },
  {
    type: "aiUse",
    group: "media",
    icon: Sparkles,
    label: (s) => s.aiUse,
    hint: (s) => s.aiUseHint,
    keywords: [
      "ai",
      "chatgpt",
      "gemini",
      "acknowledge",
      "cite",
      "ذكاء",
      "اصطناعي",
    ],
    media: true,
    aiUse: true,
  },
  {
    type: "studentCopy",
    group: "layout",
    icon: Copy,
    label: (s) => s.studentCopy,
    hint: (s) => s.studentCopyHint,
    keywords: ["copy", "worksheet", "template", "student", "نسخة", "ورقة عمل"],
    starter: true,
  },
  {
    type: "standards",
    group: "text",
    icon: Target,
    label: (s) => s.standardsBlock,
    hint: (s) => s.standardsBlockHint,
    keywords: [
      "standards",
      "objectives",
      "outcomes",
      "goals",
      "learning intentions",
      "criteria",
      "معايير",
      "أهداف",
      "نواتج",
    ],
    standards: true,
  },
  {
    type: "glossary",
    group: "text",
    icon: BookA,
    label: (s) => s.glossary,
    hint: (s) => s.glossaryHint,
    keywords: [
      "glossary",
      "vocabulary",
      "key words",
      "terms",
      "definitions",
      "مسرد",
      "مفردات",
      "مصطلحات",
      "كلمات مفتاحية",
    ],
  },
  {
    type: "callout",
    group: "text",
    icon: Megaphone,
    label: (s) => s.callout,
    hint: (s) => s.calloutHint,
    keywords: ["callout", "note", "info", "tip", "warning", "ملاحظة", "تنبيه"],
    convertible: true,
  },
  {
    type: "code",
    group: "text",
    icon: Code,
    label: (s) => s.code,
    hint: (s) => s.codeHint,
    keywords: ["code", "snippet", "program", "كود", "برمجة"],
    shortcut: "```",
    convertible: true,
  },
  {
    type: "equation",
    group: "text",
    icon: Sigma,
    label: (s) => s.equation,
    hint: (s) => s.equationHint,
    keywords: [
      "math",
      "maths",
      "equation",
      "formula",
      "latex",
      "معادلة",
      "رياضيات",
      "صيغة",
    ],
    shortcut: "$$",
  },
  {
    type: "image",
    group: "media",
    icon: Image,
    label: (s) => s.image,
    hint: (s) => s.imageHint,
    keywords: ["image", "picture", "photo", "img", "صورة"],
    media: true,
  },
  {
    type: "gallery",
    group: "media",
    icon: Images,
    label: (s) => s.gallery,
    hint: (s) => s.galleryHint,
    keywords: ["gallery", "pictures", "photos", "album", "معرض", "صور"],
    media: true,
  },
  {
    type: "chart",
    group: "media",
    icon: ChartColumnBig,
    label: (s) => s.chart,
    hint: (s) => s.chartHint,
    keywords: [
      "chart",
      "graph",
      "bar",
      "line",
      "pie",
      "data",
      "رسم بياني",
      "مخطط",
      "بيانات",
    ],
  },
  {
    type: "compare",
    group: "media",
    icon: SquareSplitHorizontal,
    label: (s) => s.compare,
    hint: (s) => s.compareHint,
    keywords: ["before", "after", "compare", "slider", "قبل", "بعد", "مقارنة"],
    media: true,
  },
  {
    type: "media",
    group: "media",
    icon: Clapperboard,
    label: (s) => s.media,
    hint: (s) => s.mediaHint,
    keywords: ["video", "audio", "sound", "recording", "mp4", "فيديو", "صوت"],
    media: true,
  },
  {
    type: "recording",
    group: "media",
    icon: Video,
    label: (s) => s.recording,
    hint: (s) => s.recordingHint,
    keywords: [
      "record",
      "camera",
      "webcam",
      "screen",
      "loom",
      "تسجيل",
      "كاميرا",
      "شاشة",
    ],
    media: true,
  },
  {
    type: "file",
    group: "media",
    icon: Paperclip,
    label: (s) => s.file,
    hint: (s) => s.fileHint,
    keywords: ["file", "attachment", "upload", "pdf", "ملف", "مرفق"],
    media: true,
  },
  {
    type: "word",
    group: "media",
    icon: FileText,
    label: (s) => s.wordImport,
    hint: (s) => s.wordImportHint,
    keywords: [
      "word",
      "docx",
      "import",
      "document",
      "وورد",
      "استيراد",
      "مستند",
    ],
    media: true,
  },
  {
    type: "embed",
    group: "media",
    icon: MonitorPlay,
    label: (s) => s.embed,
    hint: (s) => s.embedHint,
    keywords: [
      "embed",
      "youtube",
      "vimeo",
      "google",
      "slides",
      "docs",
      "canva",
      "loom",
      "تضمين",
      "يوتيوب",
    ],
    prompt: true,
  },
  {
    type: "outsideTool",
    group: "media",
    icon: AppWindow,
    label: (s) => s.ltiTool,
    hint: (s) => s.ltiToolHint,
    keywords: [
      "lti",
      "tool",
      "app",
      "simulation",
      "publisher",
      "launch",
      "أداة",
      "تطبيق",
      "محاكاة",
    ],
    tools: true,
  },
  {
    type: "diagram",
    group: "media",
    icon: Shapes,
    label: (s) => s.diagram,
    hint: (s) => s.diagramHint,
    keywords: [
      "drawing",
      "diagram",
      "sketch",
      "whiteboard",
      "mind map",
      "رسم",
      "مخطط",
    ],
    media: true,
  },
  {
    type: "table",
    group: "layout",
    icon: Table,
    label: (s) => s.table,
    hint: (s) => s.tableHint,
    keywords: ["table", "grid", "rows", "جدول"],
  },
  {
    type: "columns2",
    group: "layout",
    icon: Columns2,
    label: (s) => s.columns2,
    hint: (s) => s.columnsHint,
    keywords: ["columns", "layout", "side", "two", "أعمدة", "عمودان"],
  },
  {
    type: "columns3",
    group: "layout",
    icon: Columns3,
    label: (s) => s.columns3,
    hint: (s) => s.columnsHint,
    keywords: ["columns", "layout", "three", "أعمدة", "ثلاثة"],
  },
  {
    type: "tabs",
    group: "layout",
    icon: PanelsTopLeft,
    label: (s) => s.tabs,
    hint: (s) => s.tabsHint,
    keywords: ["tabs", "sections", "panels", "تبويب", "علامات"],
  },
  {
    type: "steps",
    group: "layout",
    icon: Footprints,
    label: (s) => s.steps,
    hint: (s) => s.stepsHint,
    keywords: ["steps", "process", "how to", "procedure", "خطوات", "مراحل"],
  },
  {
    type: "timeline",
    group: "layout",
    icon: GitCommitVertical,
    label: (s) => s.timeline,
    hint: (s) => s.timelineHint,
    keywords: ["timeline", "history", "dates", "events", "خط زمني", "أحداث"],
  },
  {
    type: "cards",
    group: "layout",
    icon: SquareStack,
    label: (s) => s.cards,
    hint: (s) => s.cardsHint,
    keywords: ["flip", "cards", "flashcards", "vocabulary", "بطاقات", "مفردات"],
  },
  {
    type: "divider",
    group: "layout",
    icon: Minus,
    label: (s) => s.divider,
    hint: (s) => s.dividerHint,
    keywords: ["divider", "line", "hr", "separator", "فاصل", "خط"],
    shortcut: "---",
  },
  {
    type: "pageBreak",
    group: "layout",
    icon: ScissorsLineDashed,
    label: (s) => s.pageBreak,
    hint: (s) => s.pageBreakHint,
    keywords: ["page", "break", "print", "paper", "صفحة", "طباعة", "فاصل صفحة"],
  },
  {
    type: "choiceQuestion",
    group: "questions",
    icon: CircleCheck,
    label: (s) => s.questionChoice,
    hint: (s) => s.questionChoiceHint,
    keywords: ["question", "choice", "quiz", "mcq", "سؤال", "اختيار"],
    question: true,
  },
  {
    type: "trueFalseQuestion",
    group: "questions",
    icon: ToggleRight,
    label: (s) => s.questionTrueFalse,
    hint: (s) => s.questionTrueFalseHint,
    keywords: ["true", "false", "question", "statement", "صواب", "خطأ"],
    question: true,
  },
  {
    type: "pollQuestion",
    group: "questions",
    icon: Vote,
    label: (s) => s.questionPoll,
    hint: (s) => s.questionPollHint,
    keywords: ["poll", "vote", "survey", "opinion", "استطلاع", "تصويت", "رأي"],
    question: true,
  },
  {
    type: "typedQuestion",
    group: "questions",
    icon: TextCursorInput,
    label: (s) => s.questionTyped,
    hint: (s) => s.questionTypedHint,
    keywords: ["question", "typed", "answer", "short", "سؤال", "إجابة"],
    question: true,
  },
  {
    type: "sharedBlock",
    group: "layout",
    icon: Repeat2,
    label: (s) => s.sharedBlock,
    hint: (s) => s.sharedBlockHint,
    keywords: [
      "shared",
      "synced",
      "reuse",
      "snippet",
      "مشترك",
      "متكرر",
      "إعادة استخدام",
    ],
    shared: true,
  },
  {
    type: "bankQuestion",
    group: "questions",
    icon: Library,
    label: (s) => s.bankInsert,
    hint: (s) => s.bankInsertHint,
    keywords: ["bank", "kept", "saved", "reuse", "library", "بنك", "محفوظ"],
    question: true,
    bank: true,
  },
  {
    type: "bankDraw",
    group: "questions",
    icon: Shuffle,
    label: (s) => s.drawInsert,
    hint: (s) => s.drawInsertHint,
    keywords: ["draw", "random", "pool", "bank", "سحب", "عشوائي", "بنك"],
    question: true,
    bank: true,
    draw: true,
  },
  {
    type: "mathQuestion",
    group: "questions",
    icon: SquareRadical,
    label: (s) => s.questionMath,
    hint: (s) => s.questionMathHint,
    keywords: [
      "math",
      "maths",
      "formula",
      "equation",
      "expression",
      "رياضيات",
      "معادلة",
      "صيغة",
    ],
    question: true,
  },
  {
    type: "writtenQuestion",
    group: "questions",
    icon: MessageSquareText,
    label: (s) => s.questionWritten,
    hint: (s) => s.questionWrittenHint,
    keywords: ["question", "written", "essay", "long", "سؤال", "مقال"],
    question: true,
  },
  {
    type: "numberQuestion",
    group: "questions",
    icon: Hash,
    label: (s) => s.questionNumber,
    hint: (s) => s.questionNumberHint,
    keywords: ["question", "number", "numeric", "maths", "سؤال", "رقم"],
    question: true,
  },
  {
    type: "orderingQuestion",
    group: "questions",
    icon: ArrowDownUp,
    label: (s) => s.questionOrdering,
    hint: (s) => s.questionOrderingHint,
    keywords: ["question", "order", "sequence", "sort", "سؤال", "ترتيب"],
    question: true,
  },
  {
    type: "parsonsQuestion",
    group: "questions",
    icon: CodeXml,
    label: (s) => s.questionParsons,
    hint: (s) => s.questionParsonsHint,
    keywords: [
      "question",
      "code",
      "parsons",
      "program",
      "python",
      "lines",
      "سؤال",
      "برمجة",
      "شفرة",
    ],
    question: true,
  },
  {
    type: "programQuestion",
    group: "questions",
    icon: SquareTerminal,
    label: (s) => s.questionProgram,
    hint: (s) => s.questionProgramHint,
    keywords: [
      "question",
      "code",
      "program",
      "exercise",
      "python",
      "test",
      "سؤال",
      "برمجة",
      "شفرة",
      "تمرين",
    ],
    question: true,
  },
  {
    type: "gapsQuestion",
    group: "questions",
    icon: Brackets,
    label: (s) => s.questionGaps,
    hint: (s) => s.questionGapsHint,
    keywords: ["question", "gaps", "blanks", "cloze", "fill", "سؤال", "فراغات"],
    question: true,
  },
  {
    type: "highlightQuestion",
    group: "questions",
    icon: Highlighter,
    label: (s) => s.questionHighlight,
    hint: (s) => s.questionHighlightHint,
    keywords: [
      "question",
      "highlight",
      "find",
      "pick",
      "words",
      "سؤال",
      "تظليل",
      "كلمات",
    ],
    question: true,
  },
  {
    type: "matchingQuestion",
    group: "questions",
    icon: ArrowLeftRight,
    label: (s) => s.questionMatching,
    hint: (s) => s.questionMatchingHint,
    keywords: ["question", "match", "pairs", "connect", "سؤال", "توصيل"],
    question: true,
  },
  {
    type: "sortingQuestion",
    group: "questions",
    icon: Group,
    label: (s) => s.questionSorting,
    hint: (s) => s.questionSortingHint,
    keywords: ["question", "sort", "group", "categorise", "سؤال", "تصنيف"],
    question: true,
  },
  {
    type: "countingQuestion",
    group: "questions",
    icon: Dices,
    label: (s) => s.questionCounting,
    hint: (s) => s.questionCountingHint,
    keywords: ["count", "counting", "how many", "ten frame", "عد", "كم"],
    question: true,
    activity: true,
  },
  {
    type: "tracingQuestion",
    group: "questions",
    icon: Signature,
    label: (s) => s.questionTracing,
    hint: (s) => s.questionTracingHint,
    keywords: [
      "trace",
      "tracing",
      "write",
      "letter",
      "handwriting",
      "تتبع",
      "كتابة",
    ],
    question: true,
    activity: true,
  },
  {
    type: "spellingQuestion",
    group: "questions",
    icon: Blocks,
    label: (s) => s.questionSpelling,
    hint: (s) => s.questionSpellingHint,
    keywords: [
      "word",
      "tiles",
      "spell",
      "phonics",
      "build",
      "كلمة",
      "تهجئة",
      "حروف",
    ],
    question: true,
    activity: true,
  },
  {
    type: "hotspotQuestion",
    group: "questions",
    icon: ScanSearch,
    label: (s) => s.questionHotspot,
    hint: (s) => s.questionHotspotHint,
    keywords: [
      "find",
      "picture",
      "hotspot",
      "tap",
      "spot",
      "ابحث",
      "صورة",
      "أين",
    ],
    question: true,
    activity: true,
  },
  {
    type: "labellingQuestion",
    group: "questions",
    icon: Tags,
    label: (s) => s.questionLabelling,
    hint: (s) => s.questionLabellingHint,
    keywords: [
      "label",
      "diagram",
      "picture",
      "parts",
      "map",
      "تسمية",
      "رسم",
      "أجزاء",
      "خريطة",
    ],
    question: true,
  },
  {
    type: "crosswordQuestion",
    group: "questions",
    icon: Grid3x3,
    label: (s) => s.questionCrossword,
    hint: (s) => s.questionCrosswordHint,
    keywords: [
      "crossword",
      "puzzle",
      "clue",
      "vocabulary",
      "words",
      "كلمات متقاطعة",
      "لغز",
      "مفردات",
    ],
    question: true,
  },
  {
    type: "wordsearchQuestion",
    group: "questions",
    icon: TextSearch,
    label: (s) => s.questionWordSearch,
    hint: (s) => s.questionWordSearchHint,
    keywords: [
      "word search",
      "wordsearch",
      "find",
      "hidden",
      "letters",
      "البحث عن الكلمات",
      "كلمات",
      "حروف",
    ],
    question: true,
  },
  {
    type: "scratchQuestion",
    group: "questions",
    icon: Puzzle,
    label: (s) => s.questionScratch,
    hint: (s) => s.questionScratchHint,
    keywords: [
      "code",
      "coding",
      "scratch",
      "blocks",
      "program",
      "game",
      "animation",
      "برمجة",
      "كود",
      "سكراتش",
      "لعبة",
    ],
    question: true,
    studio: true,
  },
  {
    type: "projectQuestion",
    group: "questions",
    icon: CodeXml,
    label: (s) => s.questionProject,
    hint: (s) => s.questionProjectHint,
    keywords: [
      "code",
      "coding",
      "web",
      "website",
      "page",
      "html",
      "css",
      "javascript",
      "project",
      "برمجة",
      "شفرة",
      "ويب",
      "موقع",
      "صفحة",
      "مشروع",
    ],
    question: true,
    studio: true,
  },
  {
    type: "sketchQuestion",
    group: "questions",
    icon: Shapes,
    label: (s) => s.questionSketch,
    hint: (s) => s.questionSketchHint,
    keywords: [
      "p5",
      "sketch",
      "draw",
      "drawing",
      "art",
      "animation",
      "canvas",
      "code",
      "رسم",
      "فن",
      "حركة",
      "برمجة",
    ],
    question: true,
    studio: true,
  },
  {
    type: "pythonQuestion",
    group: "questions",
    icon: FileCode,
    label: (s) => s.questionPython,
    hint: (s) => s.questionPythonHint,
    keywords: [
      "python",
      "project",
      "program",
      "turtle",
      "code",
      "coding",
      "files",
      "بايثون",
      "مشروع",
      "برنامج",
      "برمجة",
    ],
    question: true,
    studio: true,
  },
  {
    type: "microbitQuestion",
    group: "questions",
    icon: CircuitBoard,
    label: (s) => s.questionMicrobit,
    hint: (s) => s.questionMicrobitHint,
    keywords: [
      "microbit",
      "micro:bit",
      "makecode",
      "board",
      "device",
      "robot",
      "electronics",
      "code",
      "coding",
      "مايكروبت",
      "لوحة",
      "جهاز",
      "إلكترونيات",
      "برمجة",
    ],
    question: true,
    studio: true,
  },
  {
    type: "puzzleQuestion",
    group: "questions",
    icon: ToyBrick,
    label: (s) => s.questionPuzzle,
    hint: (s) => s.questionPuzzleHint,
    keywords: [
      "blocks",
      "blockly",
      "puzzle",
      "maze",
      "path",
      "loop",
      "code",
      "coding",
      "program",
      "كتل",
      "لغز",
      "متاهة",
      "مسار",
      "تكرار",
      "برمجة",
    ],
    question: true,
    puzzle: true,
  },
  {
    type: "arrowsQuestion",
    group: "questions",
    icon: Route,
    label: (s) => s.questionArrows,
    hint: (s) => s.questionArrowsHint,
    keywords: [
      "arrows",
      "path",
      "robot",
      "directions",
      "maze",
      "early",
      "coding",
      "أسهم",
      "مسار",
      "روبوت",
      "اتجاهات",
      "متاهة",
      "برمجة",
    ],
    question: true,
    puzzle: true,
  },
  {
    type: "whyQuestion",
    group: "questions",
    icon: MicVocal,
    label: (s) => s.questionWhy,
    hint: (s) => s.questionWhyHint,
    keywords: [
      "why",
      "explain",
      "tell",
      "voice",
      "reason",
      "لماذا",
      "اشرح",
      "صوت",
    ],
    question: true,
    activity: true,
  },
  {
    type: "readingQuestion",
    group: "questions",
    icon: BookOpenText,
    label: (s) => s.questionReading,
    hint: (s) => s.questionReadingHint,
    keywords: [
      "read aloud",
      "reading",
      "fluency",
      "running record",
      "oral",
      "قراءة",
      "اقرأ",
      "طلاقة",
      "جهرية",
    ],
    question: true,
    activity: true,
  },
  {
    type: "gate",
    group: "questions",
    icon: ListEnd,
    label: (s) => s.gate,
    hint: (s) => s.gateHint,
    keywords: ["continue", "gate", "stop", "pause", "متابعة", "توقف"],
    question: true,
  },
];

export function filterBlocks(
  query: string,
  strings: EditorStrings,
  scope: BlockScope,
): BlockDefinition[] {
  const needle = query.trim().toLocaleLowerCase();
  return blockDefinitions.filter(
    (block) =>
      offered(block, scope) &&
      (!needle ||
        block.label(strings).toLocaleLowerCase().includes(needle) ||
        block.keywords.some((keyword) => keyword.startsWith(needle))),
  );
}

const listTypes: Partial<Record<BlockType, ListType>> = {
  bullet: "bullet",
  number: "number",
  check: "check",
};

function inlineChildren(block: LexicalNode): LexicalNode[] {
  if ($isListNode(block))
    return block
      .getChildren()
      .flatMap((item) =>
        $isElementNode(item)
          ? item.getChildren().filter((child) => !$isListNode(child))
          : [],
      );
  return $isParagraphNode(block) ||
    $isHeadingNode(block) ||
    $isQuoteNode(block) ||
    $isCodeNode(block)
    ? block.getChildren()
    : [];
}

export function $isConvertible(block: LexicalNode | null): boolean {
  return (
    $isParagraphNode(block) ||
    $isHeadingNode(block) ||
    $isQuoteNode(block) ||
    $isCodeNode(block) ||
    $isListNode(block) ||
    $isCalloutNode(block) ||
    $isToggleNode(block)
  );
}

export function $blockTypeOf(block: LexicalNode | null): BlockType | null {
  if (!block) return null;
  if ($isParagraphNode(block)) return "paragraph";
  if ($isHeadingNode(block)) {
    const tag = block.getTag();
    return tag === "h1" ? "h1" : tag === "h2" ? "h2" : "h3";
  }
  if ($isListNode(block)) {
    const type = block.getListType();
    return type === "bullet"
      ? "bullet"
      : type === "number"
        ? "number"
        : "check";
  }
  if ($isQuoteNode(block)) return "quote";
  if ($isCodeNode(block)) return "code";
  if ($isCalloutNode(block)) return "callout";
  if ($isToggleNode(block)) return "toggle";
  if ($isTableNode(block)) return "table";
  if ($isHorizontalRuleNode(block)) return "divider";
  if ($isColumnsNode(block)) return "columns2";
  if ($isPanelsNode(block)) return block.getLayout();
  if ($isGalleryNode(block)) return "gallery";
  if ($isCompareNode(block)) return "compare";
  if ($isChartNode(block)) return "chart";
  return null;
}

function $textBlock(type: BlockType): ElementNode | null {
  if (type === "paragraph") return $createParagraphNode();
  if (type === "h1" || type === "h2" || type === "h3")
    return $createHeadingNode(type);
  if (type === "quote") return $createQuoteNode();
  if (type === "code") return $createCodeNode();
  return null;
}

function $unwrap(block: ElementNode): LexicalNode[] {
  if ($isToggleNode(block)) {
    const [title, content] = block.getChildren();
    const nodes: LexicalNode[] = [];
    if ($isElementNode(title))
      nodes.push($createParagraphNode().append(...title.getChildren()));
    if ($isElementNode(content)) nodes.push(...content.getChildren());
    return nodes;
  }
  return block.getChildren();
}

export function $turnInto(block: LexicalNode, type: BlockType): LexicalNode {
  if (!$isConvertible(block)) return block;
  if ($isCalloutNode(block) || $isToggleNode(block)) {
    if (type === "callout" && $isCalloutNode(block)) return block;
    if (type === "toggle" && $isToggleNode(block)) return block;
    const nodes = $unwrap(block);
    for (const node of nodes) block.insertBefore(node);
    block.remove();
    const first = nodes[0];
    return first ? $turnInto(first, type) : block;
  }
  const listType = listTypes[type];
  if (listType) {
    if ($isListNode(block)) {
      block.setListType(listType);
      return block;
    }
    const list = $createListNode(listType);
    const item = $createListItemNode(listType === "check" ? false : undefined);
    item.append(...inlineChildren(block));
    list.append(item);
    block.replace(list);
    return list;
  }
  if (type === "callout") {
    const callout = $createCalloutNode();
    block.replace(callout);
    callout.append(block);
    return callout;
  }
  if (type === "toggle") {
    const title = $createToggleTitleNode().append(...inlineChildren(block));
    const toggle = $createToggleNode(true).append(
      title,
      $createToggleContentNode().append($createParagraphNode()),
    );
    block.replace(toggle);
    return toggle;
  }
  if ($isListNode(block)) {
    const created: ElementNode[] = [];
    for (const item of block.getChildren()) {
      const node = $textBlock(type);
      if (!node || !$isListItemNode(item)) continue;
      node.append(...item.getChildren().filter((child) => !$isListNode(child)));
      block.insertBefore(node);
      created.push(node);
    }
    const [first] = created;
    if (!first) return block;
    block.remove();
    return first;
  }
  const next = $textBlock(type);
  if (!next || !$isElementNode(block)) return block;
  next.append(...inlineChildren(block));
  next.setFormat(block.getFormatType());
  next.setIndent(block.getIndent());
  block.replace(next);
  return next;
}

function $selectInside(node: LexicalNode) {
  const formula = $isParagraphNode(node) ? node.getFirstChild() : null;
  if ($isMathNode(formula)) {
    $selectMath(formula);
    return;
  }
  if ($isQuestionNode(node)) {
    node.getFirstChild()?.selectStart();
    return;
  }
  if ($isDrawNode(node)) {
    $selectDraw(node);
    return;
  }
  if ($isStandardsNode(node)) {
    $selectStandards(node);
    return;
  }
  if ($isLtiNode(node)) {
    $selectLti(node);
    return;
  }
  if ($isToggleNode(node)) {
    node.getFirstChild()?.selectEnd();
    return;
  }
  if ($isPanelsNode(node)) {
    node.getFirstDescendant()?.selectStart();
    return;
  }
  if ($isCalloutNode(node) || $isStarterNode(node) || $isColumnsNode(node)) {
    node.getFirstDescendant()?.selectStart();
    return;
  }
  if ($isListNode(node)) {
    node.getFirstChild()?.selectEnd();
    return;
  }
  if ($isTableNode(node)) {
    node.getFirstDescendant()?.selectStart();
    return;
  }
  // A widget such as a continue gate takes no typing; the caret goes on
  // to the line below it, as after a divider.
  if ($isDecoratorNode(node)) {
    const next = node.getNextSibling();
    if ($isElementNode(next)) next.selectStart();
    return;
  }
  if ($isElementNode(node)) node.selectEnd();
}

const PANEL_TYPES = new Set<BlockType>(["tabs", "steps", "timeline", "cards"]);

function $createStructure(type: BlockType): LexicalNode | null {
  if (
    type === "tabs" ||
    type === "steps" ||
    type === "timeline" ||
    type === "cards"
  )
    return $createPanelsNode(type).append($createPanel(), $createPanel());
  if (type === "gallery") return $createGalleryNode();
  if (type === "compare") return $createCompareNode();
  if (type === "chart") return $createChartNode();
  if (type === "trueFalseQuestion") return $createTrueFalseQuestion();
  if (type === "whyQuestion") return $createWhyQuestion();
  if (type === "readingQuestion") return $createReadingQuestion();
  if (type === "outsideTool") return $createLtiNode("", "");
  if (type === "sketchQuestion") return $createSketchQuestion();
  if (type === "pythonQuestion") return $createPythonQuestion();
  if (type === "microbitQuestion") return $createMicrobitQuestion();
  if (type === "puzzleQuestion") return $createPuzzleQuestion("blocks");
  if (type === "arrowsQuestion") return $createPuzzleQuestion("arrows");
  const kind = QUESTION_KIND[type];
  if (kind) return $createQuestionNode(kind);
  if (type === "divider") return $createHorizontalRuleNode();
  if (type === "gate") return new GateNode();
  if (type === "bankDraw") return new DrawNode();
  if (type === "standards") return new StandardsNode();
  if (type === "glossary") return new GlossaryNode();
  if (type === "pageBreak") return new PageBreakNode();
  if (type === "aiUse") return $createAiUseNode();
  if (type === "equation")
    return $createParagraphNode().append($createMathNode("", true));
  if (type === "studentCopy")
    return new StarterNode().append($createParagraphNode());
  if (type === "table")
    return $createTableNodeWithDimensions(3, 3, { rows: true, columns: false });
  if (type === "columns2" || type === "columns3") {
    const columns = $createColumnsNode(type === "columns2" ? "1:1" : "1:1:1");
    for (let index = 0; index < (type === "columns2" ? 2 : 3); index++)
      columns.append($createColumnNode().append($createParagraphNode()));
    return columns;
  }
  return null;
}

function $selectionNode(): LexicalNode | null {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) return selection.anchor.getNode();
  if ($isNodeSelection(selection)) return selection.getNodes()[0] ?? null;
  return null;
}

export function $currentBlock(includeCells = true): LexicalNode | null {
  const node = $selectionNode();
  return node ? $nearestBlock(node, includeCells) : null;
}

const cellTypes = new Set<BlockType>([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "quote",
  "code",
  "bullet",
  "number",
  "check",
]);

function $allows(container: LexicalNode | null, type: BlockType): boolean {
  if ($isTableCellNode(container)) return cellTypes.has(type);
  if (
    type === "columns2" ||
    type === "columns3" ||
    PANEL_TYPES.has(type) ||
    type === "gate" ||
    type === "bankDraw" ||
    type === "pageBreak" ||
    type === "studentCopy" ||
    QUESTION_KIND[type]
  )
    return $isRootNode(container);
  if ($isCalloutNode(container)) return type !== "callout";
  return true;
}

export function $anchorFor(
  type: BlockType,
  node: LexicalNode | null = $selectionNode(),
): LexicalNode | null {
  let block = node ? $nearestBlock(node) : null;
  while (block && !$allows(block.getParent(), type)) {
    const parent = block.getParent();
    block = parent ? $nearestBlock(parent) : null;
  }
  return block;
}

function $isEmptyParagraph(node: LexicalNode | null): node is ElementNode {
  return $isParagraphNode(node) && node.getTextContentSize() === 0;
}

export function $insertBlock(
  type: BlockType,
  anchor: LexicalNode | null = $anchorFor(type),
): LexicalNode | null {
  if (!anchor) return null;
  let target: LexicalNode = anchor;
  if (!$isEmptyParagraph(target)) {
    const paragraph = $createParagraphNode();
    target.insertAfter(paragraph);
    target = paragraph;
  }
  const structure = $createStructure(type);
  if (structure) {
    if (type === "divider") {
      target.insertBefore(structure);
      if ($isElementNode(target)) target.selectStart();
      return structure;
    }
    target.replace(structure);
    if (!structure.getNextSibling())
      structure.insertAfter($createParagraphNode());
    $selectInside(structure);
    return structure;
  }
  const next = $turnInto(target, type);
  $selectInside(next);
  return next;
}

/** A block as stored, its children within it. */
export function serialized(node: LexicalNode): SerializedLexicalNode {
  if (!$isElementNode(node)) return node.exportJSON();
  const element: SerializedElementNode = {
    ...node.exportJSON(),
    children: node.getChildren().map(serialized),
  };
  return element;
}

export function $duplicateBlock(block: LexicalNode): LexicalNode {
  const copy = $parseSerializedNode(serialized(block));
  block.insertAfter(copy);
  return copy;
}

export function $moveBlock(block: LexicalNode, direction: -1 | 1): boolean {
  const sibling =
    direction < 0 ? block.getPreviousSibling() : block.getNextSibling();
  if (!sibling) return false;
  if (direction < 0) sibling.insertBefore(block);
  else sibling.insertAfter(block);
  return true;
}
