import * as v from "valibot";

export const signInSchema = v.object({
  school: v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  ),
  email: v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.email(),
    v.maxLength(254),
  ),
  password: v.pipe(v.string(), v.minLength(8), v.maxLength(256)),
});
