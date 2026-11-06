import type { YearStanding } from "@faridalms/domain/years";
import type { Tone } from "@faridalms/ui/system/status";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";

import { lastDay } from "../people/format";

export const STANDING_LABEL: Record<YearStanding, () => string> = {
  current: m.yearsCurrent,
  upcoming: m.yearsUpcoming,
  open: m.yearsOpen,
  closed: m.yearsClosed,
};

export const STANDING_TONE: Record<YearStanding, Tone> = {
  current: "success",
  upcoming: "info",
  open: "warning",
  closed: "neutral",
};

export function yearTitle(year: {
  titleEn: string | null;
  titleAr: string | null;
}) {
  return inLocale(year.titleEn, year.titleAr);
}

export function yearDates(year: { startsOn: string; endsBefore: string }) {
  return m.accessDuring({
    from: formatDate(year.startsOn),
    to: formatDate(lastDay(year.endsBefore)),
  });
}
