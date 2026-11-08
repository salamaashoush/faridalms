import type { NodeKey } from "lexical";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
} from "lexical";
import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Whether a block is chosen, with ways to choose it and let it go, as
 * Lexical's `useLexicalNodeSelection` gives them. That hook sets React state
 * on every update of the editor; React keeps each such update queued on a
 * block that does not draw again, which while someone types elsewhere is
 * every picture and formula, so the queues grew by megabytes a minute in a
 * long lesson. React reads a store here and draws, and queues, on a change.
 */
export function useNodeSelection(
  key: NodeKey,
): [boolean, (selected: boolean) => void, () => void] {
  const [editor] = useLexicalComposerContext();
  const subscribe = useCallback(
    (changed: () => void) => editor.registerUpdateListener(changed),
    [editor],
  );
  const read = useCallback(
    () =>
      editor
        .getEditorState()
        .read(() => $getNodeByKey(key)?.isSelected() ?? false),
    [editor, key],
  );
  const selected = useSyncExternalStore(subscribe, read, read);
  const setSelected = useCallback(
    (next: boolean) =>
      editor.update(() => {
        const current = $getSelection();
        // Letting go of a block the selection does not hold would only throw
        // away the caret.
        if (
          !$isNodeSelection(current) &&
          !next &&
          !$getNodeByKey(key)?.isSelected()
        )
          return;
        const selection = $isNodeSelection(current)
          ? current
          : $createNodeSelection();
        if (selection !== current) $setSelection(selection);
        if (next) selection.add(key);
        else selection.delete(key);
      }),
    [editor, key],
  );
  const clearSelection = useCallback(
    () =>
      editor.update(() => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) selection.clear();
      }),
    [editor],
  );
  return [selected, setSelected, clearSelection];
}

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
  const [selected, setSelected, clearSelection] = useNodeSelection(nodeKey);
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
