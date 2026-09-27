import * as v from "valibot";

const id = v.pipe(v.string(), v.uuid());
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
