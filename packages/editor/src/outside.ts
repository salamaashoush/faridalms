import type { LexicalEditor } from "lexical";

/**
 * Applies a change made from a menu or button outside the text. Focus goes
 * back to the text first and the change commits at once: if focus moved
 * while Lexical committed it later, the focus event would dispatch a command
 * inside the read-only commit. A closing menu then takes focus with it, so
 * the text takes it back on the next frame, by plain focus: the commit has
 * placed the caret already, and Lexical's own focus would set it again from
 * outside the text, the very case this avoids.
 */
export function updateFromOutside(editor: LexicalEditor, change: () => void) {
  const root = editor.getRootElement();
  root?.focus({ preventScroll: true });
  editor.update(change, { discrete: true });
  requestAnimationFrame(() => {
    if (root && !root.contains(document.activeElement))
      root.focus({ preventScroll: true });
  });
}
