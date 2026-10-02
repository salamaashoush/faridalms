/** A badge stays valid this long after it was last used. */
export const BADGE_DAYS = 180;

/**
 * The end of the school year a badge is printed in: the year holding today,
 * or in the summer the year about to start. Badges are renewed each year, so
 * none outlasts it; a school with no such year gives the plain sliding term.
 */
export function badgeYearEnd(
  years: readonly { startsOn: string; endsBefore: string }[],
  today: string,
  otherwise: Date,
): Date {
  const year =
    years.find((row) => row.startsOn <= today && today < row.endsBefore) ??
    years
      .filter((row) => row.startsOn > today)
      .toSorted((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
  return year ? new Date(`${year.endsBefore}T00:00:00Z`) : otherwise;
}
