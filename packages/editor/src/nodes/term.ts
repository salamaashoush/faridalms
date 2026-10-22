import type { GlossaryEntry } from "@faridalms/domain/glossary";
import type {
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedElementNode,
  Spread,
  TextNode,
} from "lexical";

import { termKey } from "@faridalms/domain/glossary";
import { $isListItemNode } from "@lexical/list";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $dfs } from "@lexical/utils";
import {
  $getDocument,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  ElementNode,
} from "lexical";

export type SerializedTermNode = Spread<
  { definition: string; gloss?: string; fileId?: string; alt?: string },
  SerializedElementNode
>;

/** What a term says beyond its words: its meaning, and its gloss and picture. */
export type TermFacts = Omit<GlossaryEntry, "words">;

/**
 * Words a document defines, which a reader opens in place to see what they
 * mean, in another language too and with a picture where the teacher gave
 * them. The words stay text, written and found as any other.
 */
export class TermNode extends ElementNode {
  __definition: string;
  __gloss: string;
  __fileId: string;
  __alt: string;

  constructor(facts: TermFacts = { definition: "" }, key?: NodeKey) {
    super(key);
    this.__definition = facts.definition;
    this.__gloss = facts.gloss ?? "";
    this.__fileId = facts.fileId ?? "";
    this.__alt = facts.alt ?? "";
  }

  $config() {
    return this.config("term", { extends: ElementNode });
  }

  static clone(node: TermNode): TermNode {
    return new TermNode(node.getFacts(), node.__key);
  }

  static importJSON(json: SerializedTermNode): TermNode {
    return new TermNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedTermNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__definition = json.definition;
    node.__gloss = json.gloss ?? "";
    node.__fileId = json.fileId ?? "";
    node.__alt = json.alt ?? "";
    return node;
  }

  exportJSON(): SerializedTermNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      definition: node.__definition,
      ...(node.__gloss ? { gloss: node.__gloss } : {}),
      ...(node.__fileId ? { fileId: node.__fileId, alt: node.__alt } : {}),
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("span");
    dom.className = "fe-term";
    if (this.__definition) dom.title = this.__definition;
    return dom;
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
    if (previous.__definition !== this.__definition)
      dom.title = this.__definition;
    return false;
  }

  isInline(): true {
    return true;
  }

  canBeEmpty(): false {
    return false;
  }

  // Typing at either edge writes the line's text; a term grows only when chosen again.
  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }

  getFacts(): TermFacts {
    const node = this.getLatest();
    return {
      definition: node.__definition,
      ...(node.__gloss ? { gloss: node.__gloss } : {}),
      ...(node.__fileId ? { fileId: node.__fileId, alt: node.__alt } : {}),
    };
  }

  setFacts(facts: Partial<TermFacts>): this {
    const writable = this.getWritable();
    if (facts.definition !== undefined)
      writable.__definition = facts.definition;
    if (facts.gloss !== undefined) writable.__gloss = facts.gloss;
    if (facts.fileId !== undefined) writable.__fileId = facts.fileId;
    if (facts.alt !== undefined) writable.__alt = facts.alt;
    return writable;
  }

  /** Leaves the words as plain text in the line. */
  unwrap() {
    for (const child of this.getChildren()) this.insertBefore(child);
    this.remove();
  }
}

export function $isTermNode(
  node: LexicalNode | null | undefined,
): node is TermNode {
  return node instanceof TermNode;
}

/** The term a node stands in, if any. */
export function $termOf(node: LexicalNode | null | undefined): TermNode | null {
  for (let current = node ?? null; current; current = current.getParent())
    if ($isTermNode(current)) return current;
  return null;
}

/** Every term in the document, in reading order, as glossary entries. */
export function $documentTerms(): GlossaryEntry[] {
  const found: GlossaryEntry[] = [];
  for (const { node } of $dfs())
    if ($isTermNode(node))
      found.push({ words: node.getTextContent().trim(), ...node.getFacts() });
  return found;
}

/** Running text, where a term may stand: not a link, a title or a question's part. */
const $holdsTerms = (node: LexicalNode | null): node is ElementNode =>
  $isParagraphNode(node) ||
  $isHeadingNode(node) ||
  $isQuoteNode(node) ||
  $isListItemNode(node);

/** What the same words were defined as elsewhere in the document, to start from. */
function $definedBefore(words: string): TermFacts | null {
  const key = termKey(words);
  for (const { node } of $dfs())
    if (
      $isTermNode(node) &&
      node.getFacts().definition &&
      termKey(node.getTextContent()) === key
    )
      return node.getFacts();
  return null;
}

/**
 * Makes the selected words a term, or finds the term the selection is in.
 * Only words in one line become a term, without the spaces at their edges;
 * words already defined elsewhere in the document start defined the same.
 */
export function $defineSelection(): TermNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const within =
    $termOf(selection.anchor.getNode()) ?? $termOf(selection.focus.getNode());
  if (within) return within;
  if (selection.isCollapsed()) return null;
  const parent = selection.anchor.getNode().getParent();
  if (!$holdsTerms(parent)) return null;
  let run: TextNode[] = [];
  for (const node of selection.extract()) {
    if (!$isTextNode(node) || !parent.is(node.getParent())) continue;
    // A mention or a footnote between the words ends the term before it.
    const previous = run.at(-1);
    if (previous && !previous.getNextSibling()?.is(node)) break;
    run.push(node);
  }
  const first = run[0];
  if (first) {
    const lead = first.getTextContent().length;
    const kept = first.getTextContent().trimStart().length;
    if (kept === 0) run = run.slice(1);
    else if (kept < lead) run[0] = first.splitText(lead - kept)[1] ?? first;
  }
  const last = run.at(-1);
  if (last) {
    const text = last.getTextContent();
    const kept = text.trimEnd().length;
    if (kept === 0) run = run.slice(0, -1);
    else if (kept < text.length)
      run[run.length - 1] = last.splitText(kept)[0] ?? last;
  }
  const start = run[0];
  if (!start) return null;
  const words = run.map((node) => node.getTextContent()).join("");
  const term = new TermNode($definedBefore(words) ?? { definition: "" });
  start.insertBefore(term);
  term.append(...run);
  term.select(0, term.getChildrenSize());
  return term;
}
