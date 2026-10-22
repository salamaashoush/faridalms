import type { FeedbackTime, QuestionKind } from "@faridalms/domain/content";
import type {
  ProjectFile,
  ProjectLanguage,
  ProjectLock,
} from "@faridalms/domain/project";
import type { ScratchFeature } from "@faridalms/domain/scratch-project";
import type { Level, PuzzleStyle } from "@faridalms/puzzles/level";
import type {
  DOMExportOutput,
  EditorConfig,
  ElementDOMSlot,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  RangeSelection,
  TextNode,
  SerializedElementNode,
  Spread,
} from "lexical";

import { hintsOf } from "@faridalms/domain/lesson-content";
import {
  blankOf,
  locked as heldTo,
  lockOf,
  pythonProject,
  sameFiles,
  sketchProject,
} from "@faridalms/domain/project";
import { firstLevel } from "@faridalms/puzzles/levels";
import { HERO, TURNED, centreOf, sceneOf } from "@faridalms/puzzles/scene";
import { addClassNamesToElement } from "@lexical/utils";
import {
  $createParagraphNode,
  $createTextNode,
  $getDocument,
  $getEditor,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $getState,
  $isTextNode,
  $setState,
  createState,
  ElementNode,
} from "lexical";

import { mediaClock } from "../format";
import { $createMathNode } from "./math";

/**
 * A picture on an option, an item or a side of a pair, kept as the flat
 * `fileId` and `alt` its document stores. Its words may be left out; the
 * description then names it.
 */
const partFileId = createState("fileId", {
  parse: (value) => (typeof value === "string" ? value : ""),
});
const partAlt = createState("alt", {
  parse: (value) => (typeof value === "string" ? value : ""),
});
const pictureStates = [
  { stateConfig: partFileId, flat: true },
  { stateConfig: partAlt, flat: true },
] as const;

export interface PartPicture {
  fileId: string;
  alt: string;
}

const pictureUrls = new WeakMap<LexicalEditor, (fileId: string) => string>();

/** Where an editor's part pictures are read from, set with its media. */
export function setPartPictureUrl(
  editor: LexicalEditor,
  url: (fileId: string) => string,
) {
  pictureUrls.set(editor, url);
}

export function $partPicture(node: LexicalNode): PartPicture | null {
  const fileId = $getState(node, partFileId);
  return fileId ? { fileId, alt: $getState(node, partAlt) } : null;
}

export function $setPartPicture(
  node: LexicalNode,
  picture: PartPicture | null,
) {
  $setState(node, partFileId, picture?.fileId ?? "");
  $setState(node, partAlt, picture?.alt ?? "");
}

/** Compares two versions of a node as they are, not as they are now. */
const samePicture = (a: LexicalNode, b: LexicalNode) =>
  $getState(a, partFileId, "direct") === $getState(b, partFileId, "direct") &&
  $getState(a, partAlt, "direct") === $getState(b, partAlt, "direct");

/** Draws a part's picture ahead of its words, outside what can be typed in. */
function drawPicture(
  node: LexicalNode,
  dom: HTMLElement,
  editor: LexicalEditor,
) {
  const fileId = $getState(node, partFileId);
  if (!fileId) return;
  const document = $getDocument();
  const holder = document.createElement("span");
  holder.dataset.partPicture = "";
  holder.contentEditable = "false";
  const image = document.createElement("img");
  image.src = pictureUrls.get(editor)?.(fileId) ?? "";
  image.alt = $getState(node, partAlt);
  image.draggable = false;
  holder.append(image);
  dom.prepend(holder);
}

/**
 * Draws a tracing question's model where its picture would go: each stroke
 * as a line with a dot where it starts, numbered in the order it is written.
 */
function drawTrace(trace: readonly number[][], dom: HTMLElement) {
  if (trace.length === 0) return;
  const document = $getDocument();
  const holder = document.createElement("span");
  holder.dataset.partPicture = "";
  holder.dataset.trace = "";
  holder.contentEditable = "false";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1 1");
  svg.setAttribute("aria-hidden", "true");
  trace.forEach((stroke, index) => {
    const line = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polyline",
    );
    const points: string[] = [];
    for (let at = 0; at + 1 < stroke.length; at += 2)
      points.push(`${stroke[at]},${stroke[at + 1]}`);
    line.setAttribute("points", points.join(" "));
    svg.append(line);
    const start = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    start.setAttribute("cx", String(stroke[0] ?? 0));
    start.setAttribute("cy", String(stroke[1] ?? 0));
    start.setAttribute("r", "0.035");
    start.dataset.stroke = String(index + 1);
    svg.append(start);
  });
  holder.append(svg);
  dom.prepend(holder);
}

const SVG = "http://www.w3.org/2000/svg";

/** Draws a puzzle question's board above its words, as students will meet it. */
function drawPuzzle(level: Level | null, dom: HTMLElement) {
  if (!level) return;
  const document = $getDocument();
  const holder = document.createElement("span");
  holder.dataset.partPicture = "";
  holder.dataset.puzzle = level.style;
  holder.contentEditable = "false";
  const scene = sceneOf(level);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
  svg.setAttribute("aria-hidden", "true");
  svg.style.maxWidth = `${scene.width}px`;
  const draw = (shapes: typeof scene.squares, into: Element) => {
    for (const shape of shapes) {
      const element = document.createElementNS(SVG, shape.tag);
      element.setAttribute("class", shape.className);
      for (const [name, value] of Object.entries(shape.attrs))
        element.setAttribute(name, String(value));
      into.append(element);
    }
  };
  draw(scene.squares, svg);
  draw(scene.goal, svg);
  for (const gem of scene.gems) draw(gem.shapes, svg);
  const hero = document.createElementNS(SVG, "g");
  const [x, y] = centreOf(level, level.start.cell);
  hero.setAttribute(
    "transform",
    `translate(${x} ${y}) rotate(${TURNED[level.start.heading]})`,
  );
  draw([...HERO], hero);
  svg.append(hero);
  holder.append(svg);
  dom.prepend(holder);
}

/** A marked place on a find-on-a-picture question's picture. */
export interface PicturePlace {
  /** Left, top, width and height across the picture. */
  box: number[];
  name: string;
  /** One to find; the others make the list a keyboard picks from a choice. */
  correct: boolean;
}

/** Outlines the marked places over a find-on-a-picture question's picture. */
function drawPlaces(places: readonly PicturePlace[], dom: HTMLElement) {
  const holder = dom.querySelector<HTMLElement>(":scope > [data-part-picture]");
  if (!holder) return;
  const document = $getDocument();
  places.forEach((place, index) => {
    const [left = 0, top = 0, width = 0, height = 0] = place.box;
    const box = document.createElement("span");
    box.dataset.region = String(index + 1);
    if (!place.correct) box.dataset.other = "";
    box.title = place.name;
    box.style.left = `${left * 100}%`;
    box.style.top = `${top * 100}%`;
    box.style.width = `${width * 100}%`;
    box.style.height = `${height * 100}%`;
    holder.append(box);
  });
}

function pictureSlot(dom: HTMLElement, slot: ElementDOMSlot): ElementDOMSlot {
  const picture = dom.querySelector(":scope > [data-part-picture]");
  return picture ? slot.withAfter(picture) : slot;
}

/** What a question's chrome says, set by the editor for its language. */
export interface QuestionLabels {
  kinds: Record<QuestionKind, string>;
  /** A written question answered by speaking instead. */
  spoken?: string;
  /** A written question answered on video. */
  filmed?: string;
  /** "Drawing" and "Photo", for written questions answered with a picture. */
  pictured?: Record<"drawing" | "photo", string>;
  /** A counting question by its number and what the child does. */
  count?: (count: number, make: boolean) => string;
  /** A word builder's lines: the word's tiles, then extra ones. */
  wordTiles?: string;
  /** A coding question that starts from the teacher's own project. */
  starter?: string;
  /** A coding question that asks its students' projects to have some things. */
  checks?: (count: number) => string;
  /** A micro:bit question held to one language. */
  editors?: Record<ProjectLock, string>;
  /** A project question made in Python rather than as a web page. */
  pythonProject?: string;
  /** A project question made for the micro:bit, in its own editor. */
  microbitProject?: string;
  /** A puzzle answered with a row of arrows rather than with blocks. */
  arrowsPuzzle?: string;
  /** A question asked at a time in the video above it. */
  videoAt?: (time: string) => string;
  /** A question tagged with some of the school's standards. */
  standards?: (count: number) => string;
  /** A question suggested from the document, waiting for its teacher. */
  suggested?: string;
  /** A code puzzle's empty line, and a line marked as belonging nowhere. */
  codeLine?: string;
  distractor?: string;
  /** A code exercise's test: what the program reads, and what it prints. */
  testInput?: string;
  testOutput?: string;
  /** A test run and counted but never shown to students. */
  hiddenTest?: string;
  extraTiles?: string;
  points: (points: number) => string;
  answerIs: string;
  prompt: string;
  option: string;
  answer: string;
  accepted: string;
  pairPrompt: string;
  pairAnswer: string;
  extra: string;
  groupName: string;
  item: string;
  passage: string;
  statementTrue: string;
  statementFalse: string;
  /** What a "tell me why" question asks, before the teacher words it. */
  whyPrompt?: string;
}

const labels = new WeakMap<LexicalEditor, QuestionLabels>();
const locked = new WeakSet<LexicalEditor>();

/**
 * Keeps an editor's questions from change once students have started
 * answering them; the words around them stay editable.
 */
export function setQuestionsLocked(editor: LexicalEditor, value: boolean) {
  if (value) locked.add(editor);
  else locked.delete(editor);
  editor.getEditorState().read(() => {
    for (const node of $getRoot().getChildren()) {
      const dom = $isQuestionNode(node)
        ? editor.getElementByKey(node.getKey())
        : null;
      if (dom) lockElement(dom, value);
    }
  });
}

function lockElement(dom: HTMLElement, value: boolean) {
  if (value) {
    dom.contentEditable = "false";
    dom.dataset.locked = "";
  } else {
    dom.removeAttribute("contenteditable");
    delete dom.dataset.locked;
  }
}

export function setQuestionLabels(
  editor: LexicalEditor,
  value: QuestionLabels,
) {
  labels.set(editor, value);
}

export interface QuestionSettings {
  kind: QuestionKind;
  questionId: string;
  points: number;
  tries: number | null;
  /** When the student learns how it went. */
  feedbackAt: FeedbackTime;
  /** Suggested from the document, and not yet kept by its teacher. */
  suggested: boolean;
  /** Gaps filled from a word bank: its extra words; none when each gap is typed or chosen alone. */
  bank: string[] | null;
  multiple: boolean;
  shuffle: boolean;
  caseSensitive: boolean;
  closeEnough: boolean;
  tehMarbuta: boolean;
  wordLimit: number | null;
  /** Answered by speaking for up to this many seconds, rather than writing. */
  recordSeconds: number | null;
  /** A spoken answer recorded on camera, or of the student's screen. */
  recordVideo: boolean;
  /** Answered with a drawing or a photo, rather than writing. */
  answerWith: "drawing" | "photo" | null;
  /** A counting question: how many, what the child does, how they are set out. */
  count: number;
  countMode: "count" | "make";
  countLayout: "scatter" | "line" | "frame";
  /** Seconds the things to count stay in view; none keeps them there. */
  flashSeconds: number | null;
  /** A tracing question's model, the teacher's strokes across a unit square. */
  trace: number[][];
  /** A find-on-a-picture question's marked places. */
  places: PicturePlace[];
  /** A matching question played as memory pairs. */
  memory: boolean;
  /** A coding question's starter project; none starts from the studio's own. */
  projectFileId: string | null;
  /** A project question's starter files; none starts from an empty page. */
  projectFiles: ProjectFile[];
  /** A project question whose students may show their work to the class. */
  gallery: boolean;
  /** What a coding question asks every student's project to have. */
  projectChecks: ScratchFeature[];
  /** What a project question is made in: a web page, or a Python program. */
  projectLanguage: ProjectLanguage;
  /** A puzzle question's grid, the blocks it offers and its teacher's answer. */
  puzzle: Level | null;
  /** Asked when the video above reaches this second; none asks it in the reading. */
  videoAt: number | null;
  /** A code puzzle's language; only Python marks how far a line is indented. */
  codeLanguage: "python" | "javascript" | "html" | "text";
  /** Shown in order, one more after each wrong try. */
  hints: string[];
  /** The school's standards the question gives evidence of, by id. */
  standards: string[];
  explanation: string;
  numberMode: "exact" | "range";
  answerValue: number;
  tolerance: number;
  percent: boolean;
  rangeMin: number;
  rangeMax: number;
  scoring: "all" | "neighbours";
}

export function defaultSettings(kind: QuestionKind): QuestionSettings {
  return {
    kind,
    questionId: crypto.randomUUID(),
    points:
      kind === "written" ||
      kind === "scratch" ||
      kind === "project" ||
      kind === "program"
        ? 2
        : 1,
    tries: null,
    feedbackAt: "now",
    suggested: false,
    bank: null,
    multiple: false,
    shuffle: kind === "choice",
    caseSensitive: false,
    closeEnough: false,
    tehMarbuta: true,
    wordLimit: null,
    recordSeconds: null,
    recordVideo: false,
    answerWith: null,
    count: 5,
    countMode: "count",
    countLayout: "scatter",
    flashSeconds: null,
    trace: [],
    places: [],
    memory: false,
    projectFileId: null,
    projectFiles: [],
    gallery: false,
    projectChecks: [],
    projectLanguage: "web",
    puzzle: kind === "puzzle" ? firstLevel("blocks") : null,
    videoAt: null,
    codeLanguage: "python",
    hints: [],
    standards: [],
    explanation: "",
    numberMode: "exact",
    answerValue: 0,
    tolerance: 0,
    percent: false,
    rangeMin: 0,
    rangeMax: 0,
    scoring: "all",
  };
}

/**
 * Settings as a node may hold them. Shared editing keeps them whole as last
 * written, so a question written before a setting existed lacks it, and one
 * written when a question had a single hint keeps it as `hint`.
 */
type StoredSettings = Partial<QuestionSettings> & { hint?: string };

export type SerializedQuestionNode = Spread<
  StoredSettings,
  SerializedElementNode
>;

const NO_POINTS: number[][] = [];
const NO_PLACES: PicturePlace[] = [];
const NO_FILES: ProjectFile[] = [];
const NO_CHECKS: ScratchFeature[] = [];
const NO_STANDARDS: string[] = [];

function questionSettings(stored: StoredSettings): QuestionSettings {
  const base = defaultSettings(stored.kind ?? "choice");
  return {
    kind: stored.kind ?? base.kind,
    questionId: stored.questionId ?? base.questionId,
    points: stored.points ?? base.points,
    tries: stored.tries ?? null,
    feedbackAt: stored.feedbackAt ?? "now",
    suggested: stored.suggested ?? false,
    bank: stored.bank ?? null,
    multiple: stored.multiple ?? base.multiple,
    shuffle: stored.shuffle ?? base.shuffle,
    caseSensitive: stored.caseSensitive ?? base.caseSensitive,
    closeEnough: stored.closeEnough ?? base.closeEnough,
    tehMarbuta: stored.tehMarbuta ?? base.tehMarbuta,
    wordLimit: stored.wordLimit ?? null,
    recordSeconds: stored.recordSeconds ?? null,
    recordVideo: stored.recordVideo ?? false,
    answerWith: stored.answerWith ?? null,
    count: stored.count ?? base.count,
    countMode: stored.countMode ?? base.countMode,
    countLayout: stored.countLayout ?? base.countLayout,
    flashSeconds: stored.flashSeconds ?? null,
    // One empty list for all, so a redraw compares them alike.
    trace: stored.trace ?? NO_POINTS,
    places: stored.places ?? NO_PLACES,
    memory: stored.memory ?? false,
    projectFileId: stored.projectFileId ?? null,
    projectFiles: stored.projectFiles ?? NO_FILES,
    gallery: stored.gallery ?? false,
    projectChecks: stored.projectChecks ?? NO_CHECKS,
    projectLanguage: stored.projectLanguage ?? "web",
    puzzle: stored.puzzle ?? base.puzzle,
    videoAt: stored.videoAt ?? null,
    codeLanguage: stored.codeLanguage ?? base.codeLanguage,
    hints: hintsOf(stored),
    standards: stored.standards ?? NO_STANDARDS,
    explanation: stored.explanation ?? "",
    numberMode: stored.numberMode ?? base.numberMode,
    answerValue: stored.answerValue ?? base.answerValue,
    tolerance: stored.tolerance ?? base.tolerance,
    percent: stored.percent ?? base.percent,
    rangeMin: stored.rangeMin ?? base.rangeMin,
    rangeMax: stored.rangeMax ?? base.rangeMax,
    scoring: stored.scoring ?? base.scoring,
  };
}

function theme(config: EditorConfig, name: string): string | undefined {
  const value: unknown = config.theme[name];
  return typeof value === "string" ? value : undefined;
}

/** A number question's key in a few characters: "6", "6 ± 0.5", "2 – 5". */
export function numberAnswer(settings: QuestionSettings): string {
  if (settings.numberMode === "range")
    return `${settings.rangeMin} – ${settings.rangeMax}`;
  return settings.tolerance
    ? `${settings.answerValue} ± ${settings.tolerance}${settings.percent ? "%" : ""}`
    : String(settings.answerValue);
}

function label(editor: LexicalEditor, settings: QuestionSettings): string {
  const text = labels.get(editor);
  if (!text) return "";
  const kind =
    settings.kind === "written" && settings.recordSeconds !== null
      ? ((settings.recordVideo ? text.filmed : text.spoken) ??
        text.kinds.written)
      : settings.kind === "written" && settings.answerWith
        ? (text.pictured?.[settings.answerWith] ?? text.kinds.written)
        : settings.kind === "counting" && text.count
          ? text.count(settings.count, settings.countMode === "make")
          : settings.kind === "project" && settings.projectLanguage === "python"
            ? (text.pythonProject ?? text.kinds.project)
            : settings.kind === "project" &&
                settings.projectLanguage === "microbit"
              ? (text.microbitProject ?? text.kinds.project)
              : settings.kind === "puzzle" &&
                  settings.puzzle?.style === "arrows"
                ? (text.arrowsPuzzle ?? text.kinds.puzzle)
                : text.kinds[settings.kind];
  const lock =
    settings.kind === "project" && settings.projectLanguage === "microbit"
      ? lockOf(settings.projectFiles)
      : null;
  // A project held to one language and otherwise blank is nobody's build.
  const built =
    settings.kind === "project" &&
    settings.projectFiles.length > 0 &&
    !(
      lock &&
      sameFiles(
        settings.projectFiles,
        heldTo(blankOf("microbit", "en", false), lock),
      )
    );
  const starts =
    text.starter &&
    ((settings.kind === "scratch" && settings.projectFileId) || built)
      ? ` · ${text.starter}`
      : "";
  const held = lock && text.editors ? ` · ${text.editors[lock]}` : "";
  const checked =
    settings.kind === "scratch" &&
    settings.projectChecks.length > 0 &&
    text.checks
      ? ` · ${text.checks(settings.projectChecks.length)}`
      : "";
  const asked =
    settings.videoAt !== null && text.videoAt
      ? ` · ${text.videoAt(mediaClock(settings.videoAt))}`
      : "";
  const tagged =
    settings.standards.length > 0 && text.standards
      ? ` · ${text.standards(settings.standards.length)}`
      : "";
  const waits =
    settings.suggested && text.suggested ? `${text.suggested} · ` : "";
  return `${waits}${kind}${starts}${held}${checked}${asked}${tagged} · ${text.points(settings.points)}`;
}

/**
 * A question in the text: its prompt and parts are child nodes, so their
 * words are edited, formatted and merged in live editing like any text,
 * and its settings ride on the node itself.
 */
export class QuestionNode extends ElementNode {
  __settings: StoredSettings;

  constructor(settings?: StoredSettings, key?: NodeKey) {
    super(key);
    this.__settings = {
      ...defaultSettings(settings?.kind ?? "choice"),
      ...settings,
    };
  }

  $config() {
    // A counting question carries the picture of what is counted.
    return this.config("question", {
      extends: ElementNode,
      stateConfigs: pictureStates,
    });
  }

  static clone(node: QuestionNode): QuestionNode {
    return new QuestionNode({ ...node.__settings }, node.__key);
  }

  static importJSON(json: SerializedQuestionNode): QuestionNode {
    return new QuestionNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedQuestionNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__settings = questionSettings(json);
    return node;
  }

  exportJSON(): SerializedQuestionNode {
    // Settings a question does not use stay out, so documents saved before
    // a setting existed read the same as they did.
    const {
      recordSeconds,
      recordVideo,
      answerWith,
      count,
      countMode,
      countLayout,
      flashSeconds,
      trace,
      places,
      memory,
      projectFileId,
      projectFiles,
      gallery,
      projectChecks,
      projectLanguage,
      puzzle,
      videoAt,
      codeLanguage,
      hints,
      standards,
      feedbackAt,
      suggested,
      bank,
      ...settings
    } = questionSettings(this.getLatest().__settings);
    return {
      ...super.exportJSON(),
      ...settings,
      ...(feedbackAt === "now" ? {} : { feedbackAt }),
      ...(suggested ? { suggested } : {}),
      ...(settings.kind === "gaps" && bank !== null ? { bank } : {}),
      ...(recordSeconds === null ? {} : { recordSeconds }),
      ...(recordSeconds !== null && recordVideo ? { recordVideo } : {}),
      ...(answerWith === null ? {} : { answerWith }),
      ...(settings.kind === "counting"
        ? { count, countMode, countLayout, flashSeconds }
        : {}),
      ...(settings.kind === "tracing" ? { trace } : {}),
      ...(settings.kind === "hotspot" ? { places } : {}),
      ...(settings.kind === "matching" && memory ? { memory } : {}),
      ...(settings.kind === "scratch" && projectFileId
        ? { projectFileId }
        : {}),
      ...(settings.kind === "project" && projectFiles.length > 0
        ? { projectFiles }
        : {}),
      ...((settings.kind === "project" || settings.kind === "scratch") &&
      gallery
        ? { gallery }
        : {}),
      ...(settings.kind === "scratch" && projectChecks.length > 0
        ? { projectChecks }
        : {}),
      ...(settings.kind === "project" && projectLanguage !== "web"
        ? { projectLanguage }
        : {}),
      ...(settings.kind === "puzzle" && puzzle ? { puzzle } : {}),
      ...(videoAt === null ? {} : { videoAt }),
      ...(settings.kind === "parsons" || settings.kind === "program"
        ? { codeLanguage }
        : {}),
      ...(hints.length > 0 ? { hints } : {}),
      ...(standards.length > 0 ? { standards } : {}),
    };
  }

  exportDOM(): DOMExportOutput {
    return { element: $getDocument().createElement("div") };
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    const settings = questionSettings(this.__settings);
    const name = theme(config, "question");
    if (name) addClassNamesToElement(dom, name);
    dom.dataset.question = "";
    dom.dataset.kind = settings.kind;
    dom.dataset.multiple = String(settings.multiple);
    dom.dataset.label = label(editor, settings);
    if (settings.suggested) dom.dataset.suggested = "";
    if (locked.has(editor)) lockElement(dom, true);
    if (settings.kind === "number")
      dom.dataset.answer = `${labels.get(editor)?.answerIs ?? ""} ${numberAnswer(settings)}`;
    if (
      settings.kind === "counting" ||
      settings.kind === "spelling" ||
      settings.kind === "hotspot"
    )
      drawPicture(this, dom, editor);
    if (settings.kind === "hotspot") drawPlaces(settings.places, dom);
    if (settings.kind === "tracing") drawTrace(settings.trace, dom);
    if (settings.kind === "puzzle") drawPuzzle(settings.puzzle, dom);
    return dom;
  }

  getDOMSlot(dom: HTMLElement): ElementDOMSlot {
    return pictureSlot(dom, super.getDOMSlot(dom));
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
    const settings = questionSettings(this.__settings);
    const before = questionSettings(previous.__settings);
    // The label carries the kind and points in words, drawn anew.
    if (
      before.kind !== settings.kind ||
      before.points !== settings.points ||
      before.suggested !== settings.suggested ||
      before.recordSeconds !== settings.recordSeconds ||
      before.recordVideo !== settings.recordVideo ||
      before.answerWith !== settings.answerWith ||
      before.videoAt !== settings.videoAt ||
      before.count !== settings.count ||
      before.countMode !== settings.countMode ||
      before.trace !== settings.trace ||
      before.places !== settings.places ||
      before.projectFileId !== settings.projectFileId ||
      before.projectFiles !== settings.projectFiles ||
      before.puzzle !== settings.puzzle ||
      !samePicture(previous, this) ||
      numberAnswer(before) !== numberAnswer(settings)
    )
      return true;
    if (before.multiple !== settings.multiple)
      dom.dataset.multiple = String(settings.multiple);
    // What a project is asked to do is ticked in a menu that stays open
    // and hangs from this element, and the standards are chosen in a panel
    // that does too, so their counts are written on the label here rather
    // than on an element drawn anew.
    if (
      before.projectChecks !== settings.projectChecks ||
      before.standards !== settings.standards
    )
      dom.dataset.label = label($getEditor(), settings);
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  getSettings(): QuestionSettings {
    return questionSettings(this.getLatest().__settings);
  }

  setSettings(patch: Partial<QuestionSettings>): this {
    const writable = this.getWritable();
    writable.__settings = {
      ...questionSettings(writable.__settings),
      ...patch,
    };
    return writable;
  }
}

/** The question's words, written like a paragraph. */
export class QuestionPromptNode extends ElementNode {
  $config() {
    return this.config("question-prompt", { extends: ElementNode });
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    dom.dataset.questionPrompt = "";
    dom.dataset.emptyLabel = labels.get(editor)?.prompt ?? "";
    const name = theme(config, "questionPrompt");
    if (name) addClassNamesToElement(dom, name);
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  collapseAtStart(): boolean {
    return true;
  }
}

/** Enter after a part adds another part of the same kind below it. */
function $partAfter(part: ElementNode, next: ElementNode, restore: boolean) {
  part.insertAfter(next, restore);
  return next;
}

/**
 * Backspace at a part's start goes back to the line above, never merging. An
 * empty part goes, unless it shows a picture, which is removed on purpose
 * from the bar rather than lost to a keystroke.
 */
function $collapsePart(part: ElementNode): boolean {
  const previous = part.getPreviousSibling();
  if (part.isEmpty() && !$partPicture(part)) part.remove();
  if ($isElementNode(previous)) previous.selectEnd();
  return true;
}

export type SerializedQuestionOptionNode = Spread<
  { optionId?: string; correct?: boolean; feedback?: string },
  SerializedElementNode
>;

/** A choice a student can pick, marked right with the circle at its start. */
export class QuestionOptionNode extends ElementNode {
  __optionId: string;
  __correct: boolean;
  __feedback: string;

  constructor(
    optionId: string = crypto.randomUUID(),
    correct = false,
    feedback = "",
    key?: NodeKey,
  ) {
    super(key);
    this.__optionId = optionId;
    this.__correct = correct;
    this.__feedback = feedback;
  }

  $config() {
    return this.config("question-option", {
      extends: ElementNode,
      stateConfigs: pictureStates,
    });
  }

  static clone(node: QuestionOptionNode): QuestionOptionNode {
    return new QuestionOptionNode(
      node.__optionId,
      node.__correct,
      node.__feedback,
      node.__key,
    );
  }

  static importJSON(json: SerializedQuestionOptionNode): QuestionOptionNode {
    return new QuestionOptionNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedQuestionOptionNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__optionId = json.optionId ?? crypto.randomUUID();
    node.__correct = json.correct ?? false;
    node.__feedback = json.feedback ?? "";
    return node;
  }

  exportJSON(): SerializedQuestionOptionNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      optionId: node.__optionId,
      correct: node.__correct,
      ...(node.__feedback ? { feedback: node.__feedback } : {}),
    };
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): ElementNode {
    return $partAfter(this, new QuestionOptionNode(), restoreSelection);
  }

  collapseAtStart(): boolean {
    return $collapsePart(this);
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    dom.dataset.questionOption = "";
    dom.dataset.correct = String(this.__correct);
    dom.dataset.emptyLabel = labels.get(editor)?.option ?? "";
    dom.dataset.lineLabel = labels.get(editor)?.codeLine ?? "";
    dom.dataset.distractorLabel = labels.get(editor)?.distractor ?? "";
    dom.setAttribute("aria-checked", String(this.__correct));
    const name = theme(config, "questionOption");
    if (name) addClassNamesToElement(dom, name);
    drawPicture(this, dom, editor);
    // The marker is drawn in the padding at the start; a click there marks
    // the option right, the way a checklist item is ticked.
    dom.addEventListener("click", (event) => {
      const rect = dom.getBoundingClientRect();
      const rtl = getComputedStyle(dom).direction === "rtl";
      const edge = rtl ? rect.right - event.clientX : event.clientX - rect.left;
      if (edge > 30 || !editor.isEditable()) return;
      event.preventDefault();
      editor.update(() => $toggleMark(this.getLatest()));
    });
    return dom;
  }

  getDOMSlot(dom: HTMLElement): ElementDOMSlot {
    return pictureSlot(dom, super.getDOMSlot(dom));
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
    if (!samePicture(previous, this)) return true;
    if (previous.__correct !== this.__correct) {
      dom.dataset.correct = String(this.__correct);
      dom.setAttribute("aria-checked", String(this.__correct));
    }
    return false;
  }

  getOptionId(): string {
    return this.getLatest().__optionId;
  }

  setOptionId(optionId: string): this {
    const writable = this.getWritable();
    writable.__optionId = optionId;
    return writable;
  }

  isCorrect(): boolean {
    return this.getLatest().__correct;
  }

  setCorrect(correct: boolean): this {
    const writable = this.getWritable();
    writable.__correct = correct;
    return writable;
  }

  getFeedback(): string {
    return this.getLatest().__feedback;
  }

  setFeedback(feedback: string): this {
    const writable = this.getWritable();
    writable.__feedback = feedback;
    return writable;
  }
}

export type SerializedQuestionAnswerNode = Spread<
  { optionId?: string },
  SerializedElementNode
>;

/**
 * A typed answer that counts as right, or, in a matching question, an
 * extra answer that matches nothing.
 */
export class QuestionAnswerNode extends ElementNode {
  __optionId: string;

  constructor(optionId: string = crypto.randomUUID(), key?: NodeKey) {
    super(key);
    this.__optionId = optionId;
  }

  $config() {
    return this.config("question-answer", {
      extends: ElementNode,
      stateConfigs: pictureStates,
    });
  }

  static clone(node: QuestionAnswerNode): QuestionAnswerNode {
    return new QuestionAnswerNode(node.__optionId, node.__key);
  }

  static importJSON(json: SerializedQuestionAnswerNode): QuestionAnswerNode {
    return new QuestionAnswerNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedQuestionAnswerNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__optionId = json.optionId ?? crypto.randomUUID();
    return node;
  }

  exportJSON(): SerializedQuestionAnswerNode {
    return { ...super.exportJSON(), optionId: this.getLatest().__optionId };
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): ElementNode {
    return $partAfter(this, new QuestionAnswerNode(), restoreSelection);
  }

  collapseAtStart(): boolean {
    return $collapsePart(this);
  }

  updateDOM(previous: this): boolean {
    return !samePicture(previous, this);
  }

  getDOMSlot(dom: HTMLElement): ElementDOMSlot {
    return pictureSlot(dom, super.getDOMSlot(dom));
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    const text = labels.get(editor);
    const question = this.getParent();
    const kind = $isQuestionNode(question) ? question.getSettings().kind : null;
    const extra = kind === "matching";
    dom.dataset.questionAnswer = extra ? "extra" : "";
    dom.dataset.emptyLabel =
      (kind === "spelling"
        ? text?.wordTiles
        : extra
          ? text?.extra
          : text?.answer) ?? "";
    // Which line holds the word is its place, which can change after the
    // line is drawn, so the style picks this label for every line after it.
    if (kind === "spelling") dom.dataset.extraLabel = text?.extraTiles ?? "";
    const name = theme(config, "questionAnswer");
    if (name) addClassNamesToElement(dom, name);
    drawPicture(this, dom, editor);
    return dom;
  }

  getOptionId(): string {
    return this.getLatest().__optionId;
  }

  setOptionId(optionId: string): this {
    const writable = this.getWritable();
    writable.__optionId = optionId;
    return writable;
  }
}

export type SerializedQuestionHolderNode = Spread<
  { optionId?: string },
  SerializedElementNode
>;

export type SerializedQuestionPairNode = Spread<
  { optionId?: string; hidden?: boolean },
  SerializedElementNode
>;

/**
 * Something to match and its match, side by side; in a code exercise, what
 * a test gives the program and what it must print.
 */
export class QuestionPairNode extends ElementNode {
  __optionId: string;
  /** A code exercise's test run and counted but never shown to students. */
  __hidden: boolean;

  constructor(
    optionId: string = crypto.randomUUID(),
    hidden = false,
    key?: NodeKey,
  ) {
    super(key);
    this.__optionId = optionId;
    this.__hidden = hidden;
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedQuestionPairNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__optionId = json.optionId ?? crypto.randomUUID();
    node.__hidden = json.hidden ?? false;
    return node;
  }

  exportJSON(): SerializedQuestionPairNode {
    const latest = this.getLatest();
    return {
      ...super.exportJSON(),
      optionId: latest.__optionId,
      ...(latest.__hidden ? { hidden: true } : {}),
    };
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
    if (previous.__hidden !== this.__hidden) markHidden(dom, this.__hidden);
    return false;
  }

  isHidden(): boolean {
    return this.getLatest().__hidden;
  }

  setHidden(hidden: boolean): this {
    const writable = this.getWritable();
    writable.__hidden = hidden;
    return writable;
  }

  isShadowRoot(): boolean {
    return true;
  }

  getOptionId(): string {
    return this.getLatest().__optionId;
  }

  setOptionId(optionId: string): this {
    const writable = this.getWritable();
    writable.__optionId = optionId;
    return writable;
  }

  $config() {
    return this.config("question-pair", { extends: ElementNode });
  }

  static clone(node: QuestionPairNode): QuestionPairNode {
    return new QuestionPairNode(node.__optionId, node.__hidden, node.__key);
  }

  static importJSON(json: SerializedQuestionPairNode): QuestionPairNode {
    return new QuestionPairNode().updateFromJSON(json);
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    dom.dataset.questionPair = "";
    dom.dataset.hiddenLabel = labels.get(editor)?.hiddenTest ?? "";
    markHidden(dom, this.__hidden);
    const name = theme(config, "questionPair");
    if (name) addClassNamesToElement(dom, name);
    return dom;
  }
}

function markHidden(dom: HTMLElement, hidden: boolean) {
  if (hidden) dom.dataset.hidden = "";
  else delete dom.dataset.hidden;
}

/** A named group in a sorting question, with the items that belong in it. */
export class QuestionGroupNode extends ElementNode {
  __optionId: string;

  constructor(optionId: string = crypto.randomUUID(), key?: NodeKey) {
    super(key);
    this.__optionId = optionId;
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedQuestionHolderNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__optionId = json.optionId ?? crypto.randomUUID();
    return node;
  }

  exportJSON(): SerializedQuestionHolderNode {
    return { ...super.exportJSON(), optionId: this.getLatest().__optionId };
  }

  updateDOM(): boolean {
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }

  getOptionId(): string {
    return this.getLatest().__optionId;
  }

  setOptionId(optionId: string): this {
    const writable = this.getWritable();
    writable.__optionId = optionId;
    return writable;
  }

  $config() {
    return this.config("question-group", { extends: ElementNode });
  }

  static clone(node: QuestionGroupNode): QuestionGroupNode {
    return new QuestionGroupNode(node.__optionId, node.__key);
  }

  static importJSON(json: SerializedQuestionHolderNode): QuestionGroupNode {
    return new QuestionGroupNode().updateFromJSON(json);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("div");
    dom.dataset.questionGroup = "";
    const name = theme(config, "questionGroup");
    if (name) addClassNamesToElement(dom, name);
    return dom;
  }
}

/** One line of a pair or a group's name. */
export class QuestionSideNode extends ElementNode {
  $config() {
    return this.config("question-side", {
      extends: ElementNode,
      stateConfigs: pictureStates,
    });
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    const text = labels.get(editor);
    const holder = this.getParent();
    dom.dataset.questionSide = "";
    const question = holder?.getParent();
    const test =
      question instanceof QuestionNode &&
      question.getSettings().kind === "program";
    const first = this.getIndexWithinParent() === 0;
    dom.dataset.emptyLabel =
      (holder instanceof QuestionGroupNode
        ? text?.groupName
        : test
          ? first
            ? text?.testInput
            : text?.testOutput
          : first
            ? text?.pairPrompt
            : text?.pairAnswer) ?? "";
    const name = theme(config, "questionSide");
    if (name) addClassNamesToElement(dom, name);
    drawPicture(this, dom, editor);
    return dom;
  }

  getDOMSlot(dom: HTMLElement): ElementDOMSlot {
    return pictureSlot(dom, super.getDOMSlot(dom));
  }

  updateDOM(previous: this): boolean {
    return !samePicture(previous, this);
  }

  collapseAtStart(): boolean {
    const previous =
      this.getPreviousSibling() ?? this.getParent()?.getPreviousSibling();
    if ($isElementNode(previous)) previous.selectEnd();
    return true;
  }
}

/** A paragraph of a gaps passage; Enter adds another below it. */
export class QuestionPassageNode extends ElementNode {
  $config() {
    return this.config("question-passage", { extends: ElementNode });
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    dom.dataset.questionPassage = "";
    dom.dataset.emptyLabel = labels.get(editor)?.passage ?? "";
    const name = theme(config, "questionPassage");
    if (name) addClassNamesToElement(dom, name);
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): ElementNode {
    return $partAfter(this, new QuestionPassageNode(), restoreSelection);
  }

  collapseAtStart(): boolean {
    const previous = this.getPreviousSibling();
    if ($isQuestionPassageNode(previous)) return false;
    return $collapsePart(this);
  }
}

export type SerializedQuestionGapNode = Spread<
  { optionId?: string },
  SerializedElementNode
>;

/**
 * A gap in a passage. Its words are its answers, written the way teachers
 * already type them: "Cairo/القاهرة" for any of several typed answers,
 * "right|wrong|wrong" for a list to choose from, the first one right.
 */
export class QuestionGapNode extends ElementNode {
  __optionId: string;

  constructor(optionId: string = crypto.randomUUID(), key?: NodeKey) {
    super(key);
    this.__optionId = optionId;
  }

  $config() {
    return this.config("question-gap", { extends: ElementNode });
  }

  static clone(node: QuestionGapNode): QuestionGapNode {
    return new QuestionGapNode(node.__optionId, node.__key);
  }

  static importJSON(json: SerializedQuestionGapNode): QuestionGapNode {
    return new QuestionGapNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedQuestionGapNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__optionId = json.optionId ?? crypto.randomUUID();
    return node;
  }

  exportJSON(): SerializedQuestionGapNode {
    return { ...super.exportJSON(), optionId: this.getLatest().__optionId };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("span");
    dom.dataset.questionGap = "";
    const name = theme(config, "questionGap");
    if (name) addClassNamesToElement(dom, name);
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): true {
    return true;
  }

  canBeEmpty(): false {
    return false;
  }

  // Typing at either edge writes passage text, never more answers.
  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }

  getOptionId(): string {
    return this.getLatest().__optionId;
  }

  setOptionId(optionId: string): this {
    const writable = this.getWritable();
    writable.__optionId = optionId;
    return writable;
  }
}

export function $isQuestionPassageNode(
  node: LexicalNode | null | undefined,
): node is QuestionPassageNode {
  return node instanceof QuestionPassageNode;
}

export function $isQuestionGapNode(
  node: LexicalNode | null | undefined,
): node is QuestionGapNode {
  return node instanceof QuestionGapNode;
}

const GAP = /\[([^[\]]*[^[\]\s][^[\]]*)\]/;

/**
 * Closing a bracket in a passage makes what it holds a gap, so "[Cairo]"
 * typed in the text becomes the gap "Cairo" with the caret after it.
 */
export function $typeGap(node: TextNode) {
  if (!$isQuestionPassageNode(node.getParent()) || !node.isSimpleText()) return;
  const match = GAP.exec(node.getTextContent());
  if (!match) return;
  const start = match.index;
  const end = start + match[0].length;
  const parts = node.splitText(start, end);
  const bracketed = parts[start === 0 ? 0 : 1];
  if (!bracketed) return;
  const gap = new QuestionGapNode().append(
    $createTextNode((match[1] ?? "").trim()),
  );
  const selection = $getSelection();
  const caretInside =
    $isRangeSelection(selection) &&
    selection.isCollapsed() &&
    selection.anchor.key === bracketed.getKey();
  bracketed.replace(gap);
  if (caretInside) {
    const after = gap.getNextSibling();
    if ($isTextNode(after)) after.select(0, 0);
    else gap.selectNext();
  }
}

/** A gap holds only its words, sits only in a passage and is never empty. */
export function $repairGap(gap: QuestionGapNode) {
  if (!$isQuestionPassageNode(gap.getParent())) {
    gap.replace($createTextNode(`[${gap.getTextContent()}]`));
    return;
  }
  if (gap.getTextContent().trim() === "") {
    gap.remove();
    return;
  }
  for (const child of gap.getChildren())
    if (!$isTextNode(child))
      child.replace($createTextNode(child.getTextContent()));
}

export function $isQuestionNode(
  node: LexicalNode | null | undefined,
): node is QuestionNode {
  return node instanceof QuestionNode;
}

export function $isQuestionPromptNode(
  node: LexicalNode | null | undefined,
): node is QuestionPromptNode {
  return node instanceof QuestionPromptNode;
}

export function $isQuestionOptionNode(
  node: LexicalNode | null | undefined,
): node is QuestionOptionNode {
  return node instanceof QuestionOptionNode;
}

export function $isQuestionPairNode(
  node: LexicalNode | null | undefined,
): node is QuestionPairNode {
  return node instanceof QuestionPairNode;
}

export function $isQuestionGroupNode(
  node: LexicalNode | null | undefined,
): node is QuestionGroupNode {
  return node instanceof QuestionGroupNode;
}

export function $isQuestionSideNode(
  node: LexicalNode | null | undefined,
): node is QuestionSideNode {
  return node instanceof QuestionSideNode;
}

/** A pair with both sides empty, ready to type. */
export function $createQuestionPair(): QuestionPairNode {
  return new QuestionPairNode().append(
    new QuestionSideNode(),
    new QuestionSideNode(),
  );
}

/** A group with its name and one item, ready to type. */
export function $createQuestionGroup(): QuestionGroupNode {
  return new QuestionGroupNode().append(
    new QuestionSideNode(),
    new QuestionOptionNode(),
  );
}

export function $isQuestionAnswerNode(
  node: LexicalNode | null | undefined,
): node is QuestionAnswerNode {
  return node instanceof QuestionAnswerNode;
}

/** Marks an option right; a single-answer question keeps only one right. */
export function $toggleCorrect(option: QuestionOptionNode) {
  const question = option.getParent();
  const multiple = $isQuestionNode(question) && question.getSettings().multiple;
  const next = !option.isCorrect();
  if (next && !multiple && $isQuestionNode(question))
    for (const sibling of question.getChildren())
      if ($isQuestionOptionNode(sibling) && sibling.isCorrect())
        sibling.setCorrect(false);
  option.setCorrect(next);
}

/** The option or line of code the caret is in, when its mark means something. */
export function $markableAtCaret(): QuestionOptionNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  let node: LexicalNode | null = selection.anchor.getNode();
  while (node && !$isQuestionOptionNode(node)) node = node.getParent();
  if (!node) return null;
  const question = node.getParent();
  if (!$isQuestionNode(question)) return null;
  const kind = question.getSettings().kind;
  return kind === "choice" || kind === "parsons" ? node : null;
}

/**
 * Marks a choice right, or a code puzzle's line as belonging nowhere in the
 * program; other kinds give the mark no meaning.
 */
export function $toggleMark(option: QuestionOptionNode) {
  const question = option.getParent();
  if (!$isQuestionNode(question)) return;
  const kind = question.getSettings().kind;
  if (kind === "choice") $toggleCorrect(option);
  if (kind === "parsons") option.setCorrect(!option.isCorrect());
}

/** A new question of a kind, with its prompt and the parts it starts with. */
export function $createQuestionNode(kind: QuestionKind): QuestionNode {
  const question = new QuestionNode(defaultSettings(kind));
  question.append(new QuestionPromptNode());
  if (kind === "choice")
    question.append(new QuestionOptionNode(), new QuestionOptionNode());
  if (kind === "ordering")
    question.append(
      new QuestionOptionNode(),
      new QuestionOptionNode(),
      new QuestionOptionNode(),
    );
  if (kind === "parsons")
    question.append(
      new QuestionOptionNode(),
      new QuestionOptionNode(),
      new QuestionOptionNode(),
    );
  // A code exercise: its starter code a line at a time, then a test.
  if (kind === "program")
    question.append(new QuestionOptionNode(), $createQuestionPair());
  if (kind === "text") question.append(new QuestionAnswerNode());
  // A formula is the answer, written as one, though LaTeX typed as words reads too.
  if (kind === "math")
    question.append(new QuestionAnswerNode().append($createMathNode()));
  if (kind === "matching")
    question.append($createQuestionPair(), $createQuestionPair());
  if (kind === "sorting")
    question.append($createQuestionGroup(), $createQuestionGroup());
  if (kind === "gaps") question.append(new QuestionPassageNode());
  if (kind === "spelling")
    question.append(new QuestionAnswerNode(), new QuestionAnswerNode());
  return question;
}

/** A project made in Python, which starts as a program of two files that already draws. */
export function $createPythonQuestion(): QuestionNode {
  const question = new QuestionNode({
    ...defaultSettings("project"),
    projectLanguage: "python",
    projectFiles: pythonProject(),
  });
  question.append(new QuestionPromptNode());
  return question;
}

/** A puzzle answered with a row of arrows or with blocks, starting as the first of its kind. */
export function $createPuzzleQuestion(style: PuzzleStyle): QuestionNode {
  const question = new QuestionNode({
    ...defaultSettings("puzzle"),
    puzzle: firstLevel(style),
  });
  question.append(new QuestionPromptNode());
  return question;
}

/** A project made for the micro:bit, which starts as the board's editor gives a new one. */
export function $createMicrobitQuestion(): QuestionNode {
  const question = new QuestionNode({
    ...defaultSettings("project"),
    projectLanguage: "microbit",
  });
  question.append(new QuestionPromptNode());
  return question;
}

/** A web project that starts as a p5.js sketch, already drawing. */
export function $createSketchQuestion(): QuestionNode {
  const question = new QuestionNode({
    ...defaultSettings("project"),
    projectFiles: sketchProject(),
  });
  question.append(new QuestionPromptNode());
  return question;
}

/**
 * A child says why they answered the question before as they did: a spoken
 * answer for the teacher to hear, worth no points, as Seesaw's young
 * activities end with "tap the mic and tell me".
 */
export function $createWhyQuestion(): QuestionNode {
  const text = labels.get($getEditor());
  const question = new QuestionNode({
    ...defaultSettings("written"),
    points: 0,
    recordSeconds: 45,
  });
  question.append(
    new QuestionPromptNode().append($createTextNode(text?.whyPrompt ?? "")),
  );
  return question;
}

/** A statement to judge: a choice between true, marked right, and false. */
export function $createTrueFalseQuestion(): QuestionNode {
  const text = labels.get($getEditor());
  const question = new QuestionNode({
    ...defaultSettings("choice"),
    shuffle: false,
  });
  question.append(
    new QuestionPromptNode(),
    new QuestionOptionNode(crypto.randomUUID(), true).append(
      $createTextNode(text?.statementTrue ?? ""),
    ),
    new QuestionOptionNode().append(
      $createTextNode(text?.statementFalse ?? ""),
    ),
  );
  return question;
}

/**
 * Keeps a question well formed whatever a paste or a merge left: a prompt
 * first, then only the parts its kind has, and parts never outside one.
 */
export function $repairQuestion(question: QuestionNode) {
  const [first] = question.getChildren();
  if (!$isQuestionPromptNode(first))
    question.splice(0, 0, [new QuestionPromptNode()]);
  const kind = question.getSettings().kind;
  for (const child of question.getChildren().slice(1)) {
    const fits =
      ((kind === "choice" ||
        kind === "ordering" ||
        kind === "parsons" ||
        kind === "program") &&
        $isQuestionOptionNode(child)) ||
      (kind === "program" && $isQuestionPairNode(child)) ||
      ((kind === "text" ||
        kind === "math" ||
        kind === "matching" ||
        kind === "spelling") &&
        $isQuestionAnswerNode(child)) ||
      (kind === "matching" && $isQuestionPairNode(child)) ||
      (kind === "sorting" && $isQuestionGroupNode(child)) ||
      (kind === "gaps" && $isQuestionPassageNode(child));
    if (fits) continue;
    const paragraph = $createParagraphNode();
    if ($isElementNode(child)) paragraph.append(...child.getChildren());
    question.insertAfter(paragraph);
    child.remove();
  }
}

/** A prompt or part found outside its place reads as a paragraph. */
export function $unwrapStrayPart(node: ElementNode) {
  const parent = node.getParent();
  if ($isQuestionNode(parent)) return;
  if ($isQuestionOptionNode(node) && $isQuestionGroupNode(parent)) return;
  if (
    $isQuestionSideNode(node) &&
    ($isQuestionPairNode(parent) || $isQuestionGroupNode(parent))
  )
    return;
  node.replace($createParagraphNode().append(...node.getChildren()));
}

/** A pair keeps exactly two sides; a group its name first, then items. */
export function $repairHolder(holder: ElementNode) {
  if (!$isQuestionNode(holder.getParent())) {
    for (const child of holder.getChildren())
      holder.insertBefore(
        $isElementNode(child)
          ? $createParagraphNode().append(...child.getChildren())
          : child,
      );
    holder.remove();
    return;
  }
  if ($isQuestionPairNode(holder)) {
    const sides = holder.getChildren().filter($isQuestionSideNode);
    while (sides.length < 2) {
      const side = new QuestionSideNode();
      holder.append(side);
      sides.push(side);
    }
    for (const child of holder.getChildren())
      if (!sides.slice(0, 2).includes(child as QuestionSideNode))
        child.remove();
    return;
  }
  if (!$isQuestionSideNode(holder.getFirstChild()))
    holder.splice(0, 0, [new QuestionSideNode()]);
  for (const child of holder.getChildren().slice(1))
    if (!$isQuestionOptionNode(child)) child.remove();
}

/**
 * Whether a part may show a picture: an option or item, a side of a pair, or
 * an extra answer in a matching question; not a typed answer or a group's
 * name.
 */
export function $holdsPicture(node: LexicalNode): boolean {
  if (node instanceof QuestionOptionNode) return true;
  if (node instanceof QuestionSideNode)
    return node.getParent() instanceof QuestionPairNode;
  if (node instanceof QuestionAnswerNode) {
    const question = node.getParent();
    return (
      $isQuestionNode(question) && question.getSettings().kind === "matching"
    );
  }
  return false;
}

/**
 * Where a part sits, by ids that outlive the editor: an option or extra
 * answer by its own id, a side of a pair by the pair's id and its place.
 * A node key would not do, as a new lesson's editor starts again once the
 * lesson is first saved.
 */
export type PartAddress =
  | { kind: "id"; id: string }
  | { kind: "side"; pairId: string; index: number }
  | { kind: "question"; questionId: string };

export function $partAddress(node: LexicalNode): PartAddress | null {
  if (node instanceof QuestionOptionNode || node instanceof QuestionAnswerNode)
    return { kind: "id", id: node.getOptionId() };
  if (node instanceof QuestionNode)
    return { kind: "question", questionId: node.getSettings().questionId };
  const pair = node.getParent();
  if (node instanceof QuestionSideNode && pair instanceof QuestionPairNode)
    return {
      kind: "side",
      pairId: pair.getOptionId(),
      index: node.getIndexWithinParent(),
    };
  return null;
}

export function $findPart(address: PartAddress): LexicalNode | null {
  const pending: LexicalNode[] = [...$getRoot().getChildren()];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (
      address.kind === "id" &&
      (node instanceof QuestionOptionNode ||
        node instanceof QuestionAnswerNode) &&
      node.getOptionId() === address.id
    )
      return node;
    if (
      address.kind === "side" &&
      node instanceof QuestionPairNode &&
      node.getOptionId() === address.pairId
    )
      return node.getChildAtIndex(address.index);
    if (
      address.kind === "question" &&
      node instanceof QuestionNode &&
      node.getSettings().questionId === address.questionId
    )
      return node;
    if ($isElementNode(node)) pending.push(...node.getChildren());
  }
  return null;
}

/** Questions whose lines are code: a puzzle's, or an exercise's starter. */
const codeKinds = new Set<QuestionKind>(["parsons", "program"]);

/**
 * Enter in a line of code starts the next line as far indented as the text
 * before the caret, as in a code editor. A line of only spaces is emptied
 * instead, so Enter on it can still leave the puzzle, and in an exercise
 * moves on to its first test.
 */
export function $newCodeLine(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchor = selection.anchor.getNode();
  const line = $isQuestionOptionNode(anchor)
    ? anchor
    : anchor.getParents().find($isQuestionOptionNode);
  const question = line?.getParent();
  if (
    !line ||
    !$isQuestionNode(question) ||
    !codeKinds.has(question.getSettings().kind)
  )
    return false;
  if (!line.getTextContent().trim()) {
    // Only blank lines left before the tests: the starter is written.
    const after = line.getNextSiblings();
    const test = after.find($isQuestionPairNode);
    const rest = after.slice(0, test ? after.indexOf(test) : 0);
    if (test && rest.every((part) => !part.getTextContent().trim())) {
      for (const blank of rest) blank.remove();
      if ($isQuestionOptionNode(line.getPreviousSibling())) line.remove();
      test.getFirstChild()?.selectStart();
      return true;
    }
    line.clear();
    line.selectStart();
    return false;
  }
  const before = anchor.is(line.getFirstDescendant())
    ? anchor.getTextContent().slice(0, selection.anchor.offset)
    : line.getTextContent();
  const lead = /^[\t ]*/.exec(before)?.[0] ?? "";
  const next = selection.insertParagraph();
  if (!next || !lead) return true;
  const indent = $createTextNode(lead);
  const first = next.getFirstChild();
  if (first) first.insertBefore(indent);
  else next.append(indent);
  indent.select(lead.length, lead.length);
  return true;
}

/** How far Tab moves a line of a code puzzle: one level of indentation. */
const INDENT = "    ";

/**
 * Tab and Shift+Tab indent and outdent the line of a code puzzle the caret
 * is in, as in a code editor; anywhere else Tab keeps its usual meaning.
 */
export function $indentCodeLine(event: KeyboardEvent | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const anchor = selection.anchor.getNode();
  const line = $isQuestionOptionNode(anchor)
    ? anchor
    : anchor.getParents().find($isQuestionOptionNode);
  const question = line?.getParent();
  if (
    !line ||
    !$isQuestionNode(question) ||
    !codeKinds.has(question.getSettings().kind)
  )
    return false;
  event?.preventDefault();
  const first = line.getFirstDescendant();
  const text = $isTextNode(first) ? first : null;
  const caret = selection.anchor.offset;
  if (event?.shiftKey) {
    const lead = /^ {1,4}/.exec(text?.getTextContent() ?? "")?.[0].length ?? 0;
    if (!text || lead === 0) return true;
    text.spliceText(0, lead, "", false);
    if (selection.anchor.key === text.getKey())
      text.select(Math.max(0, caret - lead), Math.max(0, caret - lead));
    return true;
  }
  if (!text) {
    const added = $createTextNode(INDENT);
    line.append(added);
    added.select(INDENT.length, INDENT.length);
    return true;
  }
  text.spliceText(0, 0, INDENT, false);
  if (selection.anchor.key === text.getKey())
    text.select(caret + INDENT.length, caret + INDENT.length);
  return true;
}
