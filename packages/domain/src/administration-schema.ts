import * as v from "valibot";

import { ROLES } from "./identity";

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const requiredText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
export const saveUserSchema = v.pipe(
  v.object({
    id: v.optional(id),
    name: requiredText(128),
    email: v.pipe(v.string(), v.trim(), v.email(), v.maxLength(255)),
    role: v.picklist(ROLES),
    title: v.optional(v.pipe(v.string(), v.maxLength(128)), ""),
    password: v.optional(
      v.union([
        v.literal(""),
        v.pipe(v.string(), v.minLength(12), v.maxLength(128)),
      ]),
      "",
    ),
    isActive: v.boolean(),
  }),
  v.forward(
    v.check(
      (value) => Boolean(value.id) || value.password.length >= 12,
      "validation.new_password",
    ),
    ["password"],
  ),
);
export const saveStudentSchema = v.object({
  id: v.optional(id),
  reference: requiredText(24),
  firstName: requiredText(64),
  lastName: requiredText(64),
  birthdate: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
    "",
  ),
  classId: optionalId,
  guardianIds: v.optional(v.pipe(v.array(id), v.maxLength(20)), []),
  userId: optionalId,
});
export const saveClassSchema = v.object({
  id: v.optional(id),
  name: requiredText(32),
  grade: requiredText(16),
  stage: v.picklist(["early_years", "primary", "middle"]),
  room: v.optional(v.pipe(v.string(), v.maxLength(32)), ""),
  homeroomTeacherId: optionalId,
  subjects: v.array(v.object({ subjectId: id, teacherId: id })),
});
export type SaveUserInput = v.InferInput<typeof saveUserSchema>;
export type SaveStudentInput = v.InferInput<typeof saveStudentSchema>;
export type SaveClassInput = v.InferInput<typeof saveClassSchema>;
export const managementOptionsSchema = v.object({
  selectedIds: v.optional(v.pipe(v.array(id), v.maxLength(20)), []),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
  kind: v.picklist(["classes", "teachers", "parents", "students", "subjects"]),
});

export const schoolProfileSchema = v.object({
  name: requiredText(160),
  timeZone: v.pipe(
    v.string(),
    v.check((value) => {
      try {
        return Boolean(
          new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
            .timeZone,
        );
      } catch {
        return false;
      }
    }, "validation.time_zone"),
  ),
});
export const saveSubjectSchema = v.object({
  id: v.optional(id),
  slug: v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
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
export type SchoolProfileInput = v.InferInput<typeof schoolProfileSchema>;
export type SaveSubjectInput = v.InferInput<typeof saveSubjectSchema>;
export type PublishNewsletterInput = v.InferInput<
  typeof publishNewsletterSchema
>;
