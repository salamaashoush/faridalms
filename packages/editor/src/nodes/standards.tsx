import type { StandardTarget } from "@faridalms/domain/content";
import type {
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";

import {
  $createNodeSelection,
  $getDocument,
  $setSelection,
  DecoratorNode,
} from "lexical";
import { Target } from "lucide-react";

import { useEditorEnvironment } from "../context";
import { cx } from "../ui";
import { useSelectOnClick } from "./select";

export type SerializedStandardsNode = Spread<
  { targets: StandardTarget[] },
  SerializedLexicalNode
>;

const NO_TARGETS: StandardTarget[] = [];

function StandardsBlock({
  nodeKey,
  targets,
}: {
  nodeKey: NodeKey;
  targets: readonly StandardTarget[];
}) {
  const { strings } = useEditorEnvironment();
  const selected = useSelectOnClick(nodeKey);
  return (
    <div
      className={cx(
        "fe-standards",
        selected && "outline-2 outline-offset-2 outline-ring",
      )}
    >
      <p className="fe-standards-title">
        <Target aria-hidden className="size-3.5" />
        {strings.standardsBlock}
      </p>
      {targets.length > 0 ? (
        <ul>
          {targets.map((target) => (
            <li key={target.id} dir="auto">
              {target.code ? (
                <>
                  <span className="fe-standards-code">{target.code}</span>{" "}
                </>
              ) : null}
              {target.statement}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {strings.standardsBlockEmpty}
        </p>
      )}
    </div>
  );
}

/**
 * The standards a part of a document works toward, as a unit plan's goals
 * or a lesson's learning intentions name them. Each keeps the code and
 * statement it had when chosen, so readers see it as the author did.
 */
export class StandardsNode extends DecoratorNode<JSX.Element> {
  __targets: StandardTarget[];

  constructor(targets: StandardTarget[] = NO_TARGETS, key?: NodeKey) {
    super(key);
    this.__targets = targets;
  }

  $config() {
    return this.config("standards", { extends: DecoratorNode });
  }

  static clone(node: StandardsNode): StandardsNode {
    return new StandardsNode(node.__targets, node.__key);
  }

  static importJSON(json: SerializedStandardsNode): StandardsNode {
    return new StandardsNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedStandardsNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__targets = json.targets;
    return node;
  }

  exportJSON(): SerializedStandardsNode {
    return { ...super.exportJSON(), targets: this.getLatest().__targets };
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

  getTargets(): StandardTarget[] {
    return this.getLatest().__targets;
  }

  setTargets(targets: StandardTarget[]): this {
    const writable = this.getWritable();
    writable.__targets = targets;
    return writable;
  }

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return <StandardsBlock nodeKey={this.getKey()} targets={this.__targets} />;
  }
}

export function $isStandardsNode(
  node: LexicalNode | null | undefined,
): node is StandardsNode {
  return node instanceof StandardsNode;
}

/** Chooses a standards block, which offers its picker in the floating bar. */
export function $selectStandards(node: StandardsNode) {
  const selection = $createNodeSelection();
  selection.add(node.getKey());
  $setSelection(selection);
}
