import type { LexicalEditor } from "lexical";

import { $getSelection } from "lexical";

/**
 * Applies a change made from a menu or button outside the text. Focus goes
 * back to the text first and the change commits at once: if focus moved
 * while Lexical committed it later, the focus event would dispatch a command
 * inside the read-only commit.
 */
export function updateFromOutside(editor: LexicalEditor, change: () => void) {
  editor.getRootElement()?.focus({ preventScroll: true });
  editor.update(change, { discrete: true });
}

/**
 * Where a menu over the editor hands focus once it has closed: to a prompt
 * the chosen item opened (an embed link, a table size), otherwise back to the
 * text. A menu keeps focus while it animates shut, so this cannot be done
 * from the item's own click.
 */
export function textFocus(editor: LexicalEditor) {
  return () =>
    document.querySelector<HTMLElement>(
      "[data-editor-prompt] input, [data-editor-prompt] textarea",
    ) ?? editor.getRootElement();
}

/**
 * Puts focus back in the text, at the caret it had, after a prompt or menu
 * outside it held focus. Lexical's own focus sets the caret before the text
 * has focus, which fires the same focus command inside its commit.
 */
export function focusText(editor: LexicalEditor) {
  updateFromOutside(editor, () => {
    const selection = $getSelection();
    if (selection) selection.dirty = true;
  });
}
