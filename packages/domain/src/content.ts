import type { Level } from "@faridalms/puzzles/level";

import { levelSchema } from "@faridalms/puzzles/level";
import * as v from "valibot";

import type { EmbedProvider } from "./embed";
import type { ProjectFile, ProjectLanguage } from "./project";
import type { ScratchFeature } from "./scratch-project";

import { embedProviders, isEmbedId } from "./embed";
import { projectLanguages, starterFilesSchema } from "./project";
import { isSafeContentUrl } from "./rich-text";
import { scratchChecksSchema } from "./scratch-project";
import {
  MAX_BLOCK_STANDARDS,
  MAX_QUESTION_STANDARDS,
  MAX_STANDARD_CODE,
  MAX_STANDARD_STATEMENT,
} from "./standards";

/** The longest piece of mathematics one node holds, in LaTeX. */
export const MAX_LATEX = 4000;

/**
 * Mathematics inside text that is otherwise plain, as a question's prompt
 * and options carry it: \(…\) within a line and \[…\] on a line of its own,
 * as LaTeX writes them.
 */
export const mathText = (node: Pick<ContentNode, "latex" | "block">) =>
  node.block ? `\\[${node.latex ?? ""}\\]` : `\\(${node.latex ?? ""}\\)`;

export type TextRun = { text: string } | { latex: string; block: boolean };

const MATH_RUN = /\\\((.+?)\\\)|\\\[(.+?)\\\]/gsu;

/** Plain text and the mathematics written in it, in order. */
export function mathRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let from = 0;
  for (const match of text.matchAll(MATH_RUN)) {
    if (match.index > from) runs.push({ text: text.slice(from, match.index) });
    runs.push(
      match[1] === undefined
        ? { latex: match[2] ?? "", block: true }
        : { latex: match[1], block: false },
    );
    from = match.index + match[0].length;
  }
  if (from < text.length) runs.push({ text: text.slice(from) });
  return runs;
}

const nodeTypes = [
  "root",
  "paragraph",
  "text",
  "heading",
  "quote",
  "list",
  "listitem",
  "link",
  "autolink",
  "linebreak",
  "tab",
  "code",
  "code-highlight",
  "table",
  "tablerow",
  "tablecell",
  "horizontalrule",
  "pagebreak",
  "callout",
  "toggle",
  "toggle-title",
  "toggle-content",
  "panels",
  "panel",
  "panel-title",
  "panel-body",
  "columns",
  "column",
  "image",
  "gallery",
  "compare",
  "chart",
  "file",
  "media",
  "embed",
  "diagram",
  "question",
  "question-prompt",
  "question-option",
  "question-answer",
  "question-pair",
  "question-group",
  "question-side",
  "question-passage",
  "question-gap",
  "gate",
  "starter",
  "ai-use",
  "math",
  "draw",
  "standards",
] as const;
/**
 * The questions a document can ask, each marked by the server from the
 * question's own nodes. More kinds join as their blocks are built.
 */
export const questionKinds = [
  "choice",
  "poll",
  "text",
  "math",
  "written",
  "number",
  "ordering",
  "matching",
  "sorting",
  "gaps",
  "highlight",
  "counting",
  "tracing",
  "spelling",
  "hotspot",
  "labelling",
  "crossword",
  "wordsearch",
  "scratch",
  "parsons",
  "program",
  "project",
  "puzzle",
] as const;
export type QuestionKind = (typeof questionKinds)[number];
/**
 * When a student learns how a question went: at once, as they answer; at
 * the end, once they have answered every question that waits for it, as
 * Moodle's deferred feedback does; or when their teacher shows the class.
 * Until then an answer is kept and may be changed, as in a quiz.
 */
export const FEEDBACK_TIMES = ["now", "end", "teacher"] as const;
export type FeedbackTime = (typeof FEEDBACK_TIMES)[number];
/**
 * What a continue gate waits for: every question and video above it, only
 * the question or video just above, or nothing but the student choosing to
 * go on, which splits reading into parts.
 */
export const GATE_WAITS = ["above", "last", "none"] as const;
export type GateWaits = (typeof GATE_WAITS)[number];
export const calloutTones = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
] as const;
export const columnLayouts = ["1:1", "1:2", "2:1", "1:1:1", "1:1:1:1"] as const;
/**
 * How a set of titled parts reads: as tabs, numbered steps, a timeline, or
 * cards a reader turns over from the title on the front to the body.
 */
export const panelLayouts = ["tabs", "steps", "timeline", "cards"] as const;
export type PanelLayout = (typeof panelLayouts)[number];
/** Parts in one set of tabs, steps, events or cards. */
export const MAX_PANELS = 12;
/** Places named on one picture. */
export const MAX_PICTURE_LABELS = 12;
/** Pictures in one gallery. */
export const MAX_GALLERY_PICTURES = 24;

/** A place on a picture, as a share of its width and height, with what it shows. */
export interface PictureLabel {
  id: string;
  x: number;
  y: number;
  title: string;
  text: string;
}

export const chartKinds = ["bar", "line", "pie"] as const;
export type ChartKind = (typeof chartKinds)[number];
/** Categories along a chart's axis. */
export const MAX_CHART_LABELS = 24;
/** Series a chart tells apart by colour, as many as stay distinct to every reader. */
export const MAX_CHART_SERIES = 4;
/** Slices a pie shows before the rest fold into one. */
export const MAX_PIE_SLICES = 6;

/** A chart as its teacher enters it: categories, and a value of each series for each. */
export interface ChartData {
  kind: ChartKind;
  title: string;
  xTitle: string;
  yTitle: string;
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
}

/** One picture of a gallery, or one side of a before and after. */
export interface SetPicture {
  fileId: string;
  alt: string;
  caption?: string;
}
export const imageSizes = ["small", "medium", "large", "full"] as const;
/** A file reads as a card, or a PDF also shows its pages in the document. */
export const fileDisplays = ["card", "preview"] as const;
export type FileDisplay = (typeof fileDisplays)[number];
export type CalloutTone = (typeof calloutTones)[number];
export type ColumnLayout = (typeof columnLayouts)[number];
export type ImageSize = (typeof imageSizes)[number];
export interface ContentNode {
  type: (typeof nodeTypes)[number];
  version: 1;
  children?: ContentNode[];
  text?: string;
  format?:
    | number
    | ""
    | "left"
    | "right"
    | "center"
    | "justify"
    | "start"
    | "end";
  indent?: number;
  direction?: "ltr" | "rtl" | null;
  style?: string;
  mode?: "normal" | "token" | "segmented";
  detail?: number;
  textFormat?: number;
  textStyle?: string;
  tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "ul" | "ol";
  listType?: "bullet" | "number" | "check";
  start?: number;
  value?: number;
  checked?: boolean;
  url?: string;
  target?: "_blank" | "_self" | null;
  rel?: string | null;
  title?: string | null;
  isUnlinked?: boolean;
  language?: string;
  highlightType?: string | null;
  colSpan?: number;
  rowSpan?: number;
  headerState?: number;
  width?: number;
  height?: number;
  backgroundColor?: string | null;
  verticalAlign?: "top" | "middle" | "bottom";
  colWidths?: number[];
  rowStriping?: boolean;
  frozenColumnCount?: number;
  frozenRowCount?: number;
  tone?: CalloutTone;
  open?: boolean;
  layout?: ColumnLayout | PanelLayout;
  fileId?: string;
  alt?: string;
  /** A picture that only decorates, so screen readers pass it by. */
  decorative?: boolean;
  /** Mathematics written in LaTeX; `direction` rtl sets it in Arabic notation. */
  latex?: string;
  /** Mathematics on a line of its own rather than in the text. */
  block?: boolean;
  caption?: string;
  size?: ImageSize;
  /** Places named on a picture, which its reader opens one at a time. */
  labels?: PictureLabel[];
  /** A gallery's pictures, or a before and after's two. */
  pictures?: SetPicture[];
  chart?: ChartData;
  name?: string;
  mime?: string;
  bytes?: number;
  display?: FileDisplay;
  captionsFileId?: string;
  captionsLang?: string;
  transcript?: string;
  /** A recording's chapters as its teacher writes them, a time and a name a line. */
  chapters?: string;
  /** A recording students may seek in only as far as they have played. */
  noSkipping?: boolean;
  provider?: EmbedProvider;
  embedId?: string;
  sceneFileId?: string;
  kind?: QuestionKind;
  questionId?: string;
  /** The tag a quiz draws its questions from the bank by. */
  bankTag?: string;
  /** The school's standards a question gives evidence of, by id. */
  standards?: string[];
  /**
   * The standards a standards block names, with the code and statement each
   * had when chosen, so a reader sees them without looking them up.
   */
  targets?: StandardTarget[];
  optionId?: string;
  correct?: boolean;
  feedback?: string;
  points?: number;
  tries?: number | null;
  /** When the student learns how a question went; at once when absent. */
  feedbackAt?: FeedbackTime;
  /** What a continue gate waits for; everything above when absent. */
  requires?: GateWaits;
  /** A question suggested from the document, not yet kept by its teacher. */
  suggested?: boolean;
  /** Gaps filled from a word bank: the extra words, which fit no gap. */
  bank?: string[];
  /** A number answered on a number line, from and to, in steps. */
  line?: { from: number; to: number; step: number };
  multiple?: boolean;
  shuffle?: boolean;
  /** Whether a poll shows a student how their class answered, once they have. */
  classResults?: boolean;
  caseSensitive?: boolean;
  closeEnough?: boolean;
  tehMarbuta?: boolean;
  wordLimit?: number | null;
  recordSeconds?: number | null;
  /** A spoken answer recorded on camera rather than only heard. */
  recordVideo?: boolean;
  /** A question asked when the video above it reaches this second. */
  videoAt?: number | null;
  /** A code puzzle's language, which decides whether indentation counts. */
  codeLanguage?: "python" | "javascript" | "html" | "text";
  /** A code exercise's test that is run and counted but never shown. */
  hidden?: boolean;
  /** A written question answered with a drawing or a photo. */
  answerWith?: "drawing" | "photo" | null;
  /**
   * A find-on-a-picture question's places: each box (left, top, width,
   * height), its name, and whether it is one to find.
   */
  places?: { box: number[]; name: string; correct: boolean }[];
  count?: number;
  countMode?: "count" | "make";
  countLayout?: "scatter" | "line" | "frame";
  flashSeconds?: number | null;
  /** A matching question played as memory pairs. */
  memory?: boolean;
  /** A tracing question's model: strokes of x, y points across a unit square. */
  trace?: number[][];
  /** A Scratch question's starter project, the .sb3 every student begins from. */
  projectFileId?: string;
  /** A project question's starter: the files every student begins from. */
  projectFiles?: ProjectFile[];
  /** A project question whose students may show their work to the class. */
  gallery?: boolean;
  /** What a Scratch question asks every student's project to have. */
  projectChecks?: ScratchFeature[];
  /** A project question made in Python rather than as a web page. */
  projectLanguage?: ProjectLanguage;
  /** A puzzle question's grid, the blocks it offers and its teacher's answer. */
  puzzle?: Level;
  /** Before a question had hints in order, its one hint. */
  hint?: string;
  hints?: string[];
  explanation?: string;
  numberMode?: "exact" | "range";
  answerValue?: number;
  tolerance?: number;
  percent?: boolean;
  rangeMin?: number;
  rangeMax?: number;
  scoring?: "all" | "neighbours";
  aiTool?: string;
  aiDate?: string;
  aiPrompt?: string;
  aiUse?: string;
  aiEvidence?: AiEvidence[];
  /**
   * The editor's own facts about a block: its id, a recording that reads it
   * aloud, and the moment in that recording each of its words starts, in
   * milliseconds, as the teacher tapped them along.
   */
  $?: {
    id?: string;
    narration?: string;
    words?: number[];
    /** A code block students can run, straight away or once they predict. */
    run?: "run" | "predict";
  };
}

export interface StandardTarget {
  id: string;
  code: string;
  statement: string;
}

/** A screenshot or file a student keeps as evidence of using an AI tool. */
export interface AiEvidence {
  fileId: string;
  name: string;
  mime: string;
  bytes: number;
}
export interface ContentDocument {
  root: ContentNode;
}

/** The longest recording a block may carry, as the editor caps it. */
export const NARRATION_MS = 180_000;
/** More words than three minutes of reading holds. */
export const NARRATED_WORDS = 1000;

/** The words of a passage as they are timed and lit, each with where it starts. */
export const spokenWords = (text: string) =>
  [...text.matchAll(/\S+/g)].map((match) => ({
    word: match[0],
    at: match.index,
  }));

const integer = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
/** When each word starts in a recording, in milliseconds, never going back. */
export const narrationWordsSchema = v.pipe(
  v.array(integer(0, NARRATION_MS)),
  v.maxLength(NARRATED_WORDS),
  v.check((times) =>
    times.every(
      (time, index) => index === 0 || time >= (times[index - 1] ?? 0),
    ),
  ),
);
const color = v.pipe(
  v.string(),
  v.regex(/^(#[\da-fA-F]{3,8}|transparent|black|white|red|blue|green|yellow)$/),
);
/**
 * The sizes a teacher gives text, as shares of the text around it, so words
 * set large in a young lesson's larger type are larger again.
 */
export const TEXT_SIZES = {
  small: "0.875em",
  large: "1.25em",
  huge: "1.75em",
} as const;
export type TextSize = keyof typeof TEXT_SIZES;
const textSizeValues = new Set<string>(Object.values(TEXT_SIZES));

export function validContentStyle(style: string): boolean {
  return style.split(";").every((entry) => {
    if (!entry.trim()) return true;
    const [property, value, extra] = entry
      .split(":")
      .map((part) => part.trim());
    if (!property || !value || extra !== undefined) return false;
    if (property === "color" || property === "background-color")
      return v.safeParse(color, value).success;
    if (property === "font-size")
      return (
        textSizeValues.has(value) || /^(?:[89]|[1-8]\d|9[0-6])px$/.test(value)
      );
    if (property === "font-family")
      return ["Arial", "Georgia", "monospace", "sans-serif", "serif"].includes(
        value,
      );
    return false;
  });
}
const style = v.pipe(v.string(), v.maxLength(1024), v.check(validContentStyle));
const nodeSchema: v.GenericSchema<ContentNode> = v.lazy(() =>
  v.pipe(
    v.object({
      type: v.picklist(nodeTypes),
      version: v.literal(1),
      children: v.optional(v.array(nodeSchema)),
      text: v.optional(v.pipe(v.string(), v.maxLength(100000))),
      format: v.optional(
        v.union([
          integer(0, 2047),
          v.picklist([
            "",
            "left",
            "right",
            "center",
            "justify",
            "start",
            "end",
          ]),
        ]),
      ),
      indent: v.optional(integer(0, 20)),
      direction: v.optional(v.nullable(v.picklist(["ltr", "rtl"]))),
      style: v.optional(style),
      textStyle: v.optional(style),
      textFormat: v.optional(integer(0, 2047)),
      mode: v.optional(v.picklist(["normal", "token", "segmented"])),
      detail: v.optional(integer(0, 3)),
      tag: v.optional(
        v.picklist(["h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol"]),
      ),
      listType: v.optional(v.picklist(["bullet", "number", "check"])),
      start: v.optional(integer(1, 1000000)),
      value: v.optional(integer(1, 1000000)),
      checked: v.optional(v.boolean()),
      url: v.optional(
        v.pipe(v.string(), v.maxLength(2048), v.check(isSafeContentUrl)),
      ),
      target: v.optional(v.nullable(v.picklist(["_blank", "_self"]))),
      rel: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(255)))),
      title: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1000)))),
      isUnlinked: v.optional(v.boolean()),
      language: v.optional(v.pipe(v.string(), v.maxLength(64))),
      highlightType: v.optional(
        v.nullable(v.pipe(v.string(), v.maxLength(64))),
      ),
      colSpan: v.optional(integer(1, 100)),
      rowSpan: v.optional(integer(1, 100)),
      headerState: v.optional(integer(0, 3)),
      width: v.optional(integer(1, 5000)),
      height: v.optional(integer(1, 5000)),
      backgroundColor: v.optional(v.nullable(color)),
      verticalAlign: v.optional(v.picklist(["top", "middle", "bottom"])),
      colWidths: v.optional(
        v.pipe(v.array(integer(1, 5000)), v.maxLength(100)),
      ),
      rowStriping: v.optional(v.boolean()),
      frozenColumnCount: v.optional(integer(0, 100)),
      frozenRowCount: v.optional(integer(0, 100)),
      tone: v.optional(v.picklist(calloutTones)),
      open: v.optional(v.boolean()),
      layout: v.optional(v.picklist([...columnLayouts, ...panelLayouts])),
      fileId: v.optional(v.pipe(v.string(), v.uuid())),
      alt: v.optional(v.pipe(v.string(), v.maxLength(500))),
      decorative: v.optional(v.boolean()),
      latex: v.optional(v.pipe(v.string(), v.maxLength(MAX_LATEX))),
      block: v.optional(v.boolean()),
      caption: v.optional(v.pipe(v.string(), v.maxLength(1000))),
      size: v.optional(v.picklist(imageSizes)),
      labels: v.optional(
        v.pipe(
          v.array(
            v.object({
              id: v.pipe(v.string(), v.regex(/^[\da-z]{8,36}$/)),
              x: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
              y: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
              title: v.pipe(v.string(), v.maxLength(80)),
              text: v.pipe(v.string(), v.maxLength(500)),
            }),
          ),
          v.maxLength(MAX_PICTURE_LABELS),
        ),
      ),
      chart: v.optional(
        v.pipe(
          v.object({
            kind: v.picklist(chartKinds),
            title: v.pipe(v.string(), v.maxLength(200)),
            xTitle: v.pipe(v.string(), v.maxLength(80)),
            yTitle: v.pipe(v.string(), v.maxLength(80)),
            labels: v.pipe(
              v.array(v.pipe(v.string(), v.maxLength(60))),
              v.minLength(1),
              v.maxLength(MAX_CHART_LABELS),
            ),
            series: v.pipe(
              v.array(
                v.object({
                  name: v.pipe(v.string(), v.maxLength(60)),
                  values: v.array(v.nullable(v.pipe(v.number(), v.finite()))),
                }),
              ),
              v.minLength(1),
              v.maxLength(MAX_CHART_SERIES),
            ),
          }),
          v.check((chart) =>
            chart.series.every(
              (series) => series.values.length === chart.labels.length,
            ),
          ),
        ),
      ),
      pictures: v.optional(
        v.pipe(
          v.array(
            v.object({
              fileId: v.pipe(v.string(), v.uuid()),
              alt: v.pipe(v.string(), v.maxLength(500)),
              caption: v.optional(v.pipe(v.string(), v.maxLength(300))),
            }),
          ),
          v.maxLength(MAX_GALLERY_PICTURES),
        ),
      ),
      name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
      mime: v.optional(v.pipe(v.string(), v.maxLength(255))),
      bytes: v.optional(integer(0, 2147483647)),
      display: v.optional(v.picklist(fileDisplays)),
      captionsFileId: v.optional(v.pipe(v.string(), v.uuid())),
      captionsLang: v.optional(
        v.pipe(v.string(), v.regex(/^[a-z]{2,3}(?:-[\da-z]{2,8})*$/i)),
      ),
      transcript: v.optional(v.pipe(v.string(), v.maxLength(20000))),
      chapters: v.optional(v.pipe(v.string(), v.maxLength(4000))),
      noSkipping: v.optional(v.boolean()),
      provider: v.optional(v.picklist(embedProviders)),
      embedId: v.optional(v.pipe(v.string(), v.maxLength(200))),
      sceneFileId: v.optional(v.pipe(v.string(), v.uuid())),
      projectFileId: v.optional(v.pipe(v.string(), v.uuid())),
      projectFiles: v.optional(starterFilesSchema),
      gallery: v.optional(v.boolean()),
      projectChecks: v.optional(scratchChecksSchema),
      projectLanguage: v.optional(v.picklist(projectLanguages)),
      puzzle: v.optional(levelSchema),
      kind: v.optional(v.picklist(questionKinds)),
      questionId: v.optional(v.pipe(v.string(), v.uuid())),
      bankTag: v.optional(v.pipe(v.string(), v.maxLength(40))),
      standards: v.optional(
        v.pipe(
          v.array(v.pipe(v.string(), v.uuid())),
          v.maxLength(MAX_QUESTION_STANDARDS),
        ),
      ),
      targets: v.optional(
        v.pipe(
          v.array(
            v.object({
              id: v.pipe(v.string(), v.uuid()),
              code: v.pipe(v.string(), v.maxLength(MAX_STANDARD_CODE)),
              statement: v.pipe(
                v.string(),
                v.minLength(1),
                v.maxLength(MAX_STANDARD_STATEMENT),
              ),
            }),
          ),
          v.maxLength(MAX_BLOCK_STANDARDS),
        ),
      ),
      optionId: v.optional(v.pipe(v.string(), v.uuid())),
      correct: v.optional(v.boolean()),
      feedback: v.optional(v.pipe(v.string(), v.maxLength(300))),
      points: v.optional(integer(0, 100)),
      tries: v.optional(v.nullable(integer(1, 10))),
      feedbackAt: v.optional(v.picklist(FEEDBACK_TIMES)),
      requires: v.optional(v.picklist(GATE_WAITS)),
      suggested: v.optional(v.boolean()),
      bank: v.optional(
        v.pipe(v.array(v.pipe(v.string(), v.maxLength(100))), v.maxLength(12)),
      ),
      line: v.optional(
        v.object({ from: v.number(), to: v.number(), step: v.number() }),
      ),
      multiple: v.optional(v.boolean()),
      shuffle: v.optional(v.boolean()),
      classResults: v.optional(v.boolean()),
      caseSensitive: v.optional(v.boolean()),
      closeEnough: v.optional(v.boolean()),
      tehMarbuta: v.optional(v.boolean()),
      wordLimit: v.optional(v.nullable(integer(10, 5000))),
      recordSeconds: v.optional(v.nullable(integer(5, 180))),
      recordVideo: v.optional(v.boolean()),
      videoAt: v.optional(v.nullable(integer(0, 21600))),
      codeLanguage: v.optional(
        v.picklist(["python", "javascript", "html", "text"]),
      ),
      hidden: v.optional(v.boolean()),
      answerWith: v.optional(v.nullable(v.picklist(["drawing", "photo"]))),
      places: v.optional(
        v.pipe(
          v.array(
            v.object({
              box: v.pipe(
                v.array(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
                v.length(4),
              ),
              name: v.pipe(v.string(), v.maxLength(60)),
              correct: v.boolean(),
            }),
          ),
          v.maxLength(12),
        ),
      ),
      count: v.optional(integer(1, 20)),
      countMode: v.optional(v.picklist(["count", "make"])),
      countLayout: v.optional(v.picklist(["scatter", "line", "frame"])),
      flashSeconds: v.optional(v.nullable(integer(1, 10))),
      memory: v.optional(v.boolean()),
      trace: v.optional(
        v.pipe(
          v.array(
            v.pipe(
              v.array(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
              v.maxLength(400),
            ),
          ),
          v.maxLength(8),
        ),
      ),
      hint: v.optional(v.pipe(v.string(), v.maxLength(500))),
      hints: v.optional(
        v.pipe(v.array(v.pipe(v.string(), v.maxLength(500))), v.maxLength(5)),
      ),
      explanation: v.optional(v.pipe(v.string(), v.maxLength(1000))),
      numberMode: v.optional(v.picklist(["exact", "range"])),
      answerValue: v.optional(v.pipe(v.number(), v.finite())),
      tolerance: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0))),
      percent: v.optional(v.boolean()),
      rangeMin: v.optional(v.pipe(v.number(), v.finite())),
      rangeMax: v.optional(v.pipe(v.number(), v.finite())),
      scoring: v.optional(v.picklist(["all", "neighbours"])),
      aiTool: v.optional(v.pipe(v.string(), v.maxLength(200))),
      aiDate: v.optional(
        v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
      ),
      aiPrompt: v.optional(v.pipe(v.string(), v.maxLength(4000))),
      aiUse: v.optional(v.pipe(v.string(), v.maxLength(4000))),
      aiEvidence: v.optional(
        v.pipe(
          v.array(
            v.object({
              fileId: v.pipe(v.string(), v.uuid()),
              name: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
              mime: v.pipe(v.string(), v.maxLength(255)),
              bytes: integer(0, 2147483647),
            }),
          ),
          v.maxLength(20),
        ),
      ),
      $: v.optional(
        v.object({
          id: v.optional(v.pipe(v.string(), v.regex(/^[\da-z]{8,36}$/))),
          narration: v.optional(v.pipe(v.string(), v.uuid())),
          words: v.optional(narrationWordsSchema),
          run: v.optional(v.picklist(["run", "predict"])),
        }),
      ),
    }),
    v.check(validNode),
  ),
);
const inline = (child: ContentNode) =>
  [
    "text",
    "code-highlight",
    "tab",
    "linebreak",
    "link",
    "autolink",
    "math",
  ].includes(child.type);
const blocks = new Set<string>([
  "paragraph",
  "heading",
  "quote",
  "list",
  "code",
  "table",
  "horizontalrule",
  "pagebreak",
  "callout",
  "toggle",
  "panels",
  "columns",
  "image",
  "gallery",
  "compare",
  "chart",
  "file",
  "media",
  "embed",
  "diagram",
  "question",
  "draw",
  "standards",
  "gate",
  "starter",
  "ai-use",
]);
// Columns, sets of parts, questions, draws, gates, page breaks and each
// student's copy stand only at the top of a document.
const ROOT_ONLY = new Set([
  "columns",
  "panels",
  "question",
  "draw",
  "gate",
  "pagebreak",
  "starter",
]);
const nestedBlocks = new Set(
  [...blocks].filter((type) => !ROOT_ONLY.has(type)),
);
function validNode(node: ContentNode): boolean {
  const children = node.children ?? [];
  if (["text", "code-highlight", "tab"].includes(node.type))
    return (
      typeof node.text === "string" &&
      !node.children &&
      typeof node.format === "number"
    );
  if (
    ["linebreak", "horizontalrule", "pagebreak", "gate", "ai-use"].includes(
      node.type,
    )
  )
    return !node.children && node.text === undefined;
  if (node.type === "image")
    return !node.children && node.text === undefined && Boolean(node.fileId);
  // A gallery or a before and after may stand empty while it is written;
  // its reader sees nothing of it until it has pictures.
  if (node.type === "chart")
    return !node.children && node.text === undefined && Boolean(node.chart);
  if (node.type === "gallery" || node.type === "compare")
    return (
      !node.children &&
      node.text === undefined &&
      Array.isArray(node.pictures) &&
      (node.type === "gallery" || node.pictures.length <= 2)
    );
  if (node.type === "standards")
    return (
      !node.children && node.text === undefined && Array.isArray(node.targets)
    );
  if (node.type === "draw")
    return (
      !node.children &&
      node.text === undefined &&
      Boolean(node.questionId) &&
      typeof node.bankTag === "string" &&
      typeof node.count === "number" &&
      typeof node.points === "number"
    );
  if (node.type === "math")
    return (
      !node.children &&
      node.text === undefined &&
      typeof node.latex === "string"
    );
  if (node.type === "file")
    return (
      !node.children &&
      node.text === undefined &&
      Boolean(node.fileId) &&
      Boolean(node.name)
    );
  if (node.type === "media")
    return (
      !node.children &&
      node.text === undefined &&
      Boolean(node.fileId) &&
      /^(audio|video)\//.test(node.mime ?? "")
    );
  if (node.type === "embed")
    return (
      !node.children &&
      node.text === undefined &&
      node.provider !== undefined &&
      node.embedId !== undefined &&
      isEmbedId(node.provider, node.embedId)
    );
  if (node.type === "diagram")
    return (
      !node.children &&
      node.text === undefined &&
      Boolean(node.fileId) &&
      Boolean(node.sceneFileId)
    );
  if (
    !node.children ||
    node.text !== undefined ||
    typeof node.format === "number"
  )
    return false;

  switch (node.type) {
    case "question":
      // How complete a question is gets checked when its document is
      // published; a half-written one still saves.
      return (
        Boolean(node.kind && node.questionId) &&
        children[0]?.type === "question-prompt" &&
        children
          .slice(1)
          .every((child) =>
            [
              "question-option",
              "question-answer",
              "question-pair",
              "question-group",
              "question-passage",
            ].includes(child.type),
          )
      );
    case "question-prompt":
    case "question-answer":
    case "question-side":
      return children.every(inline);
    case "question-option":
      return Boolean(node.optionId) && children.every(inline);
    case "question-pair":
      return (
        Boolean(node.optionId) &&
        children.length === 2 &&
        children.every((child) => child.type === "question-side")
      );
    case "question-passage":
      return children.every(
        (child) => inline(child) || child.type === "question-gap",
      );
    case "question-gap":
      return (
        Boolean(node.optionId) &&
        children.every((child) => child.type === "text")
      );
    case "question-group":
      return (
        Boolean(node.optionId) &&
        children[0]?.type === "question-side" &&
        children.slice(1).every((child) => child.type === "question-option")
      );
    case "root":
      return children.every((child) => blocks.has(child.type));
    case "quote":
      return children.every(
        (child) =>
          inline(child) ||
          ["paragraph", "heading", "quote", "list", "horizontalrule"].includes(
            child.type,
          ),
      );
    case "paragraph":
    case "code":
    case "toggle-title":
    case "panel-title":
      return children.every(inline);
    case "heading":
      return Boolean(node.tag?.startsWith("h")) && children.every(inline);
    case "link":
    case "autolink":
      return (
        Boolean(node.url) &&
        children.every(
          (child) =>
            inline(child) && !["link", "autolink"].includes(child.type),
        )
      );
    case "list":
      return (
        Boolean(node.listType) &&
        children.every((child) => child.type === "listitem")
      );
    case "listitem":
      return children.every((child) => inline(child) || child.type === "list");
    case "table":
      return (
        children.length > 0 &&
        children.every((child) => child.type === "tablerow")
      );
    case "tablerow":
      return (
        children.length > 0 &&
        children.every((child) => child.type === "tablecell")
      );
    case "tablecell":
      return children.every((child) =>
        ["paragraph", "heading", "quote", "list", "code"].includes(child.type),
      );
    case "starter":
      return (
        children.length > 0 &&
        children.every((child) => nestedBlocks.has(child.type))
      );
    case "callout":
      return (
        children.length > 0 &&
        children.every(
          (child) => child.type !== "callout" && nestedBlocks.has(child.type),
        )
      );
    case "toggle":
      return (
        children.length === 2 &&
        children[0]?.type === "toggle-title" &&
        children[1]?.type === "toggle-content"
      );
    case "toggle-content":
    case "column":
    case "panel-body":
      return (
        children.length > 0 &&
        children.every((child) => nestedBlocks.has(child.type))
      );
    case "columns":
      return (
        (node.layout === undefined ||
          (columnLayouts as readonly string[]).includes(node.layout)) &&
        children.length >= 2 &&
        children.length <= 4 &&
        children.every((child) => child.type === "column")
      );
    case "panels":
      return (
        (panelLayouts as readonly string[]).includes(node.layout ?? "") &&
        children.length >= 1 &&
        children.length <= MAX_PANELS &&
        children.every((child) => child.type === "panel")
      );
    case "panel":
      return (
        children.length === 2 &&
        children[0]?.type === "panel-title" &&
        children[1]?.type === "panel-body"
      );
  }
  return false;
}
function boundedContent(value: unknown): boolean {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const next = pending.pop();
    if (!next || next.depth > 32 || ++nodes > 10000) return false;
    if (typeof next.value !== "object" || next.value === null) continue;
    if ("root" in next.value)
      pending.push({ value: next.value.root, depth: next.depth + 1 });
    if ("children" in next.value && Array.isArray(next.value.children)) {
      for (const child of next.value.children)
        pending.push({ value: child, depth: next.depth + 1 });
    }
  }
  return true;
}
export const contentDocumentSchema = v.pipe(
  v.custom<ContentDocument>(boundedContent),
  v.object({ root: nodeSchema }),
  v.check(
    (document) =>
      document.root.type === "root" &&
      contentPlainText(document).length <= 100000,
  ),
);
const blockSeparated = new Set<string>([
  "root",
  "question",
  "question-pair",
  "question-group",
  "list",
  "table",
  "tablerow",
  "callout",
  "toggle",
  "toggle-content",
  "panels",
  "panel",
  "panel-body",
  "columns",
  "column",
]);
const visit = (node: ContentNode): string => {
  if (node.type === "image")
    return [
      node.caption || node.alt || "",
      ...(node.labels ?? []).map((label) =>
        [label.title, label.text].filter(Boolean).join(": "),
      ),
    ]
      .filter(Boolean)
      .join("\n");
  if (node.type === "diagram") return node.caption || node.alt || "";
  if (node.type === "chart" && node.chart)
    return [
      node.chart.title,
      node.chart.xTitle,
      node.chart.yTitle,
      node.chart.labels.join(", "),
      node.chart.series.map((series) => series.name).join(", "),
    ]
      .filter((part) => part.trim())
      .join("\n");
  if (node.type === "gallery" || node.type === "compare")
    return (node.pictures ?? [])
      .map((picture) => picture.caption || picture.alt)
      .filter(Boolean)
      .join("\n");
  if (node.type === "media")
    return [node.caption, node.transcript].filter(Boolean).join("\n");
  if (node.type === "embed") return node.caption ?? "";
  if (node.type === "file") return node.name ?? "";
  if (node.type === "math") return mathText(node);
  // Accepted answers are the key; they stay out of text anyone can search.
  if (node.type === "question-answer" || node.type === "question-gap")
    return "";
  return (
    node.text ??
    (node.type === "linebreak"
      ? "\n"
      : (node.children ?? [])
          .map(visit)
          .join(blockSeparated.has(node.type) ? "\n" : ""))
  );
};
/** A code block's program as written: its text, line breaks and tabs. */
export function codeSource(node: ContentNode): string {
  if (node.type === "linebreak") return "\n";
  if (node.type === "tab") return "\t";
  return (node.text ?? "") + (node.children ?? []).map(codeSource).join("");
}

export function contentPlainText(document: ContentDocument): string {
  return visit(document.root);
}

const STRONG_RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
const STRONG = /[\p{L}]/u;

/**
 * The direction a text reads in, from its first letter: Arabic or Hebrew make
 * it right to left, any other script left to right. Digits and punctuation
 * decide nothing, so a text without letters has no direction of its own.
 */
export function textDirection(text: string): "ltr" | "rtl" | null {
  for (const character of text) {
    if (STRONG_RTL.test(character)) return "rtl";
    if (STRONG.test(character)) return "ltr";
  }
  return null;
}
const unplaced = new Set([
  "root",
  "text",
  "code-highlight",
  "tab",
  "linebreak",
  "link",
  "autolink",
]);

/**
 * The document with an id on every block, so a comment can point into it.
 * A block without one takes an id from where it stands, which stays true
 * only for a document that never changes, such as handed-in work.
 */
export function withBlockIds(document: ContentDocument): ContentDocument {
  const place = (node: ContentNode, path: number[]): ContentNode => {
    const children = node.children?.map((child, index) =>
      place(child, [...path, index]),
    );
    const id = `p${path.join("x")}`.padEnd(8, "z");
    const placed =
      unplaced.has(node.type) || node.$?.id || id.length > 36
        ? node
        : { ...node, $: { ...node.$, id } };
    return children ? { ...placed, children } : placed;
  };
  return { root: place(document.root, []) };
}

/**
 * The words a comment's anchor points at, read from the document as the
 * reader draws it: each text node counts in its nearest block, in reading
 * order, and parts the reader leaves out (accepted answers) count nowhere.
 */
export function wordsAt(
  document: ContentDocument,
  anchor: {
    start: { block: string; offset: number };
    end: { block: string; offset: number };
  },
): string {
  const order = new Map<string, number>();
  const texts: { block: string; text: string }[] = [];
  const walk = (node: ContentNode, block: string | undefined) => {
    if (node.type === "question-answer" || node.type === "gate") return;
    const own = node.$?.id ?? block;
    if (node.$?.id && !order.has(node.$.id)) order.set(node.$.id, order.size);
    if (
      (node.type === "text" ||
        node.type === "code-highlight" ||
        node.type === "tab") &&
      own
    )
      texts.push({ block: own, text: node.text ?? "" });
    node.children?.forEach((child) => walk(child, own));
  };
  walk(document.root, undefined);
  const from = order.get(anchor.start.block);
  const to = order.get(anchor.end.block);
  if (from === undefined || to === undefined) return "";
  const offsets = new Map<string, number>();
  let words = "";
  for (const { block, text } of texts) {
    const index = order.get(block) ?? -1;
    const start = offsets.get(block) ?? 0;
    offsets.set(block, start + text.length);
    if (index < from || index > to) continue;
    const begin = index === from ? Math.max(0, anchor.start.offset - start) : 0;
    const end =
      index === to
        ? Math.min(text.length, anchor.end.offset - start)
        : text.length;
    if (begin < end) words += text.slice(begin, end);
  }
  return words.replace(/\s+/g, " ").trim();
}

/**
 * A document's first picture, in reading order: what a card or a link
 * preview shows for it, with the words its author gave the picture.
 */
export function firstPicture(
  document: ContentDocument,
): { fileId: string; alt: string } | null {
  const pending = [document.root];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (node.type === "image" && node.fileId)
      return { fileId: node.fileId, alt: node.alt ?? "" };
    if (node.children) pending.unshift(...node.children);
  }
  return null;
}

export function contentFileIds(document: ContentDocument): string[] {
  const ids = new Set<string>();
  const pending = [document.root];
  for (let node = pending.pop(); node; node = pending.pop()) {
    for (const id of [
      node.fileId,
      node.captionsFileId,
      node.sceneFileId,
      node.projectFileId,
      node.$?.narration,
    ])
      if (id) ids.add(id);
    for (const evidence of node.aiEvidence ?? []) ids.add(evidence.fileId);
    for (const picture of node.pictures ?? []) ids.add(picture.fileId);
    if (node.children) pending.push(...node.children);
  }
  return [...ids];
}

function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      // Block ids and directions are the editor's bookkeeping, not words; a
      // block's narration is part of what it says.
      .flatMap(([key, item]): [string, unknown][] => {
        if (key === "direction") return [];
        if (key !== "$") return [[key, item]];
        const { id: _id, ...kept } = (item ?? {}) as Record<string, unknown>;
        return Object.keys(kept).length > 0 ? [[key, kept]] : [];
      })
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, comparable(item)]),
  );
}

/**
 * Whether two documents say the same thing. Stored copies come back with
 * their keys reordered, and the editor works out each block's direction as it
 * opens one, so neither counts as a change.
 */
export function sameContent(a: ContentDocument, b: ContentDocument): boolean {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

/**
 * What each student starts their answer from: the part of a brief set aside
 * as each student's copy. Null when the brief sets nothing aside.
 */
export function starterOf(brief: ContentDocument): ContentDocument | null {
  const kept = (brief.root.children ?? [])
    .filter((node) => node.type === "starter")
    .flatMap((node) => node.children ?? []);
  return kept.length > 0 ? { root: { ...brief.root, children: kept } } : null;
}

/** A brief as students read it, without the part each of them gets a copy of. */
export function withoutStarter(brief: ContentDocument): ContentDocument {
  return {
    root: {
      ...brief.root,
      children: (brief.root.children ?? []).filter(
        (node) => node.type !== "starter",
      ),
    },
  };
}

/** The places a document acknowledges using an AI tool. */
export function aiUsesOf(document: ContentDocument): ContentNode[] {
  const found: ContentNode[] = [];
  const pending = [document.root];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (node.type === "ai-use") found.push(node);
    if (node.children) pending.push(...node.children);
  }
  return found;
}

export type AiUseGap = "tool" | "date" | "use" | "evidence";

/**
 * What an acknowledgement still lacks: the boards ask for the tool, the date
 * and how it was used, and JCQ also for the prompts and output kept as
 * evidence.
 */
export function aiUseGaps(
  node: ContentNode,
  evidenceRequired: boolean,
): AiUseGap[] {
  const gaps: AiUseGap[] = [];
  if (!node.aiTool?.trim()) gaps.push("tool");
  if (!node.aiDate) gaps.push("date");
  if (!node.aiUse?.trim() && !node.aiPrompt?.trim()) gaps.push("use");
  if (evidenceRequired && !node.aiEvidence?.length) gaps.push("evidence");
  return gaps;
}

/** Whether a document still holds a suggested question its teacher has not kept. */
export const holdsSuggestions = (document: ContentDocument): boolean =>
  (document.root.children ?? []).some(
    (node) => node.type === "question" && node.suggested === true,
  );
