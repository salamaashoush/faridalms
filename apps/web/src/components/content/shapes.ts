import type { ContentDocument } from "@faridalms/domain/content";

import {
  contentOf,
  headingNode,
  listNode,
  paragraphNode,
  TEXT_FORMAT,
  textNode,
} from "@faridalms/domain/content-conversion";

type Text = { en: string; ar: string };

/**
 * A part of a ready-made document: its heading, what to write there as an
 * italic prompt, and words and points worth keeping as they are or editing.
 */
export interface Section {
  heading: Text;
  prompt?: Text;
  lines?: Text[];
  points?: Text[];
}

/** A document of headed sections in one language. */
export function sectionsContent(
  sections: readonly Section[],
  say: (text: Text) => string,
): ContentDocument {
  return contentOf(
    sections.flatMap((section) => [
      headingNode("h2", [textNode(say(section.heading))]),
      ...(section.prompt
        ? [
            paragraphNode([textNode(say(section.prompt), TEXT_FORMAT.italic)]),
            paragraphNode([]),
          ]
        : []),
      ...(section.lines ?? []).map((line) =>
        paragraphNode([textNode(say(line))]),
      ),
      ...(section.points?.length
        ? [
            listNode(
              "bullet",
              section.points.map((point) => [textNode(say(point))]),
            ),
          ]
        : []),
    ]),
  );
}
