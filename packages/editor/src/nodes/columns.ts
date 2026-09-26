import type { ColumnLayout } from "@faridalms/domain/content";
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
import { $getDocument, $isParagraphNode, ElementNode } from "lexical";

export type SerializedColumnsNode = Spread<
  { layout: ColumnLayout },
  SerializedElementNode
>;

export function columnCount(layout: ColumnLayout): number {
  return layout.split(":").length;
}

function template(layout: ColumnLayout): string {
  return layout
    .split(":")
    .map((part) => `minmax(0,${part}fr)`)
    .join(" ");
}

export class ColumnsNode extends ElementNode {
  __layout: ColumnLayout;

  constructor(layout: ColumnLayout = "1:1", key?: NodeKey) {
    super(key);
    this.__layout = layout;
  }

  $config() {
    return this.config("columns", { extends: ElementNode });
  }

  static clone(node: ColumnsNode): ColumnsNode {
    return new ColumnsNode(node.__layout, node.__key);
  }

  static importJSON(json: SerializedColumnsNode): ColumnsNode {
    return $createColumnsNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedColumnsNode>): this {
    return super.updateFromJSON(json).setLayout(json.layout);
  }

  exportJSON(): SerializedColumnsNode {
    return { ...super.exportJSON(), layout: this.getLayout() };
  }

  exportDOM(): DOMExportOutput {
    const element = $getDocument().createElement("div");
    element.style.display = "grid";
    element.style.gridTemplateColumns = template(this.getLayout());
    return { element };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("div");
    dom.style.setProperty("--columns", template(this.__layout));
    const name: unknown = config.theme.columns;
    if (typeof name === "string") addClassNamesToElement(dom, name);
    return dom;
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
    if (previous.__layout !== this.__layout)
      dom.style.setProperty("--columns", template(this.__layout));
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  getLayout(): ColumnLayout {
    return this.getLatest().__layout;
  }

  setLayout(layout: ColumnLayout): this {
    const writable = this.getWritable();
    writable.__layout = layout;
    return writable;
  }
}

export class ColumnNode extends ElementNode {
  $config() {
    return this.config("column", { extends: ElementNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("div");
    const name: unknown = config.theme.column;
    if (typeof name === "string") addClassNamesToElement(dom, name);
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

  collapseAtStart(): boolean {
    const columns = this.getParent();
    if (
      $isColumnsNode(columns) &&
      this.is(columns.getFirstChild()) &&
      columns.getChildren().every($isEmptyColumn)
    ) {
      columns.remove();
      return true;
    }
    return false;
  }
}

export function $isEmptyColumn(node: LexicalNode): boolean {
  if (!$isColumnNode(node) || node.getChildrenSize() !== 1) return false;
  const first = node.getFirstChild();
  return $isParagraphNode(first) && first.isEmpty();
}

export function $createColumnsNode(layout: ColumnLayout = "1:1"): ColumnsNode {
  return new ColumnsNode(layout);
}

export function $createColumnNode(): ColumnNode {
  return new ColumnNode();
}

export function $isColumnsNode(
  node: LexicalNode | null | undefined,
): node is ColumnsNode {
  return node instanceof ColumnsNode;
}

export function $isColumnNode(
  node: LexicalNode | null | undefined,
): node is ColumnNode {
  return node instanceof ColumnNode;
}
