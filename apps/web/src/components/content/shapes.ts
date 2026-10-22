import type { ContentDocument } from "@faridalms/domain/content";
import type { RichTextNode } from "@faridalms/domain/rich-text";

import { richTextToContent } from "@faridalms/domain/content-conversion";

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

const words = (text: string, italic = false): RichTextNode => ({
  type: "text",
  text,
  ...(italic ? { marks: [{ type: "italic" as const }] } : {}),
});

const paragraph = (content: RichTextNode[]): RichTextNode => ({
  type: "paragraph",
  content,
});

/** A document of headed sections in one language. */
export function sectionsContent(
  sections: readonly Section[],
  say: (text: Text) => string,
): ContentDocument {
  return richTextToContent({
    type: "doc",
    content: sections.flatMap((section): RichTextNode[] => [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [words(say(section.heading))],
      },
      ...(section.prompt
        ? [paragraph([words(say(section.prompt), true)]), paragraph([])]
        : []),
      ...(section.lines ?? []).map((line) => paragraph([words(say(line))])),
      ...(section.points?.length
        ? [
            {
              type: "bulletList" as const,
              content: section.points.map((point): RichTextNode => ({
                type: "listItem",
                content: [paragraph([words(say(point))])],
              })),
            },
          ]
        : []),
    ]),
  });
}
