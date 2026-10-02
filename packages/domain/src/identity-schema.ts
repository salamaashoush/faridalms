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

/** A badge carries 256 random bits as base64url, never anything about the child. */
export const BADGE_SECRET = /^[A-Za-z0-9_-]{43}$/;

export const badgeSignInSchema = v.object({
  secret: v.pipe(v.string(), v.regex(BADGE_SECRET)),
});

const id = v.pipe(v.string(), v.uuid());

export const classBadgesSchema = v.object({ classId: id });

export const issueBadgesSchema = v.object({
  classId: id,
  studentIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(60)),
});

export const stopBadgeSchema = v.object({ classId: id, studentId: id });
