import * as v from "valibot";

/** How far back the change log reaches, as its When filter offers. */
export const CHANGE_PERIODS = [
  "day",
  "week",
  "month",
  "quarter",
  "all",
] as const;
export type ChangePeriod = (typeof CHANGE_PERIODS)[number];

export const CHANGE_PERIOD_NAMES: Record<ChangePeriod, string> = {
  day: "Last 24 hours",
  week: "Last 7 days",
  month: "Last 30 days",
  quarter: "Last 90 days",
  all: "Any time",
};

export const CHANGE_PERIOD_DAYS: Record<
  Exclude<ChangePeriod, "all">,
  number
> = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 90,
};

export const CHANGES_PER_PAGE = 50;

/** The change log's filters, as its URL and its server function take them. */
export const changeLogQuery = v.object({
  q: v.fallback(v.optional(v.pipe(v.string(), v.maxLength(200)), ""), ""),
  action: v.fallback(
    v.optional(
      v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(40)),
      [],
    ),
    [],
  ),
  by: v.fallback(
    v.optional(
      v.pipe(v.array(v.pipe(v.string(), v.maxLength(80))), v.maxLength(40)),
      [],
    ),
    [],
  ),
  when: v.fallback(v.optional(v.picklist(CHANGE_PERIODS), "all"), "all"),
  page: v.fallback(
    v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)),
      1,
    ),
    1,
  ),
});

export type ChangeLogQuery = v.InferOutput<typeof changeLogQuery>;
