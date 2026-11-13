import type { ModuleId } from "@faridalms/domain/modules";

import { GRADE_TERMS } from "@faridalms/domain/grade-levels";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { describe, expect, it } from "vitest";

import { MODULE_FILLINGS } from "~/extensions";
import * as m from "~/i18n/messages";

import type { Wording } from "./extension";
import type { Sentence, Words } from "./words";

import { fillingsOf } from "./extension";
import { moduleWords, wordsOf } from "./words";

const WORDINGS: readonly Wording[] = [
  {},
  ...GRADE_TERMS.map((term) => ({ grade_levels: term })),
];

const neutral: Sentence = () => "neutral";
const families: Sentence = () => "families";
const both: Sentence = () => "families and years";

const read = (wording: Wording, ...on: ModuleId[]) =>
  wordsOf(MODULE_FILLINGS, {
    modules: only("admissions", ...on),
    wording,
  })(m.brdEnrolBodyCore)();

const only = (...on: ModuleId[]) =>
  Object.fromEntries(MODULE_IDS.map((id) => [id, on.includes(id)])) as Record<
    ModuleId,
    boolean
  >;

describe("a module's words for a neutral sentence", () => {
  it("offers two for one sentence only where one needs every module the other needs, and more", () => {
    const clashes = new Set<string>();
    for (const wording of WORDINGS) {
      const offers = MODULE_FILLINGS.flatMap((entry) =>
        fillingsOf(entry, wording)
          .filter((filling) => filling.slot === moduleWords)
          .map((filling) => ({
            neutral: (filling.value as Words).neutral,
            modules: [entry.module, ...(entry.needs ?? [])],
          })),
      );
      offers.forEach((offer, index) => {
        for (const other of offers.slice(index + 1)) {
          if (other.neutral !== offer.neutral) continue;
          const [fewer, more] =
            offer.modules.length < other.modules.length
              ? [offer, other]
              : [other, offer];
          if (
            fewer.modules.length === more.modules.length ||
            !fewer.modules.every((id) => more.modules.includes(id))
          )
            clashes.add(
              `${offer.neutral.name}: ${offer.modules.join("+")} and ${other.modules.join("+")}`,
            );
        }
      });
    }
    expect([...clashes]).toEqual([]);
  });

  it("reads the words needing the most modules of those on", () => {
    const words = wordsOf(
      [
        {
          module: "admissions",
          needs: ["families", "school_years"],
          fillings: [{ slot: moduleWords, value: { neutral, words: both } }],
        },
        {
          module: "admissions",
          needs: ["families"],
          fillings: [
            { slot: moduleWords, value: { neutral, words: families } },
          ],
        },
      ],
      {
        modules: only("admissions", "families", "school_years"),
        wording: {},
      },
    );
    expect(words(neutral)()).toBe("families and years");
  });
});

describe("the enrol confirmation of admissions", () => {
  it("speaks of no family where the school keeps none", () => {
    expect(read({}, "school_years", "grade_levels")).toBe(
      "Each becomes a student, under their application number as the school reference.",
    );
  });

  it("makes the family the guardian where the school keeps families", () => {
    const family =
      "Each becomes a student, under their application number as the school reference, and their family becomes their guardian.";
    expect(read({}, "families")).toBe(family);
    expect(read({}, "families", "school_years")).toBe(family);
    expect(read({}, "families", "grade_levels")).toBe(family);
  });

  it("places them in a grade for the year with families, years and grade levels", () => {
    expect(read({}, "families", "school_years", "grade_levels")).toBe(
      "Each becomes a student placed in this grade for the year, under their application number as the school reference, and their family becomes their guardian.",
    );
    expect(
      read(
        { grade_levels: "stage" },
        "families",
        "school_years",
        "grade_levels",
      ),
    ).toBe(
      "Each becomes a student placed in this stage for the year, under their application number as the school reference, and their family becomes their guardian.",
    );
  });
});
