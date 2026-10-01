import type { GradeBand, GradeView } from "@faridalms/domain/grading";

import { formatScore } from "~/components/coursework/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

export function gradeLabel(grade: GradeView): string {
  return inLocale(grade.labelEn, grade.labelAr);
}

/** A scale's bands in a line, highest first: "A* 90% · A 80% · …". */
export function bandsLine(bands: readonly GradeBand[]): string {
  return bands
    .toSorted((a, b) => b.minPercent - a.minPercent)
    .map((band) =>
      m.gradingBandFrom({
        label: inLocale(band.labelEn, band.labelAr),
        percent: formatNumber(band.minPercent),
      }),
    )
    .join(" · ");
}

/**
 * A result as its reader sees it. Teachers always see the score beside the
 * grade; students and families see what the scale shows them.
 */
export function resultText(
  grade: GradeView | null | undefined,
  score: number | null,
  points: number | null,
  reader: "teacher" | "learner",
): string {
  const scored = formatScore(score, points);
  if (!grade) return scored;
  if (reader === "learner" && grade.display === "grade")
    return gradeLabel(grade);
  return scored
    ? m.gradingWithScore({ grade: gradeLabel(grade), score: scored })
    : gradeLabel(grade);
}
