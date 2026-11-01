import { describe, expect, it } from "vitest";

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
