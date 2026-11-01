import type { ContentDocument, ContentNode } from "./content";

import { holdsSuggestions } from "./content";
import { isVagueLink } from "./site-links";

/**
 * What keeps a document from reading well to everyone: a picture with no
 * description that is not marked decorative, a heading that skips a level,
 * and a link that says nothing about where it goes.
 */
export type ContentIssue = "alt" | "order" | "link";

/** The refusal the API answers a document with when it has the issue. */
export const CONTENT_ISSUE_CODE = {
  alt: "content.alt",
  order: "content.order",
  link: "content.link",
  heading: "content.heading",
  captions: "content.captions",
  unreviewed: "content.unreviewed",
  consent: "content.consent",
} as const satisfies { [Issue in PublishIssue]: `content.${Issue}` };

const LEVEL: Partial<Record<NonNullable<ContentNode["tag"]>, number>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

/** A heading's level as its writer chose it, one for the largest. */
export const headingLevel = (node: ContentNode): number | null =>
  node.type === "heading" && node.tag ? (LEVEL[node.tag] ?? null) : null;

/**
 * The largest heading a document uses. Readers number its headings from
 * there, under the page's title, so a writer may start at any size and
 * only a level skipped after that breaks the outline.
 */
export function topHeadingLevel(document: ContentDocument): number {
  let top = 6;
  const pending: ContentNode[] = [document.root];
  for (let node = pending.pop(); node; node = pending.pop()) {
    top = Math.min(top, headingLevel(node) ?? 6);
    if (node.children) pending.push(...node.children);
  }
  return top;
}

export function contentIssues(document: ContentDocument): ContentIssue[] {
  const found = new Set<ContentIssue>();
  let level = topHeadingLevel(document) - 1;
  const walk = (node: ContentNode) => {
    const next = headingLevel(node);
    if (next !== null) {
      if (next > level + 1) found.add("order");
      level = next;
    }
    if (node.type === "image" && !node.decorative && !node.alt?.trim())
      found.add("alt");
    if (node.pictures?.some((picture) => !picture.alt.trim())) found.add("alt");
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

/** Whether a document has a heading of the first level anywhere in it. */
export function hasFirstLevelHeading(document: ContentDocument): boolean {
  const pending: ContentNode[] = [document.root];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (node.type === "heading" && node.tag === "h1") return true;
    if (node.children) pending.push(...node.children);
  }
  return false;
}

/**
 * Whether a document plays a video without captions, or audio with neither
 * captions nor a transcript, which a reader who cannot hear it would miss.
 */
export function holdsUncaptioned(document: ContentDocument): boolean {
  const pending: ContentNode[] = [document.root];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (
      node.type === "media" &&
      !node.captionsFileId &&
      ((node.mime ?? "").startsWith("video/") || !node.transcript)
    )
      return true;
    if (node.children) pending.push(...node.children);
  }
  return false;
}

/**
 * What stops a document going out to its readers, whichever host publishes
 * it. Who a picture shows is checked against consent by the publishing
 * system, which holds the answers, and reported as `consent`.
 */
export type PublishIssue =
  | ContentIssue
  | "heading"
  | "captions"
  | "unreviewed"
  | "consent";

export interface PublishRules {
  /**
   * Words shown under a heading of their own, as a section of a website page
   * or a post on the website: a first-level heading competes with it, and the
   * outline is the page's rather than the document's.
   */
  underHeading?: boolean;
}

export function publishIssues(
  document: ContentDocument,
  rules: PublishRules = {},
): PublishIssue[] {
  const found = new Set<PublishIssue>(contentIssues(document));
  if (rules.underHeading) {
    found.delete("order");
    if (hasFirstLevelHeading(document)) found.add("heading");
  }
  if (holdsUncaptioned(document)) found.add("captions");
  if (holdsSuggestions(document)) found.add("unreviewed");
  return [...found];
}
