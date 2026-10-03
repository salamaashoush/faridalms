import type { NodeKey } from "lexical";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { CLICK_COMMAND, COMMAND_PRIORITY_LOW } from "lexical";
import { useEffect } from "react";

/**
 * Controls inside a block that keep their own click: the block stays
 * unselected. A video's picture is not one, so clicking it selects the
 * block and brings up its bar while it plays or pauses.
 */
const OWN_CLICK = "input, textarea, select, button, a";

/**
 * Selects a picture, drawing, video or embed when it is clicked anywhere
 * but its own controls. Lexical's block wrapper selects only on a click on
 * the wrapper itself, which the content always covers, so without this such
 * a block could never be selected and the floating bar never offered its
 * width and alignment.
 */
export function useSelectOnClick(nodeKey: NodeKey) {
  const [editor] = useLexicalComposerContext();
  const [selected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  useEffect(
    () =>
      editor.registerCommand(
        CLICK_COMMAND,
        (event) => {
          const element = editor.getElementByKey(nodeKey);
          const target = event.target;
          if (
            !element ||
            !(target instanceof Element) ||
            !element.contains(target) ||
            target.closest(OWN_CLICK)
          )
            return false;
          if (!event.shiftKey) clearSelection();
          setSelected(true);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, nodeKey, setSelected, clearSelection],
  );
  return selected;
}

/**
 * Keeps the keys pressed in a block's own player and fields to them. The
 * editor listens on its whole text and takes select-all, undo and the
 * arrows for its own selection, even from a field inside a block.
 */
export function ownKeys(element: HTMLElement | null) {
  if (!element) return undefined;
  element.addEventListener("keydown", keepKey);
  return () => element.removeEventListener("keydown", keepKey);
}

const keepKey = (event: KeyboardEvent) => event.stopPropagation();
