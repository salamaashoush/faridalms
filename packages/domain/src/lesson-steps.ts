import type { ContentDocument, ContentNode } from "./content";

import { contentPlainText } from "./content";

interface Steppable {
  id: string;
  type: string;
  content?: ContentDocument;
  /** Asked when the video above reaches this second. */
  videoAt?: number | null;
}

/** Whether a block shows anything: an empty line left after a question does not. */
const shows = (node: ContentNode) =>
  node.type !== "paragraph" ||
  contentPlainText({
    root: { type: "root", version: 1, children: [node] },
  }).trim() !== "";

/** Blocks a child reads or watches, which never end a screen by themselves. */
const READING = new Set(["content", "media"]);

/**
 * A text block cut at its dividers, so a teacher turns the page of a story
 * with a divider line. Each piece keeps an id of its own, derived from the
 * block's, that stays the same while the text does.
 */
function pages<B extends Steppable>(block: B): B[] {
  const { content } = block;
  if (block.type !== "content" || !content) return [block];
  const children = content.root.children ?? [];
  const cut: (typeof children)[] = [[]];
  for (const child of children) {
    if (child.type === "horizontalrule") cut.push([]);
    else if (shows(child)) cut.at(-1)?.push(child);
  }
  const kept = cut.filter((nodes) => nodes.length > 0);
  return kept.map((nodes, index) => ({
    ...block,
    id: index === 0 ? block.id : `${block.id}:${index}`,
    content: { root: { ...content.root, children: nodes } },
  }));
}

/**
 * A lesson for young children as the screens it is shown on, one at a time:
 * each question closes a screen with the words and pictures above it, and a
 * continue gate or a divider in the text starts a new one. A question asked
 * at a moment in a video stays on the video's screen, for the video to stop
 * and ask it there.
 */
export function lessonSteps<B extends Steppable>(blocks: readonly B[]): B[][] {
  const steps: B[][] = [];
  let current: B[] = [];
  const close = () => {
    if (current.length > 0) steps.push(current);
    current = [];
  };
  for (const block of blocks) {
    if (block.type === "gate") {
      close();
      continue;
    }
    const pieces = pages(block);
    pieces.forEach((piece, index) => {
      if (index > 0) close();
      current.push(piece);
    });
    const timed = typeof block.videoAt === "number";
    if (!READING.has(block.type) && !timed) close();
  }
  close();
  return steps;
}
