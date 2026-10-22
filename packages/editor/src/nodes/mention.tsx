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

export type SerializedMentionNode = Spread<
  { mention: Mention },
  SerializedLexicalNode
>;

const NO_MENTION: Mention = {
  kind: "person",
  id: "00000000-0000-0000-0000-000000000000",
  label: "",
};

/**
 * A person, class, module, lesson or assignment named in the text with @.
 * It keeps the name it had when written, so the text reads the same to
 * anyone, and which one it names, so a reader can open it.
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
    return (
      <span className="fe-mention" data-mention={this.__mention.kind}>
        @{this.__mention.label}
      </span>
    );
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
