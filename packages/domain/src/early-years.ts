import * as v from "valibot";

/** Whether a class is for young children, chosen on its form. */
export const youngClassPartSchema = v.object({ young: v.boolean() });

/** The class whose own mark the class form starts from. */
export const youngClassSchema = v.object({
  classId: v.pipe(v.string(), v.uuid()),
});
