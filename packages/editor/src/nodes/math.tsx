import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";

import { mathText } from "@faridalms/domain/content";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import {
  $createNodeSelection,
  $getDocument,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
} from "lexical";
import { useEffect, useRef } from "react";

import { useEditorEnvironment } from "../context";
import { MathText } from "../math";
import { cx } from "../ui";

export type SerializedMathNode = Spread<
  { latex: string; block?: boolean; direction?: "rtl" | null },
  SerializedLexicalNode
>;

const TEX = 'annotation[encoding="application/x-tex"]';

function MathChip({
  nodeKey,
  latex,
  block,
  rtl,
}: {
  nodeKey: NodeKey;
  latex: string;
  block: boolean;
  rtl: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [selected, select, clear] = useLexicalNodeSelection(nodeKey);
  const chip = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      editor.registerCommand(
        CLICK_COMMAND,
        (event) => {
          if (
            !editor.isEditable() ||
            !(event.target instanceof Node) ||
            !chip.current?.contains(event.target)
          )
            return false;
          if (!event.shiftKey) clear();
          select(true);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, select, clear],
  );
  return (
    <span
      ref={chip}
      data-math-node=""
      data-selected={selected || undefined}
      className={cx(
        "fe-math-chip",
        block && "fe-math-chip-block",
        editor.isEditable() && "cursor-pointer",
      )}
    >
      {latex.trim() ? (
        <MathText latex={latex} display={block} rtl={rtl} />
      ) : (
        <span className="fe-math-empty">{strings.mathEmpty}</span>
      )}
    </span>
  );
}

/**
 * Mathematics in the text, written in LaTeX and drawn as MathML: within a
 * line, or on a line of its own. It is one piece in the text, edited from
 * the floating bar, so the caret steps over it as it does over a word.
 */
export class MathNode extends DecoratorNode<JSX.Element> {
  __latex: string;
  __block: boolean;
  __rtl: boolean;

  constructor(latex = "", block = false, rtl = false, key?: NodeKey) {
    super(key);
    this.__latex = latex;
    this.__block = block;
    this.__rtl = rtl;
  }

  $config() {
    return this.config("math", { extends: DecoratorNode });
  }

  static clone(node: MathNode): MathNode {
    return new MathNode(node.__latex, node.__block, node.__rtl, node.__key);
  }

  static importJSON(json: SerializedMathNode): MathNode {
    return new MathNode().updateFromJSON(json);
  }

  // Our own copies keep their LaTeX on the element; MathML from other pages
  // often carries its LaTeX as an annotation.
  static importDOM(): DOMConversionMap | null {
    return {
      span: (element: HTMLElement) =>
        element.dataset.latex === undefined
          ? null
          : {
              conversion: () => ({
                node: new MathNode(
                  element.dataset.latex ?? "",
                  element.dataset.block !== undefined,
                  element.dir === "rtl",
                ),
              }),
              priority: 2,
            },
      math: (element: HTMLElement) => {
        const tex = element.querySelector(TEX)?.textContent.trim();
        return tex
          ? {
              conversion: () => ({
                node: new MathNode(
                  tex,
                  element.getAttribute("display") === "block",
                ),
              }),
              priority: 2,
            }
          : null;
      },
    };
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedMathNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__latex = json.latex;
    node.__block = json.block ?? false;
    node.__rtl = json.direction === "rtl";
    return node;
  }

  exportJSON(): SerializedMathNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      latex: node.__latex,
      ...(node.__block ? { block: true } : {}),
      ...(node.__rtl ? { direction: "rtl" as const } : {}),
    };
  }

  exportDOM(): DOMExportOutput {
    const node = this.getLatest();
    const element = $getDocument().createElement("span");
    element.dataset.latex = node.__latex;
    if (node.__block) element.dataset.block = "";
    if (node.__rtl) element.dir = "rtl";
    element.textContent = mathText({
      latex: node.__latex,
      block: node.__block,
      direction: node.__rtl ? "rtl" : null,
    });
    return { element };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = $getDocument().createElement("span");
    if (this.__block) element.className = "fe-math-line";
    return element;
  }

  updateDOM(previous: MathNode): boolean {
    return previous.__block !== this.__block;
  }

  isInline(): true {
    return true;
  }

  getTextContent(): string {
    const node = this.getLatest();
    return mathText({
      latex: node.__latex,
      block: node.__block,
      direction: node.__rtl ? "rtl" : null,
    });
  }

  getLatex(): string {
    return this.getLatest().__latex;
  }

  setLatex(latex: string): this {
    const writable = this.getWritable();
    writable.__latex = latex;
    return writable;
  }

  isBlock(): boolean {
    return this.getLatest().__block;
  }

  setBlock(block: boolean): this {
    const writable = this.getWritable();
    writable.__block = block;
    return writable;
  }

  isRtl(): boolean {
    return this.getLatest().__rtl;
  }

  setRtl(rtl: boolean): this {
    const writable = this.getWritable();
    writable.__rtl = rtl;
    return writable;
  }

  decorate(): JSX.Element {
    return (
      <MathChip
        nodeKey={this.getKey()}
        latex={this.__latex}
        block={this.__block}
        rtl={this.__rtl}
      />
    );
  }
}

export function $createMathNode(latex = "", block = false): MathNode {
  return new MathNode(latex, block);
}

/** Chooses a formula, which opens it in the floating bar to be written. */
export function $selectMath(node: MathNode) {
  const selection = $createNodeSelection();
  selection.add(node.getKey());
  $setSelection(selection);
}

/**
 * Makes the selected text a formula, its words taken as LaTeX, or starts an
 * empty one at the caret. With the caret just after a formula it chooses
 * that one, which is how a keyboard reaches a formula to change it.
 */
export function $insertMath(): MathNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  if (selection.isCollapsed()) {
    const { anchor } = selection;
    const at = anchor.getNode();
    const before =
      anchor.type === "element"
        ? $isElementNode(at)
          ? at.getChildAtIndex(anchor.offset - 1)
          : null
        : anchor.offset === 0
          ? at.getPreviousSibling()
          : null;
    if ($isMathNode(before)) {
      $selectMath(before);
      return before;
    }
  }
  const node = $createMathNode(selection.getTextContent().trim());
  selection.insertNodes([node]);
  $selectMath(node);
  return node;
}

export function $isMathNode(
  node: LexicalNode | null | undefined,
): node is MathNode {
  return node instanceof MathNode;
}
