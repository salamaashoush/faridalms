import * as v from "valibot";

export const SESSION_CONTEXTS = ["staff", "family", "student"] as const;

export const signInSchema = v.object({
  loginName: v.pipe(
    v.string(),
    v.trim(),
    v.transform((value) => value.normalize("NFC").toLowerCase()),
    v.minLength(1),
    v.maxLength(254),
  ),
  password: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  context: v.optional(v.picklist(SESSION_CONTEXTS)),
});
export type SignInInput = v.InferOutput<typeof signInSchema>;

export const switchContextSchema = v.object({
  context: v.picklist(SESSION_CONTEXTS),
});
