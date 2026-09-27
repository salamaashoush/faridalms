import { textDirection } from "@faridalms/domain/content";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { useEffect } from "react";

const strong = /[A-Za-zÀ-ɏͰ-ԯ֐-ࣿיִ-﷿ﹰ-﻿]/;

/**
 * A document reads in its own direction, taken from its first letter, not
 * the interface's: an English notice written from the Arabic interface puts
 * its pictures, lists and empty lines on the left. Until it has a letter it
 * follows the interface.
 *
 * Lexical marks blocks `dir="auto"`, and a block with no strong letters (an
 * empty line, a number) then resolves to left-to-right even in an Arabic
 * document, putting the caret, the slash menu and toggle arrows on the wrong
 * side. Such blocks follow the document's direction until they hold text.
 */
export function DirectionPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const apply = () => {
      const root = editor.getRootElement();
      const frame = root?.parentElement;
      if (!root || !frame) return;
      const own = textDirection(root.textContent);
      if (own) frame.dir = own;
      else frame.removeAttribute("dir");
      const direction =
        getComputedStyle(root).direction === "rtl" ? "rtl" : "ltr";
      for (const element of root.querySelectorAll<HTMLElement>(
        '[dir="auto"], [data-neutral-dir]',
      )) {
        if (strong.test(element.textContent)) {
          if (element.hasAttribute("data-neutral-dir")) {
            element.removeAttribute("data-neutral-dir");
            element.dir = "auto";
          }
        } else if (element.dir !== direction) {
          element.dir = direction;
          element.setAttribute("data-neutral-dir", "");
        }
      }
    };
    apply();
    return mergeRegister(
      editor.registerUpdateListener(apply),
      editor.registerRootListener(() => apply()),
    );
  }, [editor]);
  return null;
}
