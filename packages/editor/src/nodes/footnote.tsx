import type { FootnoteSource } from "@faridalms/domain/citations";
import type {
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import {
  $createNodeSelection,
  $getDocument,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
} from "lexical";
import { useEffect, useRef } from "react";

import { useEditorEnvironment } from "../context";
import { cx } from "../ui";

export type SerializedFootnoteNode = Spread<
  { note: string; source?: FootnoteSource },
  SerializedLexicalNode
>;

function FootnoteMark({ nodeKey }: { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [selected, select, clear] = useLexicalNodeSelection(nodeKey);
  const mark = useRef<HTMLElement>(null);
  useEffect(
    () =>
      editor.registerCommand(
        CLICK_COMMAND,
        (event) => {
          if (
            !editor.isEditable() ||
            !(event.target instanceof Node) ||
            !mark.current?.contains(event.target)
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
  // The number is the mark's place among the document's footnotes, drawn
  // by a counter so it follows every footnote added, moved or taken out.
  return (
    <sup
      ref={mark}
      aria-label={strings.footnote}
      data-selected={selected || undefined}
      className={cx("fe-footnote", editor.isEditable() && "cursor-pointer")}
    />
  );
}

/**
 * A footnote: a number in the text, and words or a source cited below it.
 * It is one piece in the line, edited from the floating bar, so the caret
 * steps over it as over a word.
 */
export class FootnoteNode extends DecoratorNode<JSX.Element> {
  __note: string;
  __source: FootnoteSource | null;

  constructor(note = "", source: FootnoteSource | null = null, key?: NodeKey) {
    super(key);
    this.__note = note;
    this.__source = source;
  }

  $config() {
    return this.config("footnote", { extends: DecoratorNode });
  }

  static clone(node: FootnoteNode): FootnoteNode {
    return new FootnoteNode(node.__note, node.__source, node.__key);
  }

  static importJSON(json: SerializedFootnoteNode): FootnoteNode {
    return new FootnoteNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedFootnoteNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__note = json.note;
    node.__source = json.source ?? null;
    return node;
  }

  exportJSON(): SerializedFootnoteNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      note: node.__note,
      ...(node.__source ? { source: node.__source } : {}),
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return $getDocument().createElement("span");
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): true {
    return true;
  }

  getNote(): string {
    return this.getLatest().__note;
  }

  getSource(): FootnoteSource | null {
    return this.getLatest().__source;
  }

  setNote(note: string): this {
    const writable = this.getWritable();
    writable.__note = note;
    return writable;
  }

  setSource(source: FootnoteSource | null): this {
    const writable = this.getWritable();
    writable.__source = source;
    return writable;
  }

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return <FootnoteMark nodeKey={this.getKey()} />;
  }
}

export function $isFootnoteNode(
  node: LexicalNode | null | undefined,
): node is FootnoteNode {
  return node instanceof FootnoteNode;
}

/** Adds a footnote after the words chosen, or at the caret, and chooses it so its words are written next. */
export function $insertFootnote(): FootnoteNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  if (!selection.isCollapsed()) {
    const end = selection.isBackward() ? selection.anchor : selection.focus;
    const { key, offset, type } = end;
    selection.anchor.set(key, offset, type);
    selection.focus.set(key, offset, type);
  }
  const node = new FootnoteNode();
  selection.insertNodes([node]);
  const chosen = $createNodeSelection();
  chosen.add(node.getKey());
  $setSelection(chosen);
  return node;
}
