import {
  saveClassSchema,
  saveUserSchema,
} from "@faridalms/domain/administration-schema";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import * as m from "~/i18n/messages";

import { validationMessage } from "./validation";

describe("localized form validation", () => {
  it("explains missing class details and subject selections", () => {
    const result = v.safeParse(saveClassSchema, {
      name: " ",
      grade: "",
      stage: "primary",
      subjects: [{ subjectId: "", teacherId: "" }],
    });
    expect(result.success).toBe(false);
    expect(result.issues?.map(validationMessage)).toEqual([
      m.validationRequired(),
      m.validationRequired(),
      m.validationSelection(),
      m.validationSelection(),
    ]);
  });

  it("explains password union failures without exposing validator internals", () => {
    const result = v.safeParse(saveUserSchema, {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Salama Ashoush",
      email: "salama@example.com",
      role: "teacher",
      password: "short",
      isActive: true,
    });
    expect(result.success).toBe(false);
    expect(result.issues?.map(validationMessage)).toContain(
      m.validationMinLength({ count: 12 }),
    );
  });

  it("preserves explicit localized errors from existing validators", () => {
    expect(validationMessage({ message: m.validationPasswordMismatch() })).toBe(
      m.validationPasswordMismatch(),
    );
  });
});
