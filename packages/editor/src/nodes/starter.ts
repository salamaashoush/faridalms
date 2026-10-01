import type { EditorConfig, LexicalEditor, LexicalNode } from "lexical";

import { addClassNamesToElement } from "@lexical/utils";
import { $getDocument, ElementNode } from "lexical";

const labels = new WeakMap<LexicalEditor, string>();

export function setStarterLabel(editor: LexicalEditor, label: string) {
  labels.set(editor, label);
}

/**
 * The part of a brief each student gets a copy of to work in, such as a
 * worksheet to fill: students meet it in their own answer, not in the brief.
 */
export class StarterNode extends ElementNode {
  $config() {
    return this.config("starter", { extends: ElementNode });
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = $getDocument().createElement("div");
    dom.dataset.starter = "";
    dom.dataset.label = labels.get(editor) ?? "";
    const theme: unknown = config.theme.starter;
    if (typeof theme === "string") addClassNamesToElement(dom, theme);
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
    const children = this.getChildren();
    for (const child of children) this.insertBefore(child);
    this.remove();
    children[0]?.selectStart();
    return true;
  }
}

export function $isStarterNode(
  node: LexicalNode | null | undefined,
): node is StarterNode {
  return node instanceof StarterNode;
}
