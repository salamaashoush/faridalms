import type { GradeWording } from "@faridalms/domain/grade-levels";

import { describe, expect, it } from "vitest";

import type { Sentence, Words } from "~/utils/words";

import * as m from "~/i18n/messages";
import { fillingsOf } from "~/utils/extension";

import type { GradeWords } from "./words";

import { GRADE_LEVELS_WITH_FAMILIES } from "./families";
import { gradeWordingIn, gradeWordsIn } from "./words";

const INPUTS = { date: "1 September" };

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
      for (const [key, sentence] of Object.entries(words))
        expect(
          (sentence as (inputs: object) => string)(INPUTS).replace(
            MARKS[key] ?? /$^/,
            "",
          ),
        ).not.toMatch(/\bgrade/i);
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

type Word = "level" | "year_group" | "stage";

/** Sentences that also speak of a grade as a mark, and the words of the mark, which stay. */
const MARKS: Partial<Record<string, RegExp>> = {
  programmesHint: /\bgrade on\b|\bterm grade\b/g,
};

/** A surface's sentences: what each read before the school chose, then per word in English and Arabic. */
const SURFACES: Record<
  string,
  Record<string, [Sentence, Record<Word, [string, string]>]>
> = {
  audiences: {
    audienceKind: [
      m.annScopeGrade,
      {
        level: ["A level", "مستوى"],
        year_group: ["A year group", "صف"],
        stage: ["A stage", "مرحلة"],
      },
    ],
    audienceTarget: [
      m.annGrade,
      {
        level: ["Level", "المستوى"],
        year_group: ["Year group", "الصف"],
        stage: ["Stage", "المرحلة"],
      },
    ],
    audiencePick: [
      m.annPickGrade,
      {
        level: ["Choose a level", "اختر مستوًى"],
        year_group: ["Choose a year group", "اختر صفًا"],
        stage: ["Choose a stage", "اختر مرحلة"],
      },
    ],
    audienceChoose: [
      m.annAudienceTarget,
      {
        level: [
          "Choose the class or level for each audience.",
          "اختر الفصل أو المستوى لكل جمهور.",
        ],
        year_group: [
          "Choose the class or year group for each audience.",
          "اختر الفصل أو الصف لكل جمهور.",
        ],
        stage: [
          "Choose the class or stage for each audience.",
          "اختر الفصل أو المرحلة لكل جمهور.",
        ],
      },
    ],
    audienceReachesFamilies: [
      m.annAudienceHint,
      {
        level: [
          "A class or level reaches its students, their families and its teachers.",
          "يصل الفصل أو المستوى إلى طلابه وأسرهم ومعلميه.",
        ],
        year_group: [
          "A class or year group reaches its students, their families and its teachers.",
          "يصل الفصل أو الصف إلى طلابه وأسرهم ومعلميه.",
        ],
        stage: [
          "A class or stage reaches its students, their families and its teachers.",
          "يصل كلٌّ من الفصل والمرحلة إلى طلابه وأسرهم ومعلميه.",
        ],
      },
    ],
  },
  years: {
    rolloverClasses: [
      m.rolloverClassesHint,
      {
        level: [
          "Each class of the current year proposes a class for the new year in the next level with the same teachers. Change its code, name, level or class teacher, or leave it out.",
          "يقترح كل فصل من العام الحالي فصلًا للعام الجديد في المستوى التالي بالمعلمين أنفسهم. غيّر رمزه أو اسمه أو مستواه أو معلم الفصل، أو استبعده.",
        ],
        year_group: [
          "Each class of the current year proposes a class for the new year in the next year group with the same teachers. Change its code, name, year group or class teacher, or leave it out.",
          "يقترح كل فصل من العام الحالي فصلًا للعام الجديد في الصف التالي بالمعلمين أنفسهم. غيّر رمزه أو اسمه أو صفه أو معلم الفصل، أو استبعده.",
        ],
        stage: [
          "Each class of the current year proposes a class for the new year in the next stage with the same teachers. Change its code, name, stage or class teacher, or leave it out.",
          "يقترح كل فصل من العام الحالي فصلًا للعام الجديد في المرحلة التالية بالمعلمين أنفسهم. غيّر رمزه أو اسمه أو مرحلته أو معلم الفصل، أو استبعده.",
        ],
      },
    ],
    rolloverStudents: [
      m.rolloverStudentsHint,
      {
        level: [
          "Students join their new class on {date}. Promote follows their class into the next level; repeat places them in a class you choose; leaving and graduating end with this year.",
          "ينضم الطلاب إلى فصولهم الجديدة في {date}. الترفيع ينقلهم مع فصلهم إلى المستوى التالي، والإعادة تضعهم في فصل تختاره، والمغادرة والتخرج ينتهيان بنهاية هذا العام.",
        ],
        year_group: [
          "Students join their new class on {date}. Promote follows their class into the next year group; repeat places them in a class you choose; leaving and graduating end with this year.",
          "ينضم الطلاب إلى فصولهم الجديدة في {date}. الترفيع ينقلهم مع فصلهم إلى الصف التالي، والإعادة تضعهم في فصل تختاره، والمغادرة والتخرج ينتهيان بنهاية هذا العام.",
        ],
        stage: [
          "Students join their new class on {date}. Promote follows their class into the next stage; repeat places them in a class you choose; leaving and graduating end with this year.",
          "ينضم الطلاب إلى فصولهم الجديدة في {date}. الترفيع ينقلهم مع فصلهم إلى المرحلة التالية، والإعادة تضعهم في فصل تختاره، والمغادرة والتخرج ينتهيان بنهاية هذا العام.",
        ],
      },
    ],
    placementHistory: [
      m.studentPlacementHistoryHint,
      {
        level: [
          "The student's level in each school year at this school.",
          "مستوى الطالب في كل عام دراسي في هذه المدرسة.",
        ],
        year_group: [
          "The student's year group in each school year at this school.",
          "صف الطالب في كل عام دراسي في هذه المدرسة.",
        ],
        stage: [
          "The student's stage in each school year at this school.",
          "مرحلة الطالب في كل عام دراسي في هذه المدرسة.",
        ],
      },
    ],
  },
  programmes: {
    programmeDerived: [
      m.gradingByGradeLevel,
      {
        level: ["(by level)", "(حسب المستوى)"],
        year_group: ["(by year group)", "(حسب الصف)"],
        stage: ["(by stage)", "(حسب المرحلة)"],
      },
    ],
    programmeOption: [
      m.gradingByGradeLevelOption,
      {
        level: ["The programme for its level", "البرنامج الخاص بمستواه"],
        year_group: ["The programme for its year group", "البرنامج الخاص بصفّه"],
        stage: ["The programme for its stage", "البرنامج الخاص بمرحلته"],
      },
    ],
    programmeChoose: [
      m.gradingClassProgrammeHint,
      {
        level: [
          "Choose one when two programmes share this class's level.",
          "اختر برنامجًا عندما يشترك برنامجان في مستوى هذا الفصل.",
        ],
        year_group: [
          "Choose one when two programmes share this class's year group.",
          "اختر برنامجًا عندما يشترك برنامجان في صف هذا الفصل.",
        ],
        stage: [
          "Choose one when two programmes share this class's stage.",
          "اختر برنامجًا عندما يشترك برنامجان في مرحلة هذا الفصل.",
        ],
      },
    ],
    programmeLevels: [
      m.gradingGradeLevels,
      {
        level: ["Levels", "المستويات"],
        year_group: ["Year groups", "الصفوف"],
        stage: ["Stages", "المراحل"],
      },
    ],
    programmeLevelsHint: [
      m.gradingGradeLevelsHint,
      {
        level: [
          "Classes in these levels follow the programme unless another programme shares the level.",
          "تتبع فصول هذه المستويات البرنامج ما لم يشترك برنامج آخر في المستوى.",
        ],
        year_group: [
          "Classes in these year groups follow the programme unless another programme shares the year group.",
          "تتبع فصول هذه الصفوف البرنامج ما لم يشترك برنامج آخر في الصف.",
        ],
        stage: [
          "Classes in these stages follow the programme unless another programme shares the stage.",
          "تتبع فصول هذه المراحل البرنامج ما لم يشترك برنامج آخر في المرحلة.",
        ],
      },
    ],
    programmesEmpty: [
      m.gradingProgrammesEmptyHint,
      {
        level: [
          "Add the programmes your school runs, such as IGCSE or the IB Diploma, to set each class's scale by its level.",
          "أضف البرامج التي تقدمها مدرستك، مثل IGCSE أو دبلوم البكالوريا الدولية، لتحديد سلّم كل فصل حسب مستواه.",
        ],
        year_group: [
          "Add the programmes your school runs, such as IGCSE or the IB Diploma, to set each class's scale by its year group.",
          "أضف البرامج التي تقدمها مدرستك، مثل IGCSE أو دبلوم البكالوريا الدولية، لتحديد سلّم كل فصل حسب صفه.",
        ],
        stage: [
          "Add the programmes your school runs, such as IGCSE or the IB Diploma, to set each class's scale by its stage.",
          "أضف البرامج التي تقدمها مدرستك، مثل IGCSE أو دبلوم البكالوريا الدولية، لتحديد سلّم كل فصل حسب مرحلته.",
        ],
      },
    ],
    programmeRetire: [
      m.gradingRetireProgrammeBody,
      {
        level: [
          "Classes that follow it by level follow no programme after this. Classes chosen for it must be moved first.",
          "الفصول التي تتبعه حسب المستوى لن تتبع أي برنامج بعد ذلك. يجب نقل الفصول المختارة له أولًا.",
        ],
        year_group: [
          "Classes that follow it by year group follow no programme after this. Classes chosen for it must be moved first.",
          "الفصول التي تتبعه حسب الصف لن تتبع أي برنامج بعد ذلك. يجب نقل الفصول المختارة له أولًا.",
        ],
        stage: [
          "Classes that follow it by stage follow no programme after this. Classes chosen for it must be moved first.",
          "الفصول التي تتبعه حسب المرحلة لن تتبع أي برنامج بعد ذلك. يجب نقل الفصول المختارة له أولًا.",
        ],
      },
    ],
    programmesHint: [
      m.gradingProgrammesHint,
      {
        level: [
          "Which levels grade on which scale, and how their work weighs in a term grade.",
          "أي المستويات تُقيَّم بأي سلم، وكيف تُوزن أعمالها في تقدير الفصل الدراسي.",
        ],
        year_group: [
          "Which year groups grade on which scale, and how their work weighs in a term grade.",
          "أي الصفوف تُقيَّم بأي سلم، وكيف تُوزن أعمالها في تقدير الفصل الدراسي.",
        ],
        stage: [
          "Which stages grade on which scale, and how their work weighs in a term grade.",
          "أي المراحل تُقيَّم بأي سلم، وكيف تُوزن أعمالها في تقدير الفصل الدراسي.",
        ],
      },
    ],
  },
};

const filledIn = (text: string) => text.replace("{date}", INPUTS.date);
type Read = (inputs: object, options?: { locale: "ar" }) => string;

describe.each(Object.entries(SURFACES))(
  "the %s in the school's word",
  (_, sentences) => {
    it.each(Object.entries(sentences))(
      "%s reads as today until the school chooses, and per word after",
      (key, [today, per]) => {
        const sentence = (wording: GradeWording) =>
          gradeWordsIn(wording)[key as keyof GradeWords] as unknown as Read;
        const before = today as unknown as Read;
        expect(sentence("unset")).toBe(today);
        expect(sentence("grade")(INPUTS)).toBe(before(INPUTS));
        expect(sentence("grade")(INPUTS, { locale: "ar" })).toBe(
          before(INPUTS, { locale: "ar" }),
        );
        for (const [word, [english, arabic]] of Object.entries(per)) {
          expect(sentence(word as Word)(INPUTS)).toBe(filledIn(english));
          expect(sentence(word as Word)(INPUTS, { locale: "ar" })).toBe(
            filledIn(arabic),
          );
        }
        expect(sentence("year_group")(INPUTS, { locale: "ar" })).toBe(
          before(INPUTS, { locale: "ar" }),
        );
      },
    );
  },
);

const withFamilies = (wording: string) =>
  fillingsOf(GRADE_LEVELS_WITH_FAMILIES, { grade_levels: wording }).map(
    (filling) => filling.value as Words,
  );

describe("the sentences a link words", () => {
  it("names a family and the school's word for a grade together", () => {
    expect(withFamilies("level")).toEqual([
      { neutral: m.annAudienceHintCore, words: m.annAudienceHintAsLevel },
    ]);
    expect(withFamilies("nonsense")[0]?.words).toBe(m.annAudienceHint);
  });
});
