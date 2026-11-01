import { describe, expect, it, vi } from "vitest";

import * as m from "~/i18n/messages";

import { getMessageFromError } from "./error";

describe("refusals in the reader's words", () => {
  it("word what lessons and coursework refuse rather than show the code", () => {
    const cases: [string, string][] = [
      ["learning.targets_needed", m.lrnErrTargetsNeeded()],
      ["coursework.written_needed", m.errorCourseworkWrittenNeeded()],
      ["coursework.files_needed", m.errorCourseworkFilesNeeded()],
      ["coursework.nothing_to_hand_in", m.errorCourseworkNothingToHandIn()],
    ];
    for (const [code, copy] of cases) {
      expect(getMessageFromError(new Error(code))).toBe(copy);
      expect(copy).not.toBe(code);
    }
  });
});

describe("a refusal nothing words", () => {
  it("reads as the generic error and names the code in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getMessageFromError(new Error("class.never_written"))).toBe(
      m.notificationErrorMessage(),
    );
    expect(warn).toHaveBeenCalledWith(
      "No copy in utils/error.ts reads class.never_written",
    );
    warn.mockRestore();
  });

  it("reads a code no person can act on as the generic error, quietly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getMessageFromError(new Error("session.exists"))).toBe(
      m.notificationErrorMessage(),
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reads a check or reference the database refused by its kind", () => {
    expect(getMessageFromError(new Error("users_given_name.invalid"))).toBe(
      m.errorInvalidGeneric(),
    );
    expect(
      getMessageFromError(new Error("enrollments_class_id.reference_invalid")),
    ).toBe(m.errorReferenceGone());
    expect(getMessageFromError(new Error("classes.conflict"))).toBe(
      m.errorConflictVersion(),
    );
  });

  it("reads an unknown validation code as a value to check", () => {
    expect(getMessageFromError(new Error("validation.never_written"))).toBe(
      m.validationInvalid(),
    );
  });

  it("keeps a message already written for the person", () => {
    expect(getMessageFromError(new Error(m.lrnImportChoose()))).toBe(
      m.lrnImportChoose(),
    );
    expect(getMessageFromError(new Error("Failed to fetch"))).toBe(
      "Failed to fetch",
    );
  });
});
