import { plainContent } from "@faridalms/domain/content-conversion";
import { SCALE_PRESETS } from "@faridalms/domain/grading";
import { describe, expect, test } from "bun:test";

import { login, rejection, sessionFor, signedIn } from "./harness";

const teacherSession = () => sessionFor("northwind", login("teacher", 0, 1));
type Session = Awaited<ReturnType<typeof teacherSession>>;

const preset = (key: string) => {
  const found = SCALE_PRESETS.find((row) => row.key === key);
  if (!found) throw new Error(`no preset ${key}`);
  return found;
};

async function classOfStudent(api: Session["api"], studentId: string) {
  const { classes } = await api.coursework.options();
  for (const row of classes.filter((item) => item.subjectId !== null)) {
    const { roster } = await api.classes.groups({ classId: row.id });
    if (roster.some((pupil) => pupil.id === studentId)) return row;
  }
  throw new Error("the seeded student takes no class of this teacher");
}

/** Sets work, has the seeded student hand it in, and grades it out of 10. */
async function gradedWork(
  teacher: Session,
  classId: string,
  score: number,
  categoryId = "",
) {
  const student = await sessionFor("northwind", login("student"));
  const saved = await teacher.api.coursework.save({
    classId,
    title: `Graded ${score} ${Date.now()}`,
    brief: plainContent("Write about rivers."),
    audience: "class",
    latePolicy: "accept",
    submissionFormat: "online",
    points: 10,
    rubric: null,
    categoryId,
  });
  await teacher.api.coursework.publish({
    id: saved.id,
    expectedVersion: saved.version,
  });
  const draft = await student.api.coursework.saveDraft({
    assignmentId: saved.id,
    expectedVersion: 0,
    content: plainContent("Rivers widen near the sea."),
  });
  await student.api.coursework.handIn({
    assignmentId: saved.id,
    expectedVersion: draft.version,
  });
  const me = await student.api.identity.currentUser();
  const grading = await teacher.api.coursework.grading({
    assignmentId: saved.id,
    studentId: me.id,
  });
  const attempt = grading.attempts[0];
  if (!attempt) throw new Error("attempt missing");
  await teacher.api.coursework.assess({ attemptId: attempt.id, score });
  await teacher.api.coursework.act({
    assignmentId: saved.id,
    action: "return",
    studentIds: [me.id],
  });
  return { student, assignmentId: saved.id, attemptId: attempt.id };
}

const gradeOf = async (student: Session, assignmentId: string) =>
  (await student.api.coursework.work({ id: assignmentId })).attempts[0]
    ?.assessment?.grade;

describe("grade scales", () => {
  test("a class grades on its programme's scale, and new bands reach only new grades", async () => {
    const officer = await signedIn("northwind", login("principal"));
    const teacher = await teacherSession();
    const me = await (
      await sessionFor("northwind", login("student"))
    ).api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const record = await officer.classes.record({ id: target.id });

    const igcse = preset("igcse_a_star_g");
    const scale = await officer.grading.saveScale({
      titleEn: igcse.titleEn,
      titleAr: igcse.titleAr,
      display: igcse.display,
      bands: igcse.bands,
    });
    const programme = await officer.grading.saveProgramme({
      titleEn: "IGCSE",
      titleAr: null,
      parts: {
        levels: {
          gradeLevelIds: record.columns.grade ? [record.columns.grade] : [],
        },
      },
      scaleId: scale.id,
    });
    expect(
      await officer.grading.classGrading({ classId: target.id }),
    ).toMatchObject({ programmeId: null, effectiveProgrammeId: programme.id });

    const first = await gradedWork(teacher, target.id, 9);
    expect(await gradeOf(first.student, first.assignmentId)).toMatchObject({
      labelEn: "A*",
      display: "grade",
    });

    // The board raised A* to 95: earlier work keeps its A*, new work is an A.
    await officer.grading.saveBands({
      scaleId: scale.id,
      effectiveFrom: (await officer.attendance.day({})).today,
      bands: igcse.bands.map((band) =>
        band.labelEn === "A*" ? { ...band, minPercent: 95 } : band,
      ),
      reason: "The board moved the boundary",
    });
    expect(await gradeOf(first.student, first.assignmentId)).toMatchObject({
      labelEn: "A*",
    });
    const second = await gradedWork(teacher, target.id, 9);
    expect(await gradeOf(second.student, second.assignmentId)).toMatchObject({
      labelEn: "A",
    });

    const { rows } = await officer.grading.history({});
    expect(rows.some((row) => row.action === "grading_scale.bands")).toBe(true);
    expect(
      await rejection(
        officer.grading.retireScale({ id: scale.id, reason: "x" }),
      ),
    ).toMatchObject({ message: "grading.scale_in_use" });
  });

  test("a class's own scale wins over its programme's, and teachers cannot change scales", async () => {
    const officer = await signedIn("northwind", login("principal"));
    const teacher = await teacherSession();
    const me = await (
      await sessionFor("northwind", login("student"))
    ).api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const egypt = preset("egypt_bands");
    const scale = await officer.grading.saveScale({
      titleEn: egypt.titleEn,
      titleAr: egypt.titleAr,
      display: egypt.display,
      bands: egypt.bands,
    });
    await officer.grading.setClassGrade({
      classId: target.id,
      programmeId: null,
      scaleId: scale.id,
    });
    const work = await gradedWork(teacher, target.id, 8);
    expect(await gradeOf(work.student, work.assignmentId)).toMatchObject({
      labelEn: "Very good",
      labelAr: "جيد جدًا",
      display: "grade_score",
    });
    const book = await teacher.api.gradebook.classBook({ classId: target.id });
    const periodId = book.term?.periodId;
    if (!periodId) throw new Error("the seed has no term");
    await teacher.api.gradebook.savePeriodGrades({
      classId: target.id,
      periodId,
      maxScore: 100,
      grades: [{ studentId: me.id, score: 86 }],
    });
    const after = await teacher.api.gradebook.classBook({
      classId: target.id,
      periodId,
    });
    expect(
      after.term?.grades.find((row) => row.studentId === me.id)?.grade,
    ).toMatchObject({ labelEn: "Excellent", labelAr: "ممتاز" });
    expect(
      await rejection(
        teacher.api.grading.saveScale({
          titleEn: "Mine",
          titleAr: null,
          display: "grade",
          bands: egypt.bands,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    await officer.grading.setClassGrade({
      classId: target.id,
      programmeId: null,
      scaleId: null,
    });
    // Saving took the student's term grade back from them; other files read
    // it as released.
    await teacher.api.gradebook.releasePeriod({
      classId: target.id,
      periodId,
    });
  });

  test("the gradebook calculates a term grade from work weighed by its programme's categories", async () => {
    const officer = await signedIn("northwind", login("principal"));
    const teacher = await teacherSession();
    const me = await (
      await sessionFor("northwind", login("student"))
    ).api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const igcse = preset("igcse_a_star_g");
    const scale = await officer.grading.saveScale({
      titleEn: "Weighted IGCSE",
      titleAr: null,
      display: "grade",
      bands: igcse.bands,
    });
    const programme = await officer.grading.saveProgramme({
      titleEn: "Weighted programme",
      titleAr: null,
      scaleId: scale.id,
      categories: [
        { titleEn: "Tests", titleAr: null, weight: 60 },
        { titleEn: "Homework", titleAr: null, weight: 40 },
      ],
    });
    expect(
      await rejection(
        officer.grading.saveProgramme({
          titleEn: "Overweight",
          titleAr: null,
          scaleId: null,
          categories: [{ titleEn: "All", titleAr: null, weight: 90 }],
        }),
      ),
    ).toBeDefined();
    await officer.grading.setClassGrade({
      classId: target.id,
      programmeId: programme.id,
      scaleId: null,
    });
    const plan = await teacher.api.grading.classPlan({ classId: target.id });
    expect(plan).toMatchObject({
      programme: { id: programme.id, derived: false },
      scale: { id: scale.id, own: false },
    });
    const { categories } = plan;
    const tests = categories.find((row) => row.titleEn === "Tests");
    const homework = categories.find((row) => row.titleEn === "Homework");
    if (!tests || !homework) throw new Error("categories missing");

    await gradedWork(teacher, target.id, 8, tests.id);
    await gradedWork(teacher, target.id, 5, homework.id);
    const book = await teacher.api.gradebook.classBook({ classId: target.id });
    // Tests 80% at 60, homework 50% at 40: 68%, a C on IGCSE A* to G.
    const mine = book.calculated.find((row) => row.studentId === me.id);
    expect(mine?.percent).toBeCloseTo(68);
    expect(mine?.grade).toMatchObject({ labelEn: "C" });
    await officer.grading.setClassGrade({
      classId: target.id,
      programmeId: null,
      scaleId: null,
    });
  });
});
