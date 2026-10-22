import type { ContentDocument, ContentNode } from "./content";
import type { GapsBlock } from "./learning";

import { contentOfLesson, lessonOfContent } from "./lesson-content";

/** Suggestions made at one time, few enough for a teacher to read each. */
export const MAX_SUGGESTIONS = 10;

const BOLD = 1;
const SENTENCE_END = /(?<=[.!?؟؛])\s+/u;

/** Bold runs of a block, joined where a term spans several text nodes. */
function boldTerms(node: ContentNode): string[] {
  const terms: string[] = [];
  let run = "";
  for (const child of node.children ?? []) {
    const bold =
      child.type === "text" &&
      typeof child.format === "number" &&
      (child.format & BOLD) === BOLD;
    if (bold) run += child.text ?? "";
    else if (run) {
      terms.push(run);
      run = "";
    }
  }
  if (run) terms.push(run);
  return terms.map((term) => term.trim()).filter(Boolean);
}

const textOf = (node: ContentNode): string =>
  node.type === "text"
    ? (node.text ?? "")
    : node.type === "linebreak"
      ? " "
      : (node.children ?? []).map(textOf).join("");

/**
 * Checks suggested from a document's words, as a teacher marks the terms
 * that matter by setting them in bold: each sentence holding a bold term
 * becomes a gap to fill with it. Each comes marked as suggested, after the
 * block it was taken from, and stays so until its teacher keeps it. Terms
 * a question already asks are left out.
 */
export function suggestedChecks(
  document: ContentDocument,
  prompt: string,
): { after: number; node: ContentNode }[] {
  const asked = new Set(
    lessonOfContent(document).blocks.flatMap((block) =>
      (block.type === "gaps"
        ? block.segments.flatMap((segment) =>
            segment.type === "gap" ? segment.answers : [],
          )
        : block.type === "text"
          ? block.answers
          : []
      ).map((answer) => answer.toLocaleLowerCase()),
    ),
  );
  const seen = new Set<string>();
  const found: { after: number; node: ContentNode }[] = [];
  for (const [index, block] of (document.root.children ?? []).entries()) {
    if (block.type !== "paragraph" && block.type !== "listitem") continue;
    const text = textOf(block).replaceAll(/\s+/gu, " ").trim();
    for (const term of boldTerms(block)) {
      const key = term.toLocaleLowerCase();
      if (seen.has(key) || asked.has(key) || term.length > 60) continue;
      const sentence = text
        .split(SENTENCE_END)
        .find((part) => part.includes(term));
      const at = sentence?.indexOf(term) ?? -1;
      if (!sentence || at < 0 || sentence.trim() === term) continue;
      seen.add(key);
      const gaps: GapsBlock = {
        id: crypto.randomUUID(),
        type: "gaps",
        prompt,
        points: 1,
        hints: [],
        explanation: "",
        tries: null,
        caseSensitive: false,
        closeEnough: true,
        tehMarbuta: true,
        segments: [
          { type: "text", text: sentence.slice(0, at) },
          {
            type: "gap",
            id: crypto.randomUUID(),
            answers: [term],
            options: [],
          },
          { type: "text", text: sentence.slice(at + term.length) },
        ],
      };
      const [node] =
        contentOfLesson({ version: 2, blocks: [gaps] })?.root.children ?? [];
      if (node)
        found.push({ after: index, node: { ...node, suggested: true } });
      if (found.length >= MAX_SUGGESTIONS) return found;
    }
  }
  return found;
}
