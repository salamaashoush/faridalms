import { saveClassSchema } from "@faridalms/domain/classes";
import { saveSignInSchema } from "@faridalms/domain/people";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import * as m from "~/i18n/messages";

import { validationMessage } from "./validation";

describe("localized form validation", () => {
  it("explains missing class details and subject selections", () => {
    const result = v.safeParse(saveClassSchema, {
      yearId: "",
      code: " ",
      subjects: [{ subjectId: "", teacherIds: [""] }],
    });
    expect(result.success).toBe(false);
    expect(result.issues?.map(validationMessage)).toEqual([
      m.validationSelection(),
      m.validationClassCode(),
      m.validationSelection(),
      m.validationSelection(),
      m.validationNameRequired(),
    ]);
  });

  it("explains password union failures without exposing validator internals", () => {
    const result = v.safeParse(saveSignInSchema, {
      userId: "00000000-0000-4000-8000-000000000001",
      loginName: "salama@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    expect(result.issues?.map(validationMessage)).toContain(
      m.validationMinLength({ count: 15 }),
    );
  });

  it("preserves explicit localized errors from existing validators", () => {
    expect(validationMessage({ message: m.validationPasswordMismatch() })).toBe(
      m.validationPasswordMismatch(),
    );
  });
});
