import type { LessonBlock } from "@faridalms/domain/learning";

import {
  MAX_GAPS,
  needsCaptions,
  needsTranscript,
  partName,
} from "@faridalms/domain/learning";
import { solves } from "@faridalms/puzzles/run";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

/** What stops a question going in front of students, in the teacher's words. */
type Pair = Extract<LessonBlock, { type: "matching" }>["pairs"][number];

const sides = (pair: Pair) => [
  partName({ text: pair.prompt, picture: pair.promptPicture }),
  partName({ text: pair.answer, picture: pair.answerPicture }),
];

/** Whether any part shows a picture with neither words nor a description. */
function unnamedPicture(block: LessonBlock): boolean {
  const parts =
    block.type === "choice" || block.type === "poll"
      ? block.options
      : block.type === "ordering" || block.type === "sorting"
        ? block.items
        : block.type === "matching"
          ? [
              ...block.pairs.flatMap((pair) => [
                { text: pair.prompt, picture: pair.promptPicture },
                { text: pair.answer, picture: pair.answerPicture },
              ]),
              ...block.distractors,
            ]
          : [];
  return parts.some((part) => part.picture && !partName(part));
}

export function blockIssue(block: LessonBlock): string | null {
  if ("prompt" in block && !block.prompt.trim()) return m.lrnPromptNeeded();
  if (unnamedPicture(block)) return m.lrnPictureUnnamed();
  switch (block.type) {
    case "choice": {
      const filled = block.options.filter((option) => partName(option));
      if (filled.length < 2) return m.lrnOptionsNeeded();
      if (
        !block.correctOptionIds.some((optionId) =>
          filled.some((option) => option.id === optionId),
        )
      )
        return m.lrnCorrectNeeded();
      return null;
    }
    case "poll":
      return block.options.filter((option) => partName(option)).length < 2
        ? m.lrnOptionsNeeded()
        : null;
    case "text":
      return block.answers.some((answer) => answer.trim())
        ? null
        : m.lrnAnswersNeeded();
    case "gaps": {
      const gaps = block.segments.filter((segment) => segment.type === "gap");
      if (gaps.length === 0) return m.lrnGapsNeeded();
      if (gaps.length > MAX_GAPS)
        return m.lrnGapsTooMany({ count: formatNumber(MAX_GAPS) });
      if (gaps.some((gap) => gap.answers.length === 0)) return m.lrnGapEmpty();
      if (gaps.some((gap) => gap.options.length === 1))
        return m.lrnGapChoices();
      return null;
    }
    case "math":
      return block.answers.length > 0 ? null : m.lrnAnswersNeeded();
    case "number":
      return block.mode === "range" && block.min > block.max
        ? m.lrnRangeOrder()
        : null;
    case "matching": {
      const started = block.pairs.filter((pair) => sides(pair).some(Boolean));
      if (started.some((pair) => !sides(pair).every(Boolean)))
        return m.lrnPairIncomplete();
      return started.length < 2 ? m.lrnPairsNeeded() : null;
    }
    case "ordering":
      return block.items.filter((item) => partName(item)).length < 2
        ? m.lrnItemsNeeded()
        : null;
    case "parsons":
      return block.lines.length < 2 ? m.lrnLinesNeeded() : null;
    case "puzzle":
      return solves(block.level, block.level.solution)
        ? null
        : m.lrnPuzzleUnsolved();
    case "program":
      if (block.tests.length === 0) return m.lrnTestsNeeded();
      return block.tests.some((test) => !test.expected.trim())
        ? m.lrnTestOutputNeeded()
        : null;
    case "sorting":
      if (block.groups.some((group) => !group.name.trim()))
        return m.lrnGroupNameNeeded();
      return block.items.filter((item) => partName(item)).length < 2
        ? m.lrnItemsNeeded()
        : null;
    case "hotspot":
      if (!block.picture) return m.lrnHotspotPicture();
      if (!block.places.some((place) => place.correct))
        return m.lrnHotspotPlaces();
      return block.places.some((place) => !place.name)
        ? m.lrnHotspotNames()
        : null;
    case "media":
      if (needsCaptions(block.mediaType) && !block.captionsFileId)
        return m.lrnErrCaptions();
      if (
        needsTranscript(block.mediaType) &&
        !block.captionsFileId &&
        !block.transcript.trim()
      )
        return m.lrnTranscriptNeeded();
      return null;
    default:
      return null;
  }
}
