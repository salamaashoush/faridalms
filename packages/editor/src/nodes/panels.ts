import type { PanelLayout } from "@faridalms/domain/content";
import type {
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
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

export type SerializedPanelsNode = Spread<
  { layout: PanelLayout },
  SerializedElementNode
>;

function theme(config: EditorConfig, name: string): string | undefined {
  const value: unknown = config.theme[name];
  return typeof value === "string" ? value : undefined;
}

/**
 * A set of titled parts that reads as tabs, steps, a timeline or cards to
 * turn over. The parts are written one after another whatever the layout,
 * so changing it loses nothing.
 */
export class PanelsNode extends ElementNode {
  __layout: PanelLayout;

  constructor(layout: PanelLayout = "tabs", key?: NodeKey) {
    super(key);
    this.__layout = layout;
  }

  $config() {
    return this.config("panels", { extends: ElementNode });
  }

  static clone(node: PanelsNode): PanelsNode {
    return new PanelsNode(node.__layout, node.__key);
  }

  static importJSON(json: SerializedPanelsNode): PanelsNode {
    return $createPanelsNode(json.layout).updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedPanelsNode>): this {
    return super.updateFromJSON(json).setLayout(json.layout);
  }

  exportJSON(): SerializedPanelsNode {
    return { ...super.exportJSON(), layout: this.getLayout() };
  }

  exportDOM(): DOMExportOutput {
    return { element: $getDocument().createElement("section") };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("div");
    const name = theme(config, "panels");
    if (name) addClassNamesToElement(dom, name);
    dom.dataset.layout = this.__layout;
    return dom;
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
    if (previous.__layout !== this.__layout) dom.dataset.layout = this.__layout;
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  /** Unwraps the set into its titles and bodies as plain blocks. */
  collapseAtStart(): boolean {
    const nodes: LexicalNode[] = [];
    for (const panel of this.getChildren()) {
      if (!$isElementNode(panel)) continue;
      const [title, body] = panel.getChildren();
      if ($isElementNode(title) && !title.isEmpty())
        nodes.push($createParagraphNode().append(...title.getChildren()));
      if ($isElementNode(body)) nodes.push(...body.getChildren());
    }
    if (nodes.length === 0) nodes.push($createParagraphNode());
    for (const node of nodes) this.insertBefore(node);
    this.remove();
    const first = nodes[0];
    if ($isElementNode(first)) first.selectStart();
    return true;
  }

  getLayout(): PanelLayout {
    return this.getLatest().__layout;
  }

  setLayout(layout: PanelLayout): this {
    const writable = this.getWritable();
    writable.__layout = layout;
    return writable;
  }
}

/** One tab, step, event or card: a title and what it holds. */
export class PanelNode extends ElementNode {
  $config() {
    return this.config("panel", { extends: ElementNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("div");
    const name = theme(config, "panel");
    if (name) addClassNamesToElement(dom, name);
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

export class PanelTitleNode extends ElementNode {
  $config() {
    return this.config("panel-title", { extends: ElementNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("div");
    const name = theme(config, "panelTitle");
    if (name) addClassNamesToElement(dom, name);
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  /**
   * Backspace at the start of a title: an empty part goes, the caret moving
   * to the end of the one before; the first part unwraps a set of one.
   */
  collapseAtStart(): boolean {
    const panel = this.getParent();
    const panels = panel?.getParent();
    if (!$isPanelNode(panel) || !$isPanelsNode(panels)) return false;
    const previous = panel.getPreviousSibling();
    if (!$isPanelNode(previous))
      return panels.getChildrenSize() === 1 ? panels.collapseAtStart() : true;
    if (panel.getTextContent().trim() === "") panel.remove();
    const body = previous.getLastChild();
    if ($isElementNode(body)) body.selectEnd();
    return true;
  }
}

export class PanelBodyNode extends ElementNode {
  $config() {
    return this.config("panel-body", { extends: ElementNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("div");
    const name = theme(config, "panelBody");
    if (name) addClassNamesToElement(dom, name);
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

export function $createPanelsNode(layout: PanelLayout = "tabs"): PanelsNode {
  return new PanelsNode(layout);
}

/** A part with an empty title and an empty line to write in. */
export function $createPanel(): PanelNode {
  return new PanelNode().append(
    new PanelTitleNode(),
    new PanelBodyNode().append($createParagraphNode()),
  );
}

export function $createPanelTitleNode(): PanelTitleNode {
  return new PanelTitleNode();
}

export function $createPanelBodyNode(): PanelBodyNode {
  return new PanelBodyNode();
}

export function $isPanelsNode(
  node: LexicalNode | null | undefined,
): node is PanelsNode {
  return node instanceof PanelsNode;
}

export function $isPanelNode(
  node: LexicalNode | null | undefined,
): node is PanelNode {
  return node instanceof PanelNode;
}

export function $isPanelTitleNode(
  node: LexicalNode | null | undefined,
): node is PanelTitleNode {
  return node instanceof PanelTitleNode;
}

export function $isPanelBodyNode(
  node: LexicalNode | null | undefined,
): node is PanelBodyNode {
  return node instanceof PanelBodyNode;
}
