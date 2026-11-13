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

const viewValue = v.pipe(v.string(), v.maxLength(64));

/**
 * What a module narrows a list to, by the key it answers for: a year, or
 * several grades, say. Each value is read by the module's own schema.
 */
export const viewsSchema = v.optional(
  v.record(
    v.pipe(v.string(), v.regex(/^[a-z]{1,20}$/)),
    v.union([viewValue, v.pipe(v.array(viewValue), v.maxLength(30))]),
  ),
  {},
);
export type Views = v.InferOutput<typeof viewsSchema>;

/**
 * What a module keeps about a record as the record's lists and forms carry
 * it: named values, each one or several ids or words.
 */
export const partValueSchema = v.record(
  v.pipe(v.string(), v.maxLength(40)),
  v.union([
    v.pipe(v.string(), v.maxLength(200)),
    v.pipe(v.array(v.pipe(v.string(), v.maxLength(200))), v.maxLength(60)),
  ]),
);
export type PartValue = v.InferOutput<typeof partValueSchema>;

export const classDirectorySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  ended: v.optional(v.boolean(), false),
});
export type ClassDirectoryQuery = v.InferOutput<typeof classDirectorySchema>;

export const classDirectoryInputSchema = v.object({
  ...classDirectorySchema.entries,
  views: viewsSchema,
});

export const classesMineSchema = v.object({ views: viewsSchema });

export const classRecordSchema = v.object({
  id,
  on: v.optional(v.union([v.literal(""), isoDate]), ""),
});

export const saveClassSchema = v.pipe(
  v.object({
    id: v.optional(id),
    expectedVersion: v.optional(version),
    code,
    titleEn: optionalText(120),
    titleAr: optionalText(120),
    subjectId: v.optional(v.union([v.literal(""), id]), ""),
    locationId: v.optional(v.union([v.literal(""), id]), ""),
    /** The first is the class's primary teacher. */
    teacherIds: v.pipe(v.array(id), v.maxLength(4)),
    startsOn: isoDate,
    /** Its last day; empty for a class that keeps running. */
    endsOn: v.optional(v.union([v.literal(""), isoDate]), ""),
    /** What modules keep about the class, each read by its own schema. */
    parts: v.optional(v.record(v.string(), v.unknown()), {}),
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
      (value) => value.endsOn === "" || value.endsOn >= value.startsOn,
      "validation.ends_before_start",
    ),
    ["endsOn"],
  ),
);
export type SaveClassInput = v.InferInput<typeof saveClassSchema>;

export const saveGroupSchema = v.object({
  id: v.optional(id),
  classId: id,
  titleEn: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)), ""),
  titleAr: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)), ""),
  studentIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(500)),
});

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
