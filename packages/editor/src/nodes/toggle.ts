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
  isHTMLElement,
} from "lexical";

export type SerializedToggleNode = Spread<
  { open: boolean },
  SerializedElementNode
>;

function theme(config: EditorConfig, name: string): string | undefined {
  const value: unknown = config.theme[name];
  return typeof value === "string" ? value : undefined;
}

function syncOpen(dom: HTMLElement, open: boolean) {
  dom.dataset.open = String(open);
  const title = dom.querySelector(":scope > [data-toggle-title]");
  const content = dom.querySelector(":scope > [data-toggle-content]");
  if (isHTMLElement(title)) title.setAttribute("aria-expanded", String(open));
  if (isHTMLElement(content)) content.hidden = !open;
}

export class ToggleNode extends ElementNode {
  __open: boolean;

  constructor(open = true, key?: NodeKey) {
    super(key);
    this.__open = open;
  }

  $config() {
    return this.config("toggle", { extends: ElementNode });
  }

  static clone(node: ToggleNode): ToggleNode {
    return new ToggleNode(node.__open, node.__key);
  }

  static importJSON(json: SerializedToggleNode): ToggleNode {
    return $createToggleNode(json.open).updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedToggleNode>): this {
    return super.updateFromJSON(json).setOpen(json.open);
  }

  exportJSON(): SerializedToggleNode {
    return { ...super.exportJSON(), open: this.getOpen() };
  }

  exportDOM(): DOMExportOutput {
    const element = $getDocument().createElement("details");
    if (this.getOpen()) element.setAttribute("open", "");
    return { element };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("div");
    const name = theme(config, "toggle");
    if (name) addClassNamesToElement(dom, name);
    dom.dataset.open = String(this.__open);
    return dom;
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
    if (previous.__open !== this.__open) syncOpen(dom, this.__open);
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  collapseAtStart(): boolean {
    const nodes: LexicalNode[] = [];
    const [title, content] = this.getChildren();
    if ($isElementNode(title))
      nodes.push($createParagraphNode().append(...title.getChildren()));
    if ($isElementNode(content)) nodes.push(...content.getChildren());
    for (const node of nodes) this.insertBefore(node);
    this.remove();
    nodes[0]?.selectStart();
    return true;
  }

  getOpen(): boolean {
    return this.getLatest().__open;
  }

  setOpen(open: boolean): this {
    const writable = this.getWritable();
    writable.__open = open;
    return writable;
  }

  toggleOpen(): this {
    return this.setOpen(!this.getOpen());
  }
}

export class ToggleTitleNode extends ElementNode {
  $config() {
    return this.config("toggle-title", { extends: ElementNode });
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    dom.dataset.toggleTitle = "";
    const name = theme(config, "toggleTitle");
    if (name) addClassNamesToElement(dom, name);
    const parent = this.getParent();
    dom.setAttribute(
      "aria-expanded",
      String($isToggleNode(parent) ? parent.getOpen() : true),
    );
    dom.addEventListener("click", (event) => {
      const rect = dom.getBoundingClientRect();
      const rtl = getComputedStyle(dom).direction === "rtl";
      const edge = rtl ? rect.right - event.clientX : event.clientX - rect.left;
      if (edge > 28) return;
      event.preventDefault();
      editor.update(() => {
        const toggle = this.getLatest().getParent();
        if ($isToggleNode(toggle)) toggle.toggleOpen();
      });
    });
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): ElementNode {
    const toggle = this.getParent();
    if (!$isToggleNode(toggle)) return $createParagraphNode();
    if (toggle.getOpen()) {
      const content = this.getNextSibling();
      const first = $isElementNode(content) ? content.getFirstChild() : null;
      if ($isElementNode(first)) return first;
      const paragraph = $createParagraphNode();
      if ($isElementNode(content)) content.append(paragraph);
      return paragraph;
    }
    const paragraph = $createParagraphNode();
    toggle.insertAfter(paragraph, restoreSelection);
    return paragraph;
  }

  collapseAtStart(): boolean {
    const toggle = this.getParent();
    return $isToggleNode(toggle) ? toggle.collapseAtStart() : false;
  }
}

export class ToggleContentNode extends ElementNode {
  $config() {
    return this.config("toggle-content", { extends: ElementNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("div");
    dom.dataset.toggleContent = "";
    const name = theme(config, "toggleContent");
    if (name) addClassNamesToElement(dom, name);
    const parent = this.getParent();
    dom.hidden = $isToggleNode(parent) ? !parent.getOpen() : false;
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }
}

export function $createToggleNode(open = true): ToggleNode {
  return new ToggleNode(open);
}

export function $createToggleTitleNode(): ToggleTitleNode {
  return new ToggleTitleNode();
}

export function $createToggleContentNode(): ToggleContentNode {
  return new ToggleContentNode();
}

export function $isToggleNode(
  node: LexicalNode | null | undefined,
): node is ToggleNode {
  return node instanceof ToggleNode;
}

export function $isToggleTitleNode(
  node: LexicalNode | null | undefined,
): node is ToggleTitleNode {
  return node instanceof ToggleTitleNode;
}

export function $isToggleContentNode(
  node: LexicalNode | null | undefined,
): node is ToggleContentNode {
  return node instanceof ToggleContentNode;
}
