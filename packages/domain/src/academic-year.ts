import * as v from "valibot";

export const SCHOOL_YEAR_STATUSES = ["planning", "active", "closed"] as const;
export type SchoolYearStatus = (typeof SCHOOL_YEAR_STATUSES)[number];

const yearId = v.pipe(v.string(), v.uuid());
const yearRevision = v.pipe(v.number(), v.integer(), v.minValue(1));

export const setYearStatusSchema = v.object({
  id: yearId,
  expectedRevision: yearRevision,
  status: v.picklist(SCHOOL_YEAR_STATUSES),
  reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ""),
});
export type SetYearStatusInput = v.InferOutput<typeof setYearStatusSchema>;

export const setDefaultYearSchema = v.object({
  id: yearId,
  expectedRevision: yearRevision,
});
export type SetDefaultYearInput = v.InferOutput<typeof setDefaultYearSchema>;

/**
 * Why a lifecycle change is refused, as a message key, or null when allowed.
 * A year is prepared, then taught, then closed; reopening a closed year is the
 * correction path and must say why. The default year is always the one being
 * taught, so it cannot be closed until another year takes its place.
 */
export function yearTransitionIssue(
  from: SchoolYearStatus,
  to: SchoolYearStatus,
  context: { isDefault: boolean; reason: string },
): string | null {
  const allowed =
    (from === "planning" && to === "active") ||
    (from === "active" && to === "closed") ||
    (from === "closed" && to === "active");
  if (!allowed) return "academic_year.transition";
  if (to === "closed" && context.isDefault)
    return "academic_year.default_closing";
  if (from === "closed" && !context.reason.trim())
    return "academic_year.reason_required";
  return null;
}

export const academicYearQuerySchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
});

const isoDate = v.pipe(v.string(), v.isoDate());

export const termSchema = v.pipe(
  v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32)),
    startsOn: isoDate,
    endsOn: isoDate,
  }),
  v.forward(
    v.check((value) => value.endsOn >= value.startsOn, "validation.end_date"),
    ["endsOn"],
  ),
);
export type TermInput = v.InferInput<typeof termSchema>;

interface DateSpan {
  startsOn: string;
  endsOn: string;
}

export type TermIssue = "term_outside" | "term_overlap" | "term_name_conflict";

/** The first thing wrong with a set of terms inside a year, or null when they fit. */
export function termIssue(
  year: DateSpan,
  terms: readonly (DateSpan & { name: string })[],
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
  const names = new Set<string>();
  for (const term of terms) {
    const key = term.name.trim().toLocaleLowerCase();
    if (names.has(key)) return "term_name_conflict";
    names.add(key);
  }
  return null;
}

function termsAvoid(
  value: DateSpan & { terms?: (DateSpan & { name: string })[] },
  issue: TermIssue,
): boolean {
  return (
    !value.terms ||
    value.endsOn < value.startsOn ||
    termIssue(value, value.terms) !== issue
  );
}

export const saveAcademicYearSchema = v.pipe(
  v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    expectedRevision: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1)),
    ),
    name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(16)),
    startsOn: isoDate,
    endsOn: isoDate,
    /** Absent leaves the year's terms untouched; present replaces them. */
    terms: v.optional(v.pipe(v.array(termSchema), v.maxLength(12))),
  }),
  v.forward(
    v.check((value) => value.endsOn >= value.startsOn, "validation.end_date"),
    ["endsOn"],
  ),
  v.forward(
    v.check(
      (value) => !value.id || value.expectedRevision !== undefined,
      "validation.revision",
    ),
    ["expectedRevision"],
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

export type SaveAcademicYearInput = v.InferInput<typeof saveAcademicYearSchema>;
