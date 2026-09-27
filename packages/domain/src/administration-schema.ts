import * as v from "valibot";

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const requiredText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
export const saveClassSchema = v.object({
  id: v.optional(id),
  name: requiredText(32),
  grade: requiredText(16),
  stage: v.picklist(["early_years", "primary", "middle"]),
  room: v.optional(v.pipe(v.string(), v.maxLength(32)), ""),
  homeroomTeacherId: optionalId,
  subjects: v.array(v.object({ subjectId: id, teacherId: id })),
});
export type SaveClassInput = v.InferInput<typeof saveClassSchema>;
export const managementOptionsSchema = v.object({
  selectedIds: v.optional(v.pipe(v.array(id), v.maxLength(20)), []),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
  kind: v.picklist(["classes", "teachers", "parents", "students", "subjects"]),
  // Student accounts already linked to a student are left out, except the one
  // linked to this student, which it may keep.
  studentId: v.optional(id),
});
export type ManagementOptionsInput = v.InferInput<
  typeof managementOptionsSchema
>;

export const saveSubjectSchema = v.object({
  id: v.optional(id),
  slug: v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "validation.subject_code"),
    v.maxLength(48),
  ),
  name: requiredText(128),
  nameAr: requiredText(128),
});
export const publishNewsletterSchema = v.object({
  title: requiredText(255),
  summary: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(10000)),
  url: v.pipe(
    v.string(),
    v.url(),
    v.check(
      (value) => new URL(value).protocol === "https:",
      "validation.https",
    ),
  ),
  publishedOn: v.pipe(v.string(), v.isoDate()),
});
export type SaveSubjectInput = v.InferInput<typeof saveSubjectSchema>;
export type PublishNewsletterInput = v.InferInput<
  typeof publishNewsletterSchema
>;
