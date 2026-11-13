import { describe, expect, it } from "vitest";

import * as m from "~/i18n/messages";

import { gradeWordingIn, gradeWordsIn } from "./words";

const inArabic = (sentence: () => string) =>
  (sentence as (inputs: object, options: { locale: "ar" }) => string)(
    {},
    { locale: "ar" },
  );

describe("the grade levels module's words", () => {
  it("reads as it always has until the school chooses", () => {
    const words = gradeWordsIn("unset");
    expect(words.tab).toBe(m.gradeLevelsTab);
    expect(words.grade).toBe(m.studentGrade);
    expect(words.add).toBe(m.gradeLevelsAdd);
    expect(gradeWordingIn({})).toBe("unset");
    expect(gradeWordingIn({ grade_levels: "nonsense" })).toBe("unset");
  });

  it("names the school's word in every sentence, in English", () => {
    expect(gradeWordsIn("level").grade()).toBe("Level");
    expect(gradeWordsIn("level").tab()).toBe("Levels");
    expect(gradeWordsIn("year_group").add()).toBe("Add a year group");
    expect(gradeWordsIn("stage").historyEmpty()).toBe(
      "No stage is recorded for this student.",
    );
    expect(gradeWordsIn("grade").tab()).toBe("Grades");
    expect(gradeWordsIn("level").setupTitle()).toBe("Levels and classes");
    expect(gradeWordsIn("unset").setupTitle()).toBe("Grades and classes");
    for (const words of [gradeWordsIn("level"), gradeWordsIn("stage")])
      for (const sentence of Object.values(words))
        expect((sentence as () => string)()).not.toMatch(/\bgrade/i);
  });

  it("agrees in Arabic: a stage is feminine, a year group reads as a grade", () => {
    expect(inArabic(gradeWordsIn("level").grade)).toBe("المستوى");
    expect(inArabic(gradeWordsIn("stage").retired)).toBe("متوقفة");
    expect(inArabic(gradeWordsIn("grade").retired)).toBe("متوقف");
    expect(inArabic(gradeWordsIn("stage").historyEmpty)).toBe(
      "لم تُسجَّل مرحلة لهذا الطالب.",
    );
    expect(inArabic(gradeWordsIn("stage").setupBody)).toBe(
      "أنشئ فصول العام في كل مرحلة، وعيّن لكل فصل معلّم الفصل.",
    );
    expect(inArabic(gradeWordsIn("year_group").grade)).toBe(
      inArabic(gradeWordsIn("grade").grade),
    );
  });
});
