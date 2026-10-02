import * as v from "valibot";

export const pictureSearchSchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
});
