import * as v from "valibot";

import { addDays, daysBetween } from "./school";

/**
 * A stretch of days a school reports over, such as a school year or one of
 * its terms, as a module names it. `endsBefore` is the day after the last.
 */
export interface ReportingSpan {
  key: string;
  titleEn: string | null;
  titleAr: string | null;
  from: string;
  endsBefore: string;
}

/** How far back a report reaches when no module names the spans a school reports over. */
export const DEFAULT_REPORT_WEEKS = 12;

/** The span a report covers by default where no module names one: the weeks up to and including `day`. */
export function defaultReportingSpan(day: string): {
  from: string;
  endsBefore: string;
} {
  return {
    from: addDays(day, 1 - DEFAULT_REPORT_WEEKS * 7),
    endsBefore: addDays(day, 1),
  };
}

/** The longest range a report reads at once. */
export const MAX_REPORT_DAYS = 400;

const isoDate = v.pipe(v.string(), v.isoDate());

/**
 * What a report covers: a span a module names, by key, or any range of
 * days. Empty fields take the default span.
 */
export const reportRangeEntries = {
  span: v.optional(v.pipe(v.string(), v.maxLength(80)), ""),
  from: v.optional(v.union([v.literal(""), isoDate]), ""),
  to: v.optional(v.union([v.literal(""), isoDate]), ""),
};

/** Whether a chosen range of days is one a report may read. */
export const rangeFits = (from: string, to: string) =>
  from <= to && daysBetween(from, to) <= MAX_REPORT_DAYS;
