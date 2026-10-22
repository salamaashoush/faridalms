import type { Mention } from "@faridalms/domain/content";
import type {
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";

import { $getDocument, DecoratorNode } from "lexical";

import { useEditorEnvironment } from "../context";

export type SerializedMentionNode = Spread<
  { mention: Mention },
  SerializedLexicalNode
>;

const NO_MENTION: Mention = {
  kind: "person",
  id: "00000000-0000-0000-0000-000000000000",
  label: "",
};

/** A mention by the name it bears now where the school says, else as written. */
function MentionName({ mention }: { mention: Mention }) {
  const { mentions } = useEditorEnvironment();
  return (
    <span className="fe-mention" data-mention={mention.kind}>
      @{mentions?.name?.(mention) ?? mention.label}
    </span>
  );
}

/**
 * A person, the teaching a class follows, or what the school sends, named
 * in the text with @. It keeps which one it names, so a reader can open it
 * and see it by the name it bears now, and the name it had when written,
 * for a reader not entitled to look it up.
 */
export class MentionNode extends DecoratorNode<JSX.Element> {
  __mention: Mention;

  constructor(mention: Mention = NO_MENTION, key?: NodeKey) {
    super(key);
    this.__mention = mention;
  }

  $config() {
    return this.config("mention", { extends: DecoratorNode });
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__mention, node.__key);
  }

  static importJSON(json: SerializedMentionNode): MentionNode {
    return new MentionNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedMentionNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__mention = json.mention;
    return node;
  }

  exportJSON(): SerializedMentionNode {
    return { ...super.exportJSON(), mention: this.getLatest().__mention };
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

  getTextContent(): string {
    return `@${this.__mention.label}`;
  }

  getMention(): Mention {
    return this.getLatest().__mention;
  }

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return <MentionName mention={this.__mention} />;
  }
}

export function $createMentionNode(mention: Mention): MentionNode {
  return new MentionNode(mention);
}

export function $isMentionNode(
  node: LexicalNode | null | undefined,
): node is MentionNode {
  return node instanceof MentionNode;
}
