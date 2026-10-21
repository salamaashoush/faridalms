import type { ContentDocument, ContentNode } from "./content";

import { isVagueLink } from "./site-links";

/**
 * What keeps a document from reading well to everyone: a picture with no
 * description that is not marked decorative, a first-level heading that
 * competes with the title, a heading that skips a level, and a link that
 * says nothing about where it goes.
 */
export type ContentIssue = "alt" | "heading" | "order" | "link";

const LEVEL: Partial<Record<NonNullable<ContentNode["tag"]>, number>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

export function contentIssues(document: ContentDocument): ContentIssue[] {
  const found = new Set<ContentIssue>();
  // The title above the document is its first-level heading.
  let level = 1;
  const walk = (node: ContentNode) => {
    if (node.type === "heading" && node.tag) {
      const next = LEVEL[node.tag] ?? level;
      if (next === 1) found.add("heading");
      else if (next > level + 1) found.add("order");
      level = next;
    }
    if (node.type === "image" && !node.decorative && !node.alt?.trim())
      found.add("alt");
    if (node.type === "link" || node.type === "autolink") {
      const label = (node.children ?? [])
        .map((child) => child.text ?? "")
        .join("");
      if (isVagueLink(label)) found.add("link");
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(document.root);
  return [...found];
}
