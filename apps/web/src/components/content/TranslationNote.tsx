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

/**
 * Where a translation stands against its original, and who checked it.
 *
 * Editors draw it below the "Checked against the original" box, never above.
 * The note's words change when the editor hands its text to the page on
 * blur, which is the press of a click on that box; a note above it would
 * grow a line and move the box from under the pointer before the release,
 * and Safari then drops the click.
 */
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
