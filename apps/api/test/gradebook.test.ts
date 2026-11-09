import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

const arabicTeacher = () => signedIn("northwind", login("teacher", 0, 1));
const englishTeacher = () => signedIn("northwind", login("teacher", 0, 2));

async function studentClass(api: Awaited<ReturnType<typeof arabicTeacher>>) {
  const student = await signedIn("northwind", login("student"));
  const me = await student.identity.currentUser();
  const { classes } = await api.coursework.options();
  for (const row of classes.filter((item) => item.classType === "scheduled")) {
    const book = await api.gradebook.classBook({ classId: row.id });
    if (book.students.some((pupil) => pupil.id === me.id))
      return { student, me, book };
  }
  throw new Error("the seeded student takes no Arabic class");
}

describe("gradebook", () => {
  test("a class book shows each student's results and the term grades", async () => {
    const api = await arabicTeacher();
    const { book, me } = await studentClass(api);
    expect(book.periodId).toBeTruthy();
    expect(book.grades.length).toBe(book.students.length);
    expect(book.assignments.map((row) => row.title)).toContain(
      "Chapter 1 review",
    );
    expect(
      book.results.filter((row) => row.studentId === me.id).length,
    ).toBeGreaterThan(0);
  });

  test("a changed term grade waits to be released before the student and family see it", async () => {
    const api = await arabicTeacher();
    const { book, me, student } = await studentClass(api);
    const periodId = book.periodId;
    if (!periodId) throw new Error("seed term");
    const before = await student.gradebook.student({});
    expect(
      before.rows.find((row) => row.classId === book.class.id)?.score,
    ).toBeTypeOf("number");

    await api.gradebook.savePeriodGrades({
      classId: book.class.id,
      periodId,
      grades: [{ studentId: me.id, score: 95, comment: "Excellent term." }],
    });
    const hidden = await student.gradebook.student({});
    expect(hidden.rows.some((row) => row.classId === book.class.id)).toBe(
      false,
    );
    await api.gradebook.releasePeriod({ classId: book.class.id, periodId });
    const shown = await student.gradebook.student({});
    expect(
      shown.rows.find((row) => row.classId === book.class.id),
    ).toMatchObject({ score: 95, comment: "Excellent term." });

    const parent = await signedIn(
      "northwind",
      login("student").replace("student", "parent"),
    );
    const family = await parent.gradebook.student({ studentId: me.id });
    expect(
      family.rows.find((row) => row.classId === book.class.id)?.score,
    ).toBe(95);
    // Both hear the grades are out, the family about the child by name.
    const told = <T extends { kind: string; subjectId: string }>(rows: T[]) =>
      rows.filter((row) => row.kind === "grades" && row.subjectId === periodId);
    expect(
      told((await student.notifications.list({ tab: "all" })).rows).length,
    ).toBeGreaterThan(0);
    const familyNotice = told(
      (await parent.notifications.list({ tab: "all" })).rows,
    )[0];
    expect(familyNotice?.params.studentId).toBe(me.id);
    expect(
      await rejection(
        api.gradebook.savePeriodGrades({
          classId: book.class.id,
          periodId,
          grades: [{ studentId: me.id, score: 120, comment: "" }],
        }),
      ),
    ).toMatchObject({ message: "gradebook.score_range" });
  });

  test("a class book says whose work is in, late or missing, and which term is under way", async () => {
    const api = await arabicTeacher();
    const { book, me, student } = await studentClass(api);
    const saved = await api.coursework.save({
      classId: book.class.id,
      title: `Overdue ${Date.now()}`,
      brief: plainContent("Write about rivers."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "online",
      points: 10,
      rubric: null,
      dueAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    await api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const draft = await student.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent("Rivers widen near the sea."),
    });
    await student.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: draft.version,
    });
    const after = await api.gradebook.classBook({ classId: book.class.id });
    const of = (mine: boolean) =>
      after.results.find(
        (row) =>
          row.assignmentId === saved.id && (row.studentId === me.id) === mine,
      );
    expect(of(true)).toMatchObject({
      handedIn: true,
      isLate: true,
      missing: false,
      score: null,
    });
    expect(of(false)).toMatchObject({ handedIn: false, missing: true });
    expect(after.currentPeriodId).toBe(book.periodId);
  });

  test("a teacher who does not teach the class opens no book", async () => {
    const api = await arabicTeacher();
    const { book } = await studentClass(api);
    const other = await englishTeacher();
    expect(
      await rejection(other.gradebook.classBook({ classId: book.class.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});
