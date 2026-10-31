import {
  INVITE_SECRET,
  loginNameSchema,
  MIN_PASSWORD,
} from "@faridalms/domain/first-sign-in";
import { BADGE_SECRET } from "@faridalms/domain/identity-schema";
import * as v from "valibot";

import * as m from "~/i18n/messages";

import { passwordSchema } from "./common";

export const loginSchema = v.object({
  school: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  loginName: loginNameSchema,
  password: passwordSchema,
});
export type LoginSchemaOutput = v.InferOutput<typeof loginSchema>;
export type LoginSchemaInput = v.InferInput<typeof loginSchema>;

const school = v.pipe(
  v.string(),
  v.regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/),
);

export const badgeLoginSchema = v.object({
  school,
  secret: v.pipe(v.string(), v.regex(BADGE_SECRET)),
});

export const inviteLinkSchema = v.object({
  school,
  secret: v.pipe(v.string(), v.regex(INVITE_SECRET)),
});

export const acceptInviteLinkSchema = v.object({
  ...inviteLinkSchema.entries,
  password: v.pipe(v.string(), v.minLength(MIN_PASSWORD), v.maxLength(256)),
});

export const forgotPasswordSchema = v.object({
  school: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  loginName: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, m.validationLoginName()),
    v.maxLength(254),
  ),
});
export type ForgotPasswordInput = v.InferInput<typeof forgotPasswordSchema>;
