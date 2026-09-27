import * as v from "valibot";

export const YEAR_LIFECYCLES = ["upcoming", "current", "closed"] as const;
export type YearLifecycle = (typeof YEAR_LIFECYCLES)[number];

export const YEAR_ACTIONS = ["make_current", "close", "reopen"] as const;
export type YearAction = (typeof YEAR_ACTIONS)[number];

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(1));
const isoDate = v.pipe(v.string(), v.isoDate());

const title = v.optional(
  v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(80),
    v.transform((value) => (value === "" ? null : value)),
  ),
  "",
);

interface DateSpan {
  startsOn: string;
  endsOn: string;
}

interface Titled {
  titleEn: string | null;
  titleAr: string | null;
}

export type TermIssue = "term_outside" | "term_overlap" | "term_name_conflict";

/** The first thing wrong with a set of terms inside a year, or null when they fit. */
export function termIssue(
  year: DateSpan,
  terms: readonly (DateSpan & Titled)[],
): TermIssue | null {
  if (
    terms.some(
      (term) => term.startsOn < year.startsOn || term.endsOn > year.endsOn,
    )
  )
    return "term_outside";
  const ordered = terms.toSorted((a, b) =>
    a.startsOn.localeCompare(b.startsOn),
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous && current && current.startsOn <= previous.endsOn)
      return "term_overlap";
  }
  for (const key of ["titleEn", "titleAr"] as const) {
    const names = new Set<string>();
    for (const term of terms) {
      const name = term[key]?.trim().toLocaleLowerCase();
      if (!name) continue;
      if (names.has(name)) return "term_name_conflict";
      names.add(name);
    }
  }
  return null;
}

export const termSchema = v.pipe(
  v.object({
    id: v.optional(id),
    titleEn: title,
    titleAr: title,
    startsOn: isoDate,
    endsOn: isoDate,
  }),
  v.forward(
    v.check(
      (value) => value.titleEn !== null || value.titleAr !== null,
      "validation.name_required",
    ),
    ["titleEn"],
  ),
  v.forward(
    v.check((value) => value.endsOn >= value.startsOn, "validation.end_date"),
    ["endsOn"],
  ),
);

function termsAvoid(
  value: DateSpan & { terms: (DateSpan & Titled)[] },
  issue: TermIssue,
): boolean {
  return (
    value.endsOn < value.startsOn || termIssue(value, value.terms) !== issue
  );
}

/** A year's names and inclusive dates with its terms, which replace the ones it has. */
export const saveYearSchema = v.pipe(
  v.object({
    id: v.optional(id),
    expectedVersion: v.optional(version),
    titleEn: title,
    titleAr: title,
    startsOn: isoDate,
    endsOn: isoDate,
    terms: v.pipe(v.array(termSchema), v.maxLength(12)),
  }),
  v.forward(
    v.check(
      (value) => value.titleEn !== null || value.titleAr !== null,
      "validation.name_required",
    ),
    ["titleEn"],
  ),
  v.forward(
    v.check((value) => value.endsOn >= value.startsOn, "validation.end_date"),
    ["endsOn"],
  ),
  v.forward(
    v.check(
      (value) => !value.id || value.expectedVersion !== undefined,
      "validation.revision",
    ),
    ["expectedVersion"],
  ),
  v.forward(
    v.check(
      (value) => termsAvoid(value, "term_outside"),
      "validation.term_outside",
    ),
    ["terms"],
  ),
  v.forward(
    v.check(
      (value) => termsAvoid(value, "term_overlap"),
      "validation.term_overlap",
    ),
    ["terms"],
  ),
  v.forward(
    v.check(
      (value) => termsAvoid(value, "term_name_conflict"),
      "validation.term_name_conflict",
    ),
    ["terms"],
  ),
);
export type SaveYearInput = v.InferInput<typeof saveYearSchema>;
export type SaveYear = v.InferOutput<typeof saveYearSchema>;

export const yearLifecycleSchema = v.object({
  id,
  expectedVersion: version,
  action: v.picklist(YEAR_ACTIONS),
  reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ""),
});
export type YearLifecycleInput = v.InferOutput<typeof yearLifecycleSchema>;

/**
 * Why a lifecycle step is refused, as a message key, or null when allowed.
 * An upcoming year becomes current in its own step, which closes the year it
 * replaces, so the current year is never closed directly. Reopening a closed
 * year is the correction path and must say why; it leaves the year open but
 * not current.
 */
export function yearTransitionIssue(
  from: YearLifecycle,
  action: YearAction,
  context: { reason: string },
): string | null {
  if (action === "make_current")
    return from === "upcoming" ? null : "school_year.transition";
  if (action === "close") {
    if (from === "current") return "school_year.current_closing";
    return from === "upcoming" ? null : "school_year.transition";
  }
  if (from !== "closed") return "school_year.transition";
  return context.reason.trim() ? null : "school_year.reason_required";
}

export type YearStanding = "current" | "upcoming" | "open" | "closed";

/**
 * What a year is to a reader: the current year, a year not yet started, a
 * past year reopened for corrections, or a closed one.
 */
export function yearStanding(
  year: { lifecycle: YearLifecycle; startsOn: string },
  today: string,
): YearStanding {
  if (year.lifecycle !== "upcoming") return year.lifecycle;
  return year.startsOn > today ? "upcoming" : "open";
}
