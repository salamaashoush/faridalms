import type { EditorConfig, LexicalNode, NodeKey } from "lexical";
import type { JSX } from "react";

import { $getDocument, DecoratorNode } from "lexical";
import { ArrowDown } from "lucide-react";

import { useEditorEnvironment } from "../context";
import { useSelectOnClick } from "./select";

function GateBlock({ nodeKey }: { nodeKey: NodeKey }) {
  const { strings } = useEditorEnvironment();
  const selected = useSelectOnClick(nodeKey);
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
      <p className="text-center text-xs text-muted-foreground">
        {strings.gateHint}
      </p>
    </div>
  );
}

/**
 * Where a lesson stops until its student has answered every question above
 * and chosen to go on. It has no words, so it is a widget rather than text.
 */
export class GateNode extends DecoratorNode<JSX.Element> {
  $config() {
    return this.config("gate", { extends: DecoratorNode });
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

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return <GateBlock nodeKey={this.getKey()} />;
  }
}

export function $isGateNode(
  node: LexicalNode | null | undefined,
): node is GateNode {
  return node instanceof GateNode;
}
