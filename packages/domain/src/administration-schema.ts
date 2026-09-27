import * as v from "valibot";

const id = v.pipe(v.string(), v.uuid());
const requiredText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
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
export type PublishNewsletterInput = v.InferInput<
  typeof publishNewsletterSchema
>;
