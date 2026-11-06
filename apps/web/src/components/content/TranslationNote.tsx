import type { TranslationState } from "@faridalms/domain/translations";

import { cn } from "@faridalms/ui/cn";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatInstant } from "~/utils/datetime";

interface Review {
  at: string;
  byEn: string | null;
  byAr: string | null;
  current: boolean;
}

export interface TranslationNoteProps {
  state: TranslationState;
  review: Review | null;
  language: string;
}

/** Where a translation stands against its original, and who checked it. */
export function TranslationNote({
  state,
  review,
  language,
}: TranslationNoteProps) {
  const text =
    state === "missing"
      ? m.translationMissing({ language })
      : state === "unreviewed"
        ? m.translationUnreviewed()
        : state === "stale"
          ? m.translationStale()
          : review
            ? m.translationReviewed({
                name: inLocale(review.byEn, review.byAr),
                date: formatInstant(review.at),
              })
            : "";
  return (
    <p
      className={cn(
        "text-[13px] leading-[18px]",
        state === "reviewed"
          ? "text-muted-foreground"
          : "text-warning-foreground dark:text-warning",
      )}
    >
      {text}
    </p>
  );
}
