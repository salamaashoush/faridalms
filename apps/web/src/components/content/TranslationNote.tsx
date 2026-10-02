import type { TranslationState } from "@faridalms/domain/translations";

import { cn } from "@faridalms/ui/cn";

import { formatInstant } from "~/components/coursework/format";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

interface Review {
  at: string;
  byEn: string | null;
  byAr: string | null;
  current: boolean;
}

/** Where a translation stands against its original, and who checked it. */
export function TranslationNote({
  state,
  review,
  language,
}: {
  state: TranslationState;
  review: Review | null;
  language: string;
}) {
  const user = useCurrentUser();
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
                date: formatInstant(review.at, user.school.timeZone),
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
