import type { CalloutTone } from "@faridalms/domain/content";
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedElementNode,
  Spread,
} from "lexical";

import { calloutTones } from "@faridalms/domain/content";
import { addClassNamesToElement } from "@lexical/utils";
import { $getDocument, ElementNode } from "lexical";

export type SerializedCalloutNode = Spread<
  { tone: CalloutTone },
  SerializedElementNode
>;

export class CalloutNode extends ElementNode {
  __tone: CalloutTone;

  constructor(tone: CalloutTone = "info", key?: NodeKey) {
    super(key);
    this.__tone = tone;
  }

  $config() {
    return this.config("callout", { extends: ElementNode });
  }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__tone, node.__key);
  }

  static importJSON(json: SerializedCalloutNode): CalloutNode {
    return $createCalloutNode().updateFromJSON(json);
  }

  static importDOM(): DOMConversionMap {
    return {
      aside: (element) =>
        element.hasAttribute("data-callout")
          ? {
              conversion: () => {
                const tone = element.getAttribute("data-callout");
                return {
                  node: $createCalloutNode(
                    calloutTones.find((value) => value === tone) ?? "info",
                  ),
                };
              },
              priority: 1,
            }
          : null,
    };
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedCalloutNode>): this {
    return super.updateFromJSON(json).setTone(json.tone);
  }

  exportJSON(): SerializedCalloutNode {
    return { ...super.exportJSON(), tone: this.getTone() };
  }

  exportDOM(): DOMExportOutput {
    const element = $getDocument().createElement("aside");
    element.setAttribute("data-callout", this.getTone());
    return { element };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement("aside");
    dom.dataset.tone = this.__tone;
    const theme: unknown = config.theme.callout;
    if (typeof theme === "string") addClassNamesToElement(dom, theme);
    return dom;
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
    if (previous.__tone !== this.__tone) dom.dataset.tone = this.__tone;
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

  getTone(): CalloutTone {
    return this.getLatest().__tone;
  }

  setTone(tone: CalloutTone): this {
    const writable = this.getWritable();
    writable.__tone = tone;
    return writable;
  }
}

export function $createCalloutNode(tone: CalloutTone = "info"): CalloutNode {
  return new CalloutNode(tone);
}

export function $isCalloutNode(
  node: LexicalNode | null | undefined,
): node is CalloutNode {
  return node instanceof CalloutNode;
}
