import * as v from "valibot";

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(1));
const isoDate = v.pipe(v.string(), v.isoDate());

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

const code = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^[A-Za-z0-9_.-]{1,40}$/, "validation.class_code"),
);

export const classDirectorySchema = v.object({
  year: v.optional(v.union([v.literal(""), id]), ""),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  grade: v.optional(v.array(id), []),
});
export type ClassDirectoryQuery = v.InferOutput<typeof classDirectorySchema>;

export const classYearSchema = v.object({
  year: v.optional(v.union([v.literal(""), id]), ""),
});

export const classRecordSchema = v.object({
  id,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const saveClassSchema = v.pipe(
  v.object({
    id: v.optional(id),
    expectedVersion: v.optional(version),
    yearId: id,
    code,
    titleEn: optionalText(120),
    titleAr: optionalText(120),
    subjectId: v.optional(v.union([v.literal(""), id]), ""),
    gradeId: v.optional(v.union([v.literal(""), id]), ""),
    locationId: v.optional(v.union([v.literal(""), id]), ""),
    /** The first is the class's primary teacher. */
    teacherIds: v.pipe(v.array(id), v.maxLength(4)),
  }),
  v.forward(
    v.check(
      (value) => Boolean(value.titleEn || value.titleAr),
      "validation.name_required",
    ),
    ["titleEn"],
  ),
);
export type SaveClassInput = v.InferInput<typeof saveClassSchema>;

export const enrolStudentSchema = v.object({
  studentId: id,
  classId: id,
  from: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const withdrawStudentSchema = v.object({
  studentId: id,
  enrollmentId: id,
  expectedVersion: version,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const saveSubjectSchema = v.pipe(
  v.object({
    id: v.optional(id),
    code: v.pipe(
      v.string(),
      v.trim(),
      v.toLowerCase(),
      v.regex(/^[a-z][a-z0-9_]{1,39}$/, "validation.subject_code"),
    ),
    labelEn: optionalText(80),
    labelAr: optionalText(80),
    color: v.optional(
      v.union([v.literal(""), v.pipe(v.string(), v.regex(/^#[0-9a-f]{6}$/i))]),
      "",
    ),
    expected: v.optional(
      v.object({ labelEn: v.string(), labelAr: v.string() }),
    ),
  }),
  v.forward(
    v.check(
      (value) => Boolean(value.labelEn || value.labelAr),
      "validation.name_required",
    ),
    ["labelEn"],
  ),
  v.check(
    (value) => !value.id || value.expected !== undefined,
    "validation.invalid",
  ),
);
