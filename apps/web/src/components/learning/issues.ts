import type { LessonBlock } from "@faridalms/domain/learning";

import {
  MAX_GAPS,
  needsCaptions,
  needsTranscript,
} from "@faridalms/domain/learning";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

/** What stops a question going in front of students, in the teacher's words. */
export function blockIssue(block: LessonBlock): string | null {
  if ("prompt" in block && !block.prompt.trim()) return m.lrnPromptNeeded();
  switch (block.type) {
    case "choice": {
      const filled = block.options.filter((option) => option.text.trim());
      if (filled.length < 2) return m.lrnOptionsNeeded();
      if (
        !block.correctOptionIds.some((optionId) =>
          filled.some((option) => option.id === optionId),
        )
      )
        return m.lrnCorrectNeeded();
      return null;
    }
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
    case "number":
      return block.mode === "range" && block.min > block.max
        ? m.lrnRangeOrder()
        : null;
    case "matching": {
      const started = block.pairs.filter(
        (pair) => pair.prompt.trim() || pair.answer.trim(),
      );
      if (started.some((pair) => !pair.prompt.trim() || !pair.answer.trim()))
        return m.lrnPairIncomplete();
      return started.length < 2 ? m.lrnPairsNeeded() : null;
    }
    case "ordering":
      return block.items.filter((item) => item.text.trim()).length < 2
        ? m.lrnItemsNeeded()
        : null;
    case "sorting":
      if (block.groups.some((group) => !group.name.trim()))
        return m.lrnGroupNameNeeded();
      return block.items.filter((item) => item.text.trim()).length < 2
        ? m.lrnItemsNeeded()
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
