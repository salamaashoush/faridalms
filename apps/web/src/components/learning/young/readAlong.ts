import type { RefObject } from "react";

import { useEffect } from "react";

import type { SpokenWord } from "~/components/questions/ReadAloud";

import { onSpokenWord } from "~/components/questions/ReadAloud";

const NAME = "read-along";

const plain = (text: string) => text.replace(/\s+/g, " ").trim();

/** The nth word of an element's text as a range, across its text nodes. */
export function wordRange(element: Element, index: number): Range | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const data = node.textContent ?? "";
    for (const match of data.matchAll(/\S+/g)) {
      if (seen === index) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        return range;
      }
      seen += 1;
    }
  }
  return null;
}

/** The range of the word the voice is saying, in the text that reads the same. */
export function spokenRange(root: Element, word: SpokenWord): Range | null {
  const said = plain(word.text);
  const element = [...root.querySelectorAll("[data-read-along]")].find(
    (candidate) => plain(candidate.textContent) === said,
  );
  if (!element) return null;
  const index = word.text.slice(0, word.start).match(/\S+/g)?.length ?? 0;
  return wordRange(element, index);
}

/**
 * Lights each word in `root` as the browser's voice says it, on the text
 * marked `data-read-along` that reads the same, as a finger follows the
 * line in a shared book. Where the browser names no words, nothing lights.
 */
export function useReadAlong(
  root: RefObject<Element | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || typeof Highlight === "undefined") return undefined;
    const stop = onSpokenWord((word) => {
      CSS.highlights.delete(NAME);
      const range =
        word && root.current ? spokenRange(root.current, word) : null;
      if (range) CSS.highlights.set(NAME, new Highlight(range));
    });
    return () => {
      stop();
      CSS.highlights.delete(NAME);
    };
  }, [root, enabled]);
}
