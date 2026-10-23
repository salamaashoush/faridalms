import type { NodeKey } from "lexical";

import { textDirection } from "@faridalms/domain/content";
import { languageDirection } from "@faridalms/domain/translations";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { $getRoot } from "lexical";
import { useEffect } from "react";

const strong = /[A-Za-zÀ-ɏͰ-ԯ֐-ࣿיִ-﷿ﹰ-﻿]/;
const NEUTRAL = '[dir="auto"], [data-neutral-dir]';

function $ownDirection() {
  for (const block of $getRoot().getChildren()) {
    const found = textDirection(block.getTextContent());
    if (found) return found;
  }
  return null;
}

function settle(element: HTMLElement, direction: "ltr" | "rtl") {
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
export function DirectionPlugin({ language }: { language?: "en" | "ar" }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let settled: "ltr" | "rtl" | null = null;
    let frame = 0;
    const apply = (changed?: {
      elements: Map<NodeKey, boolean>;
      leaves: Set<NodeKey>;
    }) => {
      const root = editor.getRootElement();
      const outer = root?.parentElement;
      if (!root || !outer) return;
      // A document whose language is set reads in its direction from the
      // start. Otherwise its own words decide, never the labels its blocks
      // draw in the interface's language.
      const own = language
        ? languageDirection(language)
        : editor.getEditorState().read($ownDirection);
      // Setting dir, even to the value it has, restyles the whole document.
      if (own && outer.dir !== own) outer.dir = own;
      else if (!own && outer.hasAttribute("dir")) outer.removeAttribute("dir");
      const direction =
        own ?? (getComputedStyle(root).direction === "rtl" ? "rtl" : "ltr");
      // Typing changes one block, so an update revisits only the blocks it
      // touched; a new direction revisits them all.
      const whole = !changed || direction !== settled;
      settled = direction;
      if (whole) {
        for (const element of root.querySelectorAll<HTMLElement>(NEUTRAL))
          settle(element, direction);
        return;
      }
      for (const key of changed.elements.keys()) {
        const element = editor.getElementByKey(key);
        if (element && element !== root && element.matches(NEUTRAL))
          settle(element, direction);
      }
      // A picture or file block draws its words after the update, so its
      // labels are settled once they are on the page.
      if (
        [...changed.leaves].some((key) =>
          editor.getElementByKey(key)?.hasAttribute("data-lexical-decorator"),
        )
      ) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => apply());
      }
    };
    apply();
    return mergeRegister(
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) =>
        apply({ elements: dirtyElements, leaves: dirtyLeaves }),
      ),
      editor.registerRootListener(() => apply()),
      () => cancelAnimationFrame(frame),
    );
  }, [editor, language]);
  return null;
}
