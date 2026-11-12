import type { GradeBand, GradeView } from "@faridalms/domain/grading";

import { formatScore } from "~/components/coursework/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

// First-strong isolates, built from code points since the formatter turns
// escapes into invisible literal characters.
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);

/**
 * Parts such as a grade and its points, each kept in its own direction so a
 * mixed line reads in order in either language.
 */
function isolatedLine(parts: readonly (string | null | undefined)[]) {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => `${FSI}${part}${PDI}`)
    .join(" · ");
}

export function gradeLabel(grade: GradeView): string {
  return inLocale(grade.labelEn, grade.labelAr);
}

/**
 * A scale's bands in a line, highest first: "A* 90% · A 80% · …". Each band's
 * own spaces are non-breaking, so a wrap falls between bands, never inside one.
 */
export function bandsLine(bands: readonly GradeBand[]): string {
  return isolatedLine(
    bands
      .toSorted((a, b) => b.minPercent - a.minPercent)
      .map((band) =>
        m
          .gradingBandFrom({
            label: inLocale(band.labelEn, band.labelAr),
            percent: formatNumber(band.minPercent),
          })
          .replaceAll(" ", "\u00a0"),
      ),
  );
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
  return scored ? gradeWithScore(grade, scored) : gradeLabel(grade);
}

/**
 * The label is isolated because a Latin grade such as "A" would otherwise pull
 * the score beside it into its own direction, putting the score first in an
 * Arabic line.
 */
export function gradeWithScore(grade: GradeView, score: string): string {
  return m.gradingWithScore({
    grade: isolatedLine([gradeLabel(grade)]),
    score,
  });
}

/** A programme's categories in a line: "Coursework 40% · Tests 60%". */
export function weightsLine(
  categories: readonly {
    titleEn: string | null;
    titleAr: string | null;
    weight: number;
  }[],
): string {
  return isolatedLine(
    categories.map((row) =>
      m
        .courseworkCategoryWeight({
          category: inLocale(row.titleEn, row.titleAr),
          weight: formatNumber(row.weight),
        })
        .replaceAll(" ", "\u00a0"),
    ),
  );
}
