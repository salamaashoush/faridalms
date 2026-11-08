import type { ElementFormatType, NodeKey } from "lexical";
import type { ReactNode } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isDecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import { $getNearestBlockElementAncestorOrThrow } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_ELEMENT_COMMAND,
  getComposedEventTarget,
  mergeRegister,
} from "lexical";
import { useEffect, useRef } from "react";

import { useNodeSelection } from "./select";

export interface AlignableBlockProps {
  children: ReactNode;
  format?: ElementFormatType | null;
  nodeKey: NodeKey;
  className: Readonly<{ base: string; focus: string }>;
}

/**
 * A block's frame that is chosen by a click on it and aligned by the
 * alignment commands, as Lexical's `BlockWithAlignableContents` is, with
 * its selection read through `useNodeSelection` so a block that does not
 * draw again holds no queue of React updates.
 */
export function AlignableBlock({
  children,
  format,
  nodeKey,
  className,
}: AlignableBlockProps) {
  const [editor] = useLexicalComposerContext();
  const [selected, setSelected, clearSelection] = useNodeSelection(nodeKey);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          FORMAT_ELEMENT_COMMAND,
          (formatType) => {
            if (!selected) return false;
            const selection = $getSelection();
            if ($isNodeSelection(selection)) {
              const node = $getNodeByKey(nodeKey);
              if ($isDecoratorBlockNode(node)) node.setFormat(formatType);
            } else if ($isRangeSelection(selection))
              for (const node of selection.getNodes())
                if ($isDecoratorBlockNode(node)) node.setFormat(formatType);
                else
                  $getNearestBlockElementAncestorOrThrow(node).setFormat(
                    formatType,
                  );
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          CLICK_COMMAND,
          (event) => {
            if (getComposedEventTarget(event) !== ref.current) return false;
            event.preventDefault();
            if (!event.shiftKey) clearSelection();
            setSelected(!selected);
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [clearSelection, editor, selected, nodeKey, setSelected],
  );

  return (
    <div
      className={[className.base, selected ? className.focus : null]
        .filter(Boolean)
        .join(" ")}
      ref={ref}
      style={{ textAlign: format || undefined }}
    >
      {children}
    </div>
  );
}
