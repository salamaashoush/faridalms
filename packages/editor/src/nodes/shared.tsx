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
import {
  $getDocument,
  $getNodeByKey,
  $isElementNode,
  $parseSerializedNode,
  DecoratorNode,
} from "lexical";
import { Copy, Pencil, Repeat2 } from "lucide-react";

import { useEditorEnvironment } from "../context";
import { updateFromOutside } from "../outside";
import { cx } from "../ui";
import { useSelectOnClick } from "./select";

export type SerializedSharedNode = Spread<
  { sharedId: string },
  SerializedLexicalNode
>;

function SharedFrame({
  nodeKey,
  sharedId,
}: {
  nodeKey: NodeKey;
  sharedId: string;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings, shared } = useEditorEnvironment();
  const selected = useSelectOnClick(nodeKey);
  // A copy here stands apart from the shared block, changed only here.
  const copyHere = async () => {
    const content = await shared?.read(sharedId);
    if (!content) return;
    updateFromOutside(editor, () => {
      const node = $getNodeByKey(nodeKey);
      if (!node) return;
      const copies = (content.root.children ?? []).map((child) =>
        $parseSerializedNode(child),
      );
      for (const copy of copies.toReversed()) node.insertAfter(copy);
      node.remove();
      // The caret ends where the copy does, as after pasting it.
      const last = copies.at(-1);
      if ($isElementNode(last)) last.selectEnd();
      else last?.selectNext();
    });
  };
  return (
    <div
      className={cx(
        "fe-shared",
        selected && "outline-2 outline-offset-2 outline-ring",
      )}
    >
      <div className="fe-shared-bar">
        <span className="fe-shared-label">
          <Repeat2 aria-hidden className="size-3.5" />
          {strings.sharedBlock}
        </span>
        {shared ? (
          <>
            <button type="button" onClick={() => shared.edit(sharedId)}>
              <Pencil aria-hidden className="size-3.5" />
              {strings.sharedEdit}
            </button>
            <button type="button" onClick={() => void copyHere()}>
              <Copy aria-hidden className="size-3.5" />
              {strings.sharedCopy}
            </button>
          </>
        ) : null}
      </div>
      {shared ? <shared.View id={sharedId} /> : null}
    </div>
  );
}

/**
 * A block kept once and shown in many documents: the document holds only
 * which one, and draws it as it now is, so a change to it reaches every
 * document showing it. Its words are changed where it is kept, or a copy
 * is made here to change apart.
 */
export class SharedNode extends DecoratorNode<JSX.Element> {
  __sharedId: string;

  constructor(sharedId = "", key?: NodeKey) {
    super(key);
    this.__sharedId = sharedId;
  }

  $config() {
    return this.config("shared", { extends: DecoratorNode });
  }

  static clone(node: SharedNode): SharedNode {
    return new SharedNode(node.__sharedId, node.__key);
  }

  static importJSON(json: SerializedSharedNode): SharedNode {
    return new SharedNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedSharedNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__sharedId = json.sharedId;
    return node;
  }

  exportJSON(): SerializedSharedNode {
    return { ...super.exportJSON(), sharedId: this.getLatest().__sharedId };
  }

  createDOM(): HTMLElement {
    return $getDocument().createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): false {
    return false;
  }

  getSharedId(): string {
    return this.getLatest().__sharedId;
  }

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return <SharedFrame nodeKey={this.getKey()} sharedId={this.__sharedId} />;
  }
}

export function $createSharedNode(sharedId: string): SharedNode {
  return new SharedNode(sharedId);
}

export function $isSharedNode(
  node: LexicalNode | null | undefined,
): node is SharedNode {
  return node instanceof SharedNode;
}
