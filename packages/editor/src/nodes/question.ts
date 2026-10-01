import type { QuestionKind } from "@faridalms/domain/content";
import type {
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  RangeSelection,
  SerializedElementNode,
  Spread,
} from "lexical";

import { addClassNamesToElement } from "@lexical/utils";
import {
  $createParagraphNode,
  $getDocument,
  $isElementNode,
  ElementNode,
} from "lexical";

/** What a question's chrome says, set by the editor for its language. */
export interface QuestionLabels {
  kinds: Record<QuestionKind, string>;
  points: (points: number) => string;
  answerIs: string;
  prompt: string;
  option: string;
  answer: string;
  accepted: string;
}

const labels = new WeakMap<LexicalEditor, QuestionLabels>();

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
  multiple: boolean;
  shuffle: boolean;
  caseSensitive: boolean;
  closeEnough: boolean;
  tehMarbuta: boolean;
  wordLimit: number | null;
  hint: string;
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
    points: kind === "written" ? 2 : 1,
    tries: null,
    multiple: false,
    shuffle: kind === "choice",
    caseSensitive: false,
    closeEnough: false,
    tehMarbuta: true,
    wordLimit: null,
    hint: "",
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

export type SerializedQuestionNode = Spread<
  Partial<QuestionSettings>,
  SerializedElementNode
>;

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
  return `${text.kinds[settings.kind]} · ${text.points(settings.points)}`;
}

/**
 * A question in the text: its prompt and parts are child nodes, so their
 * words are edited, formatted and merged in live editing like any text,
 * and its settings ride on the node itself.
 */
export class QuestionNode extends ElementNode {
  __settings: QuestionSettings;

  constructor(settings?: Partial<QuestionSettings>, key?: NodeKey) {
    super(key);
    this.__settings = {
      ...defaultSettings(settings?.kind ?? "choice"),
      ...settings,
    };
  }

  $config() {
    return this.config("question", { extends: ElementNode });
  }

  static clone(node: QuestionNode): QuestionNode {
    return new QuestionNode({ ...node.__settings }, node.__key);
  }

  static importJSON(json: SerializedQuestionNode): QuestionNode {
    return new QuestionNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedQuestionNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    const base = defaultSettings(json.kind ?? "choice");
    node.__settings = {
      kind: json.kind ?? base.kind,
      questionId: json.questionId ?? base.questionId,
      points: json.points ?? base.points,
      tries: json.tries ?? null,
      multiple: json.multiple ?? base.multiple,
      shuffle: json.shuffle ?? base.shuffle,
      caseSensitive: json.caseSensitive ?? base.caseSensitive,
      closeEnough: json.closeEnough ?? base.closeEnough,
      tehMarbuta: json.tehMarbuta ?? base.tehMarbuta,
      wordLimit: json.wordLimit ?? null,
      hint: json.hint ?? "",
      explanation: json.explanation ?? "",
      numberMode: json.numberMode ?? base.numberMode,
      answerValue: json.answerValue ?? base.answerValue,
      tolerance: json.tolerance ?? base.tolerance,
      percent: json.percent ?? base.percent,
      rangeMin: json.rangeMin ?? base.rangeMin,
      rangeMax: json.rangeMax ?? base.rangeMax,
      scoring: json.scoring ?? base.scoring,
    };
    return node;
  }

  exportJSON(): SerializedQuestionNode {
    return { ...super.exportJSON(), ...this.getLatest().__settings };
  }

  exportDOM(): DOMExportOutput {
    return { element: $getDocument().createElement("div") };
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    const name = theme(config, "question");
    if (name) addClassNamesToElement(dom, name);
    dom.dataset.question = "";
    dom.dataset.kind = this.__settings.kind;
    dom.dataset.multiple = String(this.__settings.multiple);
    dom.dataset.label = label(editor, this.__settings);
    if (this.__settings.kind === "number")
      dom.dataset.answer = `${labels.get(editor)?.answerIs ?? ""} ${numberAnswer(this.__settings)}`;
    return dom;
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
    const settings = this.__settings;
    // The label carries the kind and points in words, drawn anew.
    if (
      previous.__settings.kind !== settings.kind ||
      previous.__settings.points !== settings.points ||
      numberAnswer(previous.__settings) !== numberAnswer(settings)
    )
      return true;
    if (previous.__settings.multiple !== settings.multiple)
      dom.dataset.multiple = String(settings.multiple);
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  getSettings(): QuestionSettings {
    return this.getLatest().__settings;
  }

  setSettings(patch: Partial<QuestionSettings>): this {
    const writable = this.getWritable();
    writable.__settings = { ...writable.__settings, ...patch };
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
    dom.dataset.placeholder = labels.get(editor)?.prompt ?? "";
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

/** Backspace at a part's start goes back to the line above, never merging. */
function $collapsePart(part: ElementNode): boolean {
  const previous = part.getPreviousSibling();
  if (part.isEmpty()) part.remove();
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
    return this.config("question-option", { extends: ElementNode });
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
    dom.dataset.placeholder = labels.get(editor)?.option ?? "";
    dom.setAttribute("aria-checked", String(this.__correct));
    const name = theme(config, "questionOption");
    if (name) addClassNamesToElement(dom, name);
    // The marker is drawn in the padding at the start; a click there marks
    // the option right, the way a checklist item is ticked.
    dom.addEventListener("click", (event) => {
      const rect = dom.getBoundingClientRect();
      const rtl = getComputedStyle(dom).direction === "rtl";
      const edge = rtl ? rect.right - event.clientX : event.clientX - rect.left;
      if (edge > 30 || !editor.isEditable()) return;
      event.preventDefault();
      editor.update(() => {
        const option = this.getLatest();
        const question = option.getParent();
        if (
          $isQuestionNode(question) &&
          question.getSettings().kind === "choice"
        )
          $toggleCorrect(option);
      });
    });
    return dom;
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
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

/** A typed answer that counts as right. */
export class QuestionAnswerNode extends ElementNode {
  $config() {
    return this.config("question-answer", { extends: ElementNode });
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): ElementNode {
    return $partAfter(this, new QuestionAnswerNode(), restoreSelection);
  }

  collapseAtStart(): boolean {
    return $collapsePart(this);
  }

  updateDOM(): boolean {
    return false;
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    dom.dataset.questionAnswer = "";
    dom.dataset.placeholder = labels.get(editor)?.answer ?? "";
    dom.dataset.label = labels.get(editor)?.accepted ?? "";
    const name = theme(config, "questionAnswer");
    if (name) addClassNamesToElement(dom, name);
    return dom;
  }
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
  if (kind === "text") question.append(new QuestionAnswerNode());
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
      ((kind === "choice" || kind === "ordering") &&
        $isQuestionOptionNode(child)) ||
      (kind === "text" && $isQuestionAnswerNode(child));
    if (fits) continue;
    const paragraph = $createParagraphNode();
    if ($isElementNode(child)) paragraph.append(...child.getChildren());
    question.insertAfter(paragraph);
    child.remove();
  }
}

/** A prompt or part found outside a question reads as a paragraph. */
export function $unwrapStrayPart(node: ElementNode) {
  if ($isQuestionNode(node.getParent())) return;
  node.replace($createParagraphNode().append(...node.getChildren()));
}
