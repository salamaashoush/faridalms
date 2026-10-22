import type { GateWaits } from "@faridalms/domain/content";
import type {
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";

import { GATE_WAITS } from "@faridalms/domain/content";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $getDocument, $getNodeByKey, DecoratorNode } from "lexical";
import { ArrowDown } from "lucide-react";
import { useId } from "react";

import { useEditorEnvironment } from "../context";
import { ownKeys, useSelectOnClick } from "./select";

export type SerializedGateNode = Spread<
  { requires?: GateWaits },
  SerializedLexicalNode
>;

function GateBlock({
  nodeKey,
  requires,
}: {
  nodeKey: NodeKey;
  requires: GateWaits;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const editable = useLexicalEditable();
  const selected = useSelectOnClick(nodeKey);
  const id = useId();
  const labels: Record<GateWaits, string> = {
    above: strings.gateAbove,
    last: strings.gateLast,
    none: strings.gateNone,
  };
  const hints: Record<GateWaits, string> = {
    above: strings.gateHint,
    last: strings.gateHintLast,
    none: strings.gateHintNone,
  };
  return (
    <div
      className={`my-4 grid gap-1.5 rounded-lg py-2 ${selected ? "outline-2 outline-offset-2 outline-ring" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
          {strings.gate}
          <ArrowDown aria-hidden className="size-4" />
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      {editable ? (
        <div
          ref={ownKeys}
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
        >
          <label htmlFor={id}>{strings.gateWaits}</label>
          <select
            id={id}
            value={requires}
            onChange={(event) => {
              const value = GATE_WAITS.find(
                (item) => item === event.target.value,
              );
              if (!value) return;
              editor.update(
                () => {
                  const node = $getNodeByKey(nodeKey);
                  if ($isGateNode(node)) node.setRequires(value);
                },
                { discrete: true },
              );
            }}
            className="h-7 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {GATE_WAITS.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          {hints[requires]}
        </p>
      )}
    </div>
  );
}

/**
 * Where a lesson stops until its student has done what the gate waits for
 * and chosen to go on: every question and video above, the one just above,
 * or nothing. It has no words, so it is a widget rather than text.
 */
export class GateNode extends DecoratorNode<JSX.Element> {
  __requires: GateWaits;

  constructor(requires: GateWaits = "above", key?: NodeKey) {
    super(key);
    this.__requires = requires;
  }

  $config() {
    return this.config("gate", { extends: DecoratorNode });
  }

  static clone(node: GateNode): GateNode {
    return new GateNode(node.__requires, node.__key);
  }

  static importJSON(json: SerializedGateNode): GateNode {
    return new GateNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedGateNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__requires = json.requires ?? "above";
    return node;
  }

  exportJSON(): SerializedGateNode {
    const requires = this.getLatest().__requires;
    return {
      ...super.exportJSON(),
      ...(requires === "above" ? {} : { requires }),
    };
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

  getRequires(): GateWaits {
    return this.getLatest().__requires;
  }

  setRequires(requires: GateWaits): this {
    const writable = this.getWritable();
    writable.__requires = requires;
    return writable;
  }

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return <GateBlock nodeKey={this.getKey()} requires={this.__requires} />;
  }
}

export function $isGateNode(
  node: LexicalNode | null | undefined,
): node is GateNode {
  return node instanceof GateNode;
}
