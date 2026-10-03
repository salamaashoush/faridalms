import type { EditorConfig, LexicalNode, NodeKey } from "lexical";
import type { JSX } from "react";

import { $getDocument, DecoratorNode } from "lexical";

import { useEditorEnvironment } from "../context";
import { useSelectOnClick } from "./select";

function PageBreakBlock({ nodeKey }: { nodeKey: NodeKey }) {
  const { strings } = useEditorEnvironment();
  const selected = useSelectOnClick(nodeKey);
  return (
    <div
      className={`my-4 flex items-center gap-3 rounded-md py-1 ${selected ? "outline-2 outline-offset-2 outline-ring" : ""}`}
    >
      <span
        aria-hidden
        className="h-0 flex-1 border-t border-dashed border-border"
      />
      <span className="text-xs font-medium text-muted-foreground">
        {strings.pageBreak}
      </span>
      <span
        aria-hidden
        className="h-0 flex-1 border-t border-dashed border-border"
      />
    </div>
  );
}

/**
 * Where a printed copy starts a new page. Screens read on without it; only
 * paper turns the page, so a worksheet's second part can start on its own
 * sheet.
 */
export class PageBreakNode extends DecoratorNode<JSX.Element> {
  $config() {
    return this.config("pagebreak", { extends: DecoratorNode });
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
    return <PageBreakBlock nodeKey={this.getKey()} />;
  }
}

export function $isPageBreakNode(
  node: LexicalNode | null | undefined,
): node is PageBreakNode {
  return node instanceof PageBreakNode;
}
