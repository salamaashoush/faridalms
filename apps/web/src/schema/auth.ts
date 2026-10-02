import { BADGE_SECRET } from "@faridalms/domain/identity-schema";
import * as v from "valibot";

import * as m from "~/i18n/messages";

import {
  companySchema,
  emailSchema,
  jobTitleSchema,
  mobileNumberSchema,
  passwordSchema,
  usernameSchema,
} from "./common";

export const loginSchema = v.object({
  school: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  email: emailSchema,
  password: passwordSchema,
});
export type LoginSchemaOutput = v.InferOutput<typeof loginSchema>;
export type LoginSchemaInput = v.InferInput<typeof loginSchema>;

export const badgeLoginSchema = v.object({
  school: v.pipe(v.string(), v.regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/)),
  secret: v.pipe(v.string(), v.regex(BADGE_SECRET)),
});

export const forgotPasswordSchema = v.object({
  email: emailSchema,
});

export const registerSchema = v.pipe(
  v.object({
    email: emailSchema,
    name: usernameSchema,
    mobile: mobileNumberSchema,
    company: companySchema,
    jobTitle: jobTitleSchema,
    password: passwordSchema,
    confirmPassword: v.string(),
  }),
  v.forward(
    v.partialCheck(
      [["password"], ["confirmPassword"]],
      (input) => input.password === input.confirmPassword,
      m.validationPasswordMismatch(),
    ),
    ["confirmPassword"],
  ),
);

export type RegisterSchemaOutput = v.InferOutput<typeof registerSchema>;
