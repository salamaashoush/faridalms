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

/** A handoff carries 256 random bits as base64url. */
export const HANDOFF_SECRET = /^[A-Za-z0-9_-]{43}$/;
/** How long a handoff from the bare portal domain stays good, in seconds. */
export const HANDOFF_SECONDS = 60;

const slug = v.pipe(
  v.string(),
  v.regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
);

/**
 * Sign-in on the bare portal domain, which names no school: the school is
 * found from the sign-in name once the password is right. `school` picks
 * one when the same name and password open more than one.
 */
export const discoverSignInSchema = v.object({
  loginName: signInSchema.entries.loginName,
  password: signInSchema.entries.password,
  school: v.optional(slug),
  /** The visitor's human check, where the platform asks for one. */
  human: v.optional(v.pipe(v.string(), v.maxLength(4096))),
});

/** A forgotten password asked for on the bare portal domain. */
export const discoverResetSchema = v.object({
  loginName: signInSchema.entries.loginName,
  human: v.optional(v.pipe(v.string(), v.maxLength(4096))),
});

export const redeemHandoffSchema = v.object({
  token: v.pipe(v.string(), v.regex(HANDOFF_SECRET)),
});

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

export const childSessionSchema = v.object({ studentId: id });
