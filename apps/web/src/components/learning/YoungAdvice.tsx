import type { LessonBlock } from "@faridalms/domain/learning";
import type { YoungAdvice } from "@faridalms/domain/young-checks";

import {
  YOUNG_MAX_ITEMS,
  YOUNG_MAX_OPTIONS,
  YOUNG_MAX_QUESTIONS,
  youngAdvice,
} from "@faridalms/domain/young-checks";
import { CircleCheck, Lightbulb } from "lucide-react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

function adviceText(advice: YoungAdvice): string {
  switch (advice.kind) {
    case "questions":
      return m.lrnYoungTooManyQuestions({
        count: formatNumber(advice.count),
        limit: formatNumber(YOUNG_MAX_QUESTIONS),
      });
    case "options":
      return m.lrnYoungTooManyOptions({
        number: formatNumber(advice.question),
        count: formatNumber(advice.count),
        limit: formatNumber(YOUNG_MAX_OPTIONS),
      });
    case "items":
      return m.lrnYoungTooManyItems({
        number: formatNumber(advice.question),
        count: formatNumber(advice.count),
        limit: formatNumber(YOUNG_MAX_ITEMS),
      });
    case "unvoiced":
      return m.lrnYoungUnvoiced({ number: formatNumber(advice.question) });
    case "unvoicedText":
      return m.lrnYoungUnvoicedText();
  }
  return "";
}

export interface YoungAdviceListProps {
  blocks: readonly LessonBlock[];
}

/**
 * What would make the lesson fit young children better, beside the switch
 * that turns young mode on. Advice, not a block on showing the lesson.
 */
export function YoungAdviceList({ blocks }: YoungAdviceListProps) {
  const advice = youngAdvice(blocks);
  if (advice.length === 0)
    return (
      <p className="flex items-start gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
        <CircleCheck
          aria-hidden
          className="mt-px size-3.5 shrink-0 text-success"
        />
        {m.lrnYoungAdviceClear()}
      </p>
    );
  return (
    <ul
      aria-label={m.lrnYoungAdviceTitle()}
      className="grid gap-1.5 text-[13px] leading-[18px]"
    >
      {advice.map((item) => {
        const text = adviceText(item);
        return (
          <li key={text} className="flex items-start gap-1.5">
            <Lightbulb
              aria-hidden
              className="mt-px size-3.5 shrink-0 text-warning-foreground dark:text-warning"
            />
            {text}
          </li>
        );
      })}
    </ul>
  );
}
