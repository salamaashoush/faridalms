import * as v from "valibot";

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(1));
const isoDate = v.pipe(v.string(), v.isoDate());
const optionalId = v.optional(v.union([v.literal(""), id]), "");

const optionalText = (max: number) =>
  v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.maxLength(max),
      v.transform((value) => (value === "" ? null : value)),
    ),
    "",
  );

export const homeroomDirectorySchema = v.object({
  year: optionalId,
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  grade: v.optional(v.array(id), []),
});
export type HomeroomDirectoryQuery = v.InferOutput<
  typeof homeroomDirectorySchema
>;

export const saveHomeroomSchema = v.pipe(
  v.object({
    id: v.optional(id),
    expectedVersion: v.optional(version),
    yearId: id,
    code: v.pipe(
      v.string(),
      v.trim(),
      v.regex(/^[A-Za-z0-9_.-]{1,40}$/, "validation.class_code"),
    ),
    titleEn: optionalText(120),
    titleAr: optionalText(120),
    gradeId: optionalId,
    locationId: optionalId,
    homeroomTeacherId: optionalId,
    subjects: v.pipe(
      v.array(
        v.object({
          subjectId: id,
          teacherIds: v.pipe(v.array(id), v.maxLength(4)),
        }),
      ),
      v.maxLength(30),
    ),
  }),
  v.forward(
    v.check(
      (value) => Boolean(value.titleEn || value.titleAr),
      "validation.name_required",
    ),
    ["titleEn"],
  ),
  v.forward(
    v.check(
      (value) =>
        new Set(value.subjects.map((row) => row.subjectId)).size ===
        value.subjects.length,
      "validation.subject_twice",
    ),
    ["subjects"],
  ),
);
export type SaveHomeroomInput = v.InferInput<typeof saveHomeroomSchema>;

export const ofClassSchema = v.object({
  classId: id,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const placeSchema = v.object({
  studentId: id,
  classId: id,
  from: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const leaveHomeroomSchema = v.object({
  studentId: id,
  enrollmentId: id,
  expectedVersion: version,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

/** A span of days, `to` the first day after it. */
export interface Span {
  from: string;
  to: string;
}

/**
 * The days a member of a homeroom sits in one of its subject classes: their
 * days in the homeroom from the day the class joined it, or none.
 */
export function followingSpan(member: Span, linkedOn: string): Span | null {
  const from = member.from > linkedOn ? member.from : linkedOn;
  return from < member.to ? { from, to: member.to } : null;
}

/**
 * What ending a span on a day leaves of it: the days before, or nothing
 * when it had not begun by then; a span already over by then is kept.
 */
export function endedOn(span: Span, on: string): Span | null | "kept" {
  if (span.to <= on) return "kept";
  return span.from < on ? { from: span.from, to: on } : null;
}

/**
 * The spans a member's enrolments in one subject class should have, given
 * their days in the homeroom, the day the class joined it, and the days
 * they are already in the class by another enrolment, which are left out
 * whole so the two never overlap.
 */
export function followingSpans(
  members: readonly Span[],
  linkedOn: string,
  besides: readonly Span[],
): Span[] {
  return members.flatMap((member) => {
    const span = followingSpan(member, linkedOn);
    if (!span) return [];
    return besides.some((other) => other.from < span.to && span.from < other.to)
      ? []
      : [span];
  });
}
