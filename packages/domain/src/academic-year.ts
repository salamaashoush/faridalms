import * as v from "valibot";

export const academicYearQuerySchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
});

export const saveAcademicYearSchema = v.pipe(
  v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    expectedRevision: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1)),
    ),
    name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(16)),
    startsOn: v.pipe(v.string(), v.isoDate()),
    endsOn: v.pipe(v.string(), v.isoDate()),
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
);

export type SaveAcademicYearInput = v.InferInput<typeof saveAcademicYearSchema>;
