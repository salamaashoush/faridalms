import type { GradeWording } from "@faridalms/domain/grade-levels";

import { describe, expect, it } from "vitest";

import type { Sentence, Words } from "~/utils/words";

import * as m from "~/i18n/messages";
import { fillingsOf } from "~/utils/extension";

import type { GradeWords } from "./words";

import { GRADE_LEVELS_WITH_FAMILIES } from "./families";
import { gradeWordingIn, gradeWordsIn } from "./words";

const INPUTS = { date: "1 September", language: "English" };

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

/**
 * Sentences that also speak of a grade the school's word does not name, and
 * those words, which stay: a mark, or the grades a published norm is for.
 */
const MARKS: Partial<Record<string, RegExp>> = {
  programmesHint: /\bgrade on\b|\bterm grade\b/g,
  readingDefaultEnglish: /\bgrades 1 to 6\b/,
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
  reading: {
    readingHint: [
      m.readingStaffHint,
      {
        level: [
          "Words correct a minute in each reading a teacher marked this year, against the school's norm for the student's level at that time of year.",
          "الكلمات الصحيحة في الدقيقة في كل قراءة صحّحها معلم هذا العام، مقارنةً بمعيار المدرسة لمستوى الطالب في ذلك الوقت من العام.",
        ],
        year_group: [
          "Words correct a minute in each reading a teacher marked this year, against the school's norm for the student's year group at that time of year.",
          "الكلمات الصحيحة في الدقيقة في كل قراءة صحّحها معلم هذا العام، مقارنةً بمعيار المدرسة لصف الطالب في ذلك الوقت من العام.",
        ],
        stage: [
          "Words correct a minute in each reading a teacher marked this year, against the school's norm for the student's stage at that time of year.",
          "الكلمات الصحيحة في الدقيقة في كل قراءة صحّحها معلم هذا العام، مقارنةً بمعيار المدرسة لمرحلة الطالب في ذلك الوقت من العام.",
        ],
      },
    ],
    readingNormLine: [
      m.readingNormLine,
      {
        level: ["50th percentile for the level", "المئين الخمسون للمستوى"],
        year_group: [
          "50th percentile for the year group",
          "المئين الخمسون للصف",
        ],
        stage: ["50th percentile for the stage", "المئين الخمسون للمرحلة"],
      },
    ],
    readingDefaultEnglish: [
      m.readingNormsDefaultEn,
      {
        level: [
          "Hasbrouck and Tindal's 2017 norms for grades 1 to 6, words correct a minute. Change any figure, or add levels, to make them the school's own.",
          "معايير هاسبروك وتيندال لعام ٢٠١٧ للصفوف من الأول إلى السادس، بالكلمات الصحيحة في الدقيقة. غيّر أي رقم أو أضف مستويات لتصبح معايير المدرسة الخاصة.",
        ],
        year_group: [
          "Hasbrouck and Tindal's 2017 norms for grades 1 to 6, words correct a minute. Change any figure, or add year groups, to make them the school's own.",
          "معايير هاسبروك وتيندال لعام ٢٠١٧ للصفوف من الأول إلى السادس، بالكلمات الصحيحة في الدقيقة. غيّر أي رقم أو أضف صفوفًا لتصبح معايير المدرسة الخاصة.",
        ],
        stage: [
          "Hasbrouck and Tindal's 2017 norms for grades 1 to 6, words correct a minute. Change any figure, or add stages, to make them the school's own.",
          "معايير هاسبروك وتيندال لعام ٢٠١٧ للصفوف من الأول إلى السادس، بالكلمات الصحيحة في الدقيقة. غيّر أي رقم أو أضف مراحل لتصبح معايير المدرسة الخاصة.",
        ],
      },
    ],
    readingDefaultArabic: [
      m.readingNormsDefaultAr,
      {
        level: [
          "There are no published norms for reading Arabic aloud to start from. Add the levels your school measures and the words correct a minute it expects.",
          "لا توجد معايير منشورة للقراءة الجهرية بالعربية يُبدأ منها. أضف المستويات التي تقيسها مدرستك وعدد الكلمات الصحيحة في الدقيقة الذي تتوقعه.",
        ],
        year_group: [
          "There are no published norms for reading Arabic aloud to start from. Add the year groups your school measures and the words correct a minute it expects.",
          "لا توجد معايير منشورة للقراءة الجهرية بالعربية يُبدأ منها. أضف الصفوف التي تقيسها مدرستك وعدد الكلمات الصحيحة في الدقيقة الذي تتوقعه.",
        ],
        stage: [
          "There are no published norms for reading Arabic aloud to start from. Add the stages your school measures and the words correct a minute it expects.",
          "لا توجد معايير منشورة للقراءة الجهرية بالعربية يُبدأ منها. أضف المراحل التي تقيسها مدرستك وعدد الكلمات الصحيحة في الدقيقة الذي تتوقعه.",
        ],
      },
    ],
    readingEmpty: [
      m.readingNormsEmpty,
      {
        level: [
          "Add the first level to write its norms.",
          "أضف أول مستوى لتكتب معاييره.",
        ],
        year_group: [
          "Add the first year group to write its norms.",
          "أضف أول صف لتكتب معاييره.",
        ],
        stage: [
          "Add the first stage to write its norms.",
          "أضف أول مرحلة لتكتب معاييرها.",
        ],
      },
    ],
    readingTable: [
      m.readingNormsTable,
      {
        level: [
          "{language} norms by level and time of year",
          "معايير {language} حسب المستوى ووقت العام",
        ],
        year_group: [
          "{language} norms by year group and time of year",
          "معايير {language} حسب الصف ووقت العام",
        ],
        stage: [
          "{language} norms by stage and time of year",
          "معايير {language} حسب المرحلة ووقت العام",
        ],
      },
    ],
    readingGrade: [
      m.readingGrade,
      {
        level: ["Level", "المستوى"],
        year_group: ["Year group", "الصف"],
        stage: ["Stage", "المرحلة"],
      },
    ],
    readingRepeated: [
      m.readingErrNormRepeated,
      {
        level: [
          "Each level appears once for each time of year.",
          "يظهر كل مستوى مرة واحدة لكل وقت من العام.",
        ],
        year_group: [
          "Each year group appears once for each time of year.",
          "يظهر كل صف مرة واحدة لكل وقت من العام.",
        ],
        stage: [
          "Each stage appears once for each time of year.",
          "تظهر كل مرحلة مرة واحدة لكل وقت من العام.",
        ],
      },
    ],
    readingRemove: [
      m.readingNormRemoveBody,
      {
        level: [
          "Readings at that time of year are set against no norm for the level until one is written again.",
          "لا تُقارن القراءات في ذلك الوقت من السنة بأي معيار للمستوى حتى يُكتب معيار جديد.",
        ],
        year_group: [
          "Readings at that time of year are set against no norm for the year group until one is written again.",
          "لا تُقارن القراءات في ذلك الوقت من السنة بأي معيار للصف حتى يُكتب معيار جديد.",
        ],
        stage: [
          "Readings at that time of year are set against no norm for the stage until one is written again.",
          "لا تُقارن القراءات في ذلك الوقت من السنة بأي معيار للمرحلة حتى يُكتب معيار جديد.",
        ],
      },
    ],
  },
  admissions: {
    intakeGrade: [
      m.itkFieldGrade,
      {
        level: ["Level", "المستوى"],
        year_group: ["Year group", "الصف"],
        stage: ["Stage", "المرحلة"],
      },
    ],
    letterGrade: [
      m.ltrFieldGrade,
      {
        level: ["The level", "المستوى"],
        year_group: ["The year group", "الصف"],
        stage: ["The stage", "المرحلة"],
      },
    ],
    intakeCaption: [
      m.itkCaption,
      {
        level: [
          "Intakes of the year, level by level",
          "دورات القبول للعام، مستوًى مستوًى",
        ],
        year_group: [
          "Intakes of the year, year group by year group",
          "دورات القبول للعام، صفًا صفًا",
        ],
        stage: [
          "Intakes of the year, stage by stage",
          "دورات القبول للعام، مرحلةً مرحلةً",
        ],
      },
    ],
    intakeCapacity: [
      m.itkFieldCapacityHint,
      {
        level: [
          "How many children the level can take.",
          "عدد الأطفال الذين يستوعبهم المستوى.",
        ],
        year_group: [
          "How many children the year group can take.",
          "عدد الأطفال الذين يستوعبهم الصف.",
        ],
        stage: [
          "How many children the stage can take.",
          "عدد الأطفال الذين تستوعبهم المرحلة.",
        ],
      },
    ],
    intakeChecklist: [
      m.itkSectionChecklistHint,
      {
        level: [
          "What every applicant to this level is asked for. Families upload the documents; the office ticks off the rest.",
          "ما يُطلب من كل متقدم لهذا المستوى. ترفع الأسر المستندات، ويؤشر مكتب القبول على الباقي.",
        ],
        year_group: [
          "What every applicant to this year group is asked for. Families upload the documents; the office ticks off the rest.",
          "ما يُطلب من كل متقدم لهذا الصف. ترفع الأسر المستندات، ويؤشر مكتب القبول على الباقي.",
        ],
        stage: [
          "What every applicant to this stage is asked for. Families upload the documents; the office ticks off the rest.",
          "ما يُطلب من كل متقدم لهذه المرحلة. ترفع الأسر المستندات، ويؤشر مكتب القبول على الباقي.",
        ],
      },
    ],
    applyNone: [
      m.applyNoIntakes,
      {
        level: [
          "No level is taking applications today. Please check the school's admissions page for dates.",
          "لا يوجد مستوى يستقبل طلبات اليوم. يُرجى مراجعة صفحة القبول في موقع المدرسة لمعرفة المواعيد.",
        ],
        year_group: [
          "No year group is taking applications today. Please check the school's admissions page for dates.",
          "لا يوجد صف يستقبل طلبات اليوم. يُرجى مراجعة صفحة القبول في موقع المدرسة لمعرفة المواعيد.",
        ],
        stage: [
          "No stage is taking applications today. Please check the school's admissions page for dates.",
          "لا توجد مرحلة تستقبل طلبات اليوم. يُرجى مراجعة صفحة القبول في موقع المدرسة لمعرفة المواعيد.",
        ],
      },
    ],
    applyTitle: [
      m.applyIntakeTitle,
      {
        level: ["Level and year", "المستوى والعام"],
        year_group: ["Year group and year", "الصف والعام"],
        stage: ["Stage and year", "المرحلة والعام"],
      },
    ],
    applyHint: [
      m.applyIntakeHint,
      {
        level: [
          "The level your child will join, and when.",
          "المستوى الذي سيلتحق به طفلكم وموعده.",
        ],
        year_group: [
          "The year group your child will join, and when.",
          "الصف الذي سيلتحق به طفلكم وموعده.",
        ],
        stage: [
          "The stage your child will join, and when.",
          "المرحلة التي سيلتحق بها طفلكم وموعد التحاقه.",
        ],
      },
    ],
    ageFits: [
      m.aplAgeFits,
      {
        level: ["Of age for this level", "في السن المناسبة للمستوى"],
        year_group: ["Of age for this year group", "في السن المناسبة للصف"],
        stage: ["Of age for this stage", "في السن المناسبة للمرحلة"],
      },
    ],
    applicationsEmpty: [
      m.famAppsEmptyBody,
      {
        level: [
          "Apply from the school's admissions page while a level is open.",
          "تقدموا من صفحة القبول في موقع المدرسة متى كان أحد المستويات مفتوحًا للتقديم.",
        ],
        year_group: [
          "Apply from the school's admissions page while a year group is open.",
          "تقدموا من صفحة القبول في موقع المدرسة متى كان أحد الصفوف مفتوحًا للتقديم.",
        ],
        stage: [
          "Apply from the school's admissions page while a stage is open.",
          "تقدموا من صفحة القبول في موقع المدرسة متى كانت إحدى المراحل مفتوحة للتقديم.",
        ],
      },
    ],
    reportByIntake: [
      m.adrByIntake,
      {
        level: ["By level and intake", "حسب المستوى والدفعة"],
        year_group: ["By year group and intake", "حسب الصف والدفعة"],
        stage: ["By stage and intake", "حسب المرحلة والدفعة"],
      },
    ],
    enrolBody: [
      m.brdEnrolBody,
      {
        level: [
          "Each becomes a student placed in this level for the year, under their application number as the school reference, and their family becomes their guardian.",
          "يصبح كل منهم طالبًا مسجلًا في هذا المستوى للعام الدراسي برقم طلبه رقمًا مرجعيًا في المدرسة، وتصبح أسرته وليّة أمره.",
        ],
        year_group: [
          "Each becomes a student placed in this year group for the year, under their application number as the school reference, and their family becomes their guardian.",
          "يصبح كل منهم طالبًا مسجلًا في هذا الصف للعام الدراسي برقم طلبه رقمًا مرجعيًا في المدرسة، وتصبح أسرته وليّة أمره.",
        ],
        stage: [
          "Each becomes a student placed in this stage for the year, under their application number as the school reference, and their family becomes their guardian.",
          "يصبح كل منهم طالبًا مسجلًا في هذه المرحلة للعام الدراسي برقم طلبه رقمًا مرجعيًا في المدرسة، وتصبح أسرته وليّة أمره.",
        ],
      },
    ],
    siteIntake: [
      m.siteFieldIntakeHint,
      {
        level: [
          "Every intake open, or one level's.",
          "كل الدفعات المفتوحة، أو دفعة مستوى واحد.",
        ],
        year_group: [
          "Every intake open, or one year group's.",
          "كل الدفعات المفتوحة، أو دفعة صف واحد.",
        ],
        stage: [
          "Every intake open, or one stage's.",
          "كل الدفعات المفتوحة، أو دفعة مرحلة واحدة.",
        ],
      },
    ],
    setupAdmissions: [
      m.setupAdmissionsBody,
      {
        level: [
          "Open an intake for a level so families can apply online.",
          "افتح دورة قبول لمستوى ما لتتمكن الأسر من التقديم عبر الإنترنت.",
        ],
        year_group: [
          "Open an intake for a year group so families can apply online.",
          "افتح دورة قبول لصف ما لتتمكن الأسر من التقديم عبر الإنترنت.",
        ],
        stage: [
          "Open an intake for a stage so families can apply online.",
          "افتح دورة قبول لمرحلة ما لتتمكن الأسر من التقديم عبر الإنترنت.",
        ],
      },
    ],
    intakeFixed: [
      m.errIntakeFixed,
      {
        level: [
          "An intake's year and level do not change once set.",
          "لا يتغير عام دورة القبول ومستواها بعد تحديدهما.",
        ],
        year_group: [
          "An intake's year and year group do not change once set.",
          "لا يتغير عام دورة القبول وصفها بعد تحديدهما.",
        ],
        stage: [
          "An intake's year and stage do not change once set.",
          "لا يتغير عام دورة القبول ومرحلتها بعد تحديدهما.",
        ],
      },
    ],
    intakeUnknown: [
      m.errIntakeGrade,
      {
        level: [
          "Choose one of the school's levels.",
          "اختر أحد مستويات المدرسة.",
        ],
        year_group: [
          "Choose one of the school's year groups.",
          "اختر أحد صفوف المدرسة.",
        ],
        stage: [
          "Choose one of the school's stages.",
          "اختر إحدى مراحل المدرسة.",
        ],
      },
    ],
    applyClosed: [
      m.errApplicationClosed,
      {
        level: [
          "Applications to this level are not open today.",
          "التقديم لهذا المستوى غير مفتوح اليوم.",
        ],
        year_group: [
          "Applications to this year group are not open today.",
          "التقديم لهذا الصف غير مفتوح اليوم.",
        ],
        stage: [
          "Applications to this stage are not open today.",
          "التقديم لهذه المرحلة غير مفتوح اليوم.",
        ],
      },
    ],
    applyYoung: [
      m.errApplicationYoung,
      {
        level: [
          "Your child is younger than this level takes on the cut-off day. Please choose another level or ask the school.",
          "طفلكم أصغر من السن التي يقبلها هذا المستوى في يوم الاحتساب. يُرجى اختيار مستوى آخر أو سؤال المدرسة.",
        ],
        year_group: [
          "Your child is younger than this year group takes on the cut-off day. Please choose another year group or ask the school.",
          "طفلكم أصغر من السن التي يقبلها هذا الصف في يوم الاحتساب. يُرجى اختيار صف آخر أو سؤال المدرسة.",
        ],
        stage: [
          "Your child is younger than this stage takes on the cut-off day. Please choose another stage or ask the school.",
          "طفلكم أصغر من السن التي تقبلها هذه المرحلة في يوم الاحتساب. يُرجى اختيار مرحلة أخرى أو سؤال المدرسة.",
        ],
      },
    ],
    applyOld: [
      m.errApplicationOld,
      {
        level: [
          "Your child is older than this level takes on the cut-off day. Please choose another level or ask the school.",
          "طفلكم أكبر من السن التي يقبلها هذا المستوى في يوم الاحتساب. يُرجى اختيار مستوى آخر أو سؤال المدرسة.",
        ],
        year_group: [
          "Your child is older than this year group takes on the cut-off day. Please choose another year group or ask the school.",
          "طفلكم أكبر من السن التي يقبلها هذا الصف في يوم الاحتساب. يُرجى اختيار صف آخر أو سؤال المدرسة.",
        ],
        stage: [
          "Your child is older than this stage takes on the cut-off day. Please choose another stage or ask the school.",
          "طفلكم أكبر من السن التي تقبلها هذه المرحلة في يوم الاحتساب. يُرجى اختيار مرحلة أخرى أو سؤال المدرسة.",
        ],
      },
    ],
    applyExists: [
      m.errApplicationExists,
      {
        level: [
          "This child already has an application to this level.",
          "لهذا الطفل طلب لهذا المستوى بالفعل.",
        ],
        year_group: [
          "This child already has an application to this year group.",
          "لهذا الطفل طلب لهذا الصف بالفعل.",
        ],
        stage: [
          "This child already has an application to this stage.",
          "لهذا الطفل طلب لهذه المرحلة بالفعل.",
        ],
      },
    ],
  },
};

const filledIn = (text: string) =>
  text.replace("{date}", INPUTS.date).replace("{language}", INPUTS.language);
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
