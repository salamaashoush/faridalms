import type { ContentNode } from "./content";
import type { LessonBlock } from "./learning";

import { voiceCanRead } from "./arabic";
import { isCheck, partName } from "./learning";

/** Choices a child of three to eight weighs at once. */
export const YOUNG_MAX_OPTIONS = 4;
/** Cards, items or tiles on one screen at the sizes young hands need. */
export const YOUNG_MAX_ITEMS = 8;
/** Questions in one sitting, kept short for the youngest. */
export const YOUNG_MAX_QUESTIONS = 8;

export type YoungAdvice =
  | { kind: "questions"; count: number }
  | { kind: "options"; question: number; count: number }
  | { kind: "items"; question: number; count: number }
  | { kind: "unvoiced"; question: number }
  | { kind: "unvoicedText" };

interface Voiced {
  text: string;
  narration?: string | null | undefined;
}

const silent = (part: Voiced) =>
  !part.narration && part.text.trim() !== "" && !voiceCanRead(part.text);

/** The words a question says aloud, each with the recording that may stand in. */
function voicedParts(block: LessonBlock): Voiced[] {
  if (!isCheck(block)) return [];
  const prompt = { text: block.prompt, narration: block.narration };
  switch (block.type) {
    case "choice":
      return [
        prompt,
        ...block.options.map((option) => ({
          text: partName(option),
          narration: option.narration,
        })),
      ];
    case "matching":
      return [
        prompt,
        ...block.pairs.flatMap((pair) => [
          {
            text: partName({ text: pair.prompt, picture: pair.promptPicture }),
            narration: pair.promptNarration,
          },
          {
            text: partName({ text: pair.answer, picture: pair.answerPicture }),
            narration: pair.answerNarration,
          },
        ]),
        ...block.distractors.map((part) => ({
          text: partName(part),
          narration: part.narration,
        })),
      ];
    case "ordering":
      return [
        prompt,
        ...block.items.map((item) => ({
          text: partName(item),
          narration: item.narration,
        })),
      ];
    case "sorting":
      return [
        prompt,
        ...block.groups.map((group) => ({
          text: group.name,
          narration: group.narration,
        })),
        ...block.items.map((item) => ({
          text: partName(item),
          narration: item.narration,
        })),
      ];
    default:
      return [prompt];
  }
}

function itemsOf(block: LessonBlock): number {
  switch (block.type) {
    case "matching":
      return block.pairs.length * 2 + block.distractors.length;
    case "ordering":
    case "sorting":
      return block.items.length;
    case "spelling":
      return block.tiles.length + block.extras.length;
    default:
      return 0;
  }
}

function nodeText(node: ContentNode): string {
  return (node.text ?? "") + (node.children ?? []).map(nodeText).join("");
}

/**
 * What to change before a lesson suits young children: too many questions,
 * choices or cards for a screen, and Arabic that no voice can read because
 * it has neither its vowel marks nor the teacher's recording. Advice only;
 * the teacher may know their class better.
 */
export function youngAdvice(blocks: readonly LessonBlock[]): YoungAdvice[] {
  const advice: YoungAdvice[] = [];
  const checks = blocks.filter(isCheck);
  if (checks.length > YOUNG_MAX_QUESTIONS)
    advice.push({ kind: "questions", count: checks.length });
  checks.forEach((block, index) => {
    const question = index + 1;
    if (block.type === "choice" && block.options.length > YOUNG_MAX_OPTIONS)
      advice.push({ kind: "options", question, count: block.options.length });
    const items = itemsOf(block);
    if (items > YOUNG_MAX_ITEMS)
      advice.push({ kind: "items", question, count: items });
    if (voicedParts(block).some(silent))
      advice.push({ kind: "unvoiced", question });
  });
  const unvoicedText = blocks.some(
    (block) =>
      block.type === "content" &&
      (block.content.root.children ?? []).some((node) =>
        silent({ text: nodeText(node), narration: node.$?.narration }),
      ),
  );
  if (unvoicedText) advice.push({ kind: "unvoicedText" });
  return advice;
}
