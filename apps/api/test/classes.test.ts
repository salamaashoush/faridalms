import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

async function principal() {
  return signedIn("northwind", login("principal"));
}

describe("class directory and records", () => {
  test("the principal lists each homeroom with its teacher, size and subject classes", async () => {
    const api = await principal();
    const list = await api.classes.directory({});
    expect(list.rows.length).toBe(3);
    for (const homeroom of list.rows) {
      expect(homeroom.teachers[0]?.isPrimary).toBe(true);
      expect(homeroom.students).toBe(6);
      expect(homeroom.subjects).toHaveLength(4);
    }
    expect(list.manage).toBe(true);
  });

  test("a teacher sees the classes they teach and their students, and no other class", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const mine = await teacher.classes.mine({});
    expect(mine.rows.length).toBeGreaterThan(0);
    const homeroom = mine.rows.find((row) => row.classType === "homeroom");
    if (!homeroom) throw new Error("seed homeroom teacher");
    const record = await teacher.classes.record({ id: homeroom.id });
    expect(record.roster.length).toBe(6);
    expect(record.subjects).toHaveLength(4);
    const everyone = (await (await principal()).classes.directory({})).rows;
    const other = everyone.find((row) => row.id !== homeroom.id);
    if (!other) throw new Error("seed second homeroom");
    expect(
      await rejection(teacher.classes.record({ id: other.id })),
    ).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("a family opens their child's classes and sees only their own child", async () => {
    const parent = await signedIn("northwind", login("parent"));
    const api = await principal();
    const everyone = (await api.classes.directory({})).rows;
    let seen = 0;
    for (const homeroom of everyone) {
      const result = await parent.classes.record({ id: homeroom.id }).then(
        (record) => record,
        () => null,
      );
      if (!result) continue;
      seen += 1;
      expect(result.access.staff).toBe(false);
      expect(result.roster.length).toBeGreaterThanOrEqual(1);
      expect(result.roster.length).toBeLessThan(result.subjects.length + 6);
      const subject = result.subjects[0];
      if (subject)
        expect((await parent.classes.record({ id: subject.id })).id).toBe(
          subject.id,
        );
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("saving classes", () => {
  test("a class is created with subjects, then a subject is dropped and a teacher changed", async () => {
    const api = await principal();
    const options = await api.classes.options();
    const year = options.workingYearId ?? "";
    const [first, second] = options.teachers.filter((row) => row.teaches);
    const [arabic, science] = [
      options.subjects.find((row) => row.code === "arabic"),
      options.subjects.find((row) => row.code === "science"),
    ];
    if (!first || !second || !arabic || !science)
      throw new Error("seed options");
    const saved = await api.classes.save({
      yearId: year,
      code: "T-B",
      titleEn: "Test B",
      titleAr: "اختبار ب",
      gradeId: options.grades[0]?.id ?? "",
      homeroomTeacherId: first.id,
      subjects: [
        { subjectId: arabic.id, teacherIds: [first.id] },
        { subjectId: science.id, teacherIds: [second.id] },
      ],
    });
    const record = await api.classes.record({ id: saved.id });
    expect(record.teachers.map((row) => row.userId)).toEqual([first.id]);
    expect(new Set(record.subjects.map((row) => row.subjectId))).toEqual(
      new Set([arabic.id, science.id]),
    );
    await api.classes.save({
      id: saved.id,
      expectedVersion: saved.version,
      yearId: year,
      code: "T-B",
      titleEn: "Test B",
      titleAr: "اختبار ب",
      gradeId: options.grades[0]?.id ?? "",
      homeroomTeacherId: second.id,
      subjects: [{ subjectId: arabic.id, teacherIds: [second.id] }],
    });
    const after = await api.classes.record({ id: saved.id });
    expect(after.teachers.map((row) => row.userId)).toEqual([second.id]);
    expect(after.subjects.map((row) => row.subjectId)).toEqual([arabic.id]);
    expect(after.subjects[0]?.teachers.map((row) => row.userId)).toEqual([
      second.id,
    ]);
    expect(
      await rejection(
        api.classes.save({
          yearId: year,
          code: "T-B",
          titleEn: "Duplicate",
          subjects: [],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "class.code_taken" });
  });

  test("a teacher cannot save classes", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const options = await (await principal()).classes.options();
    expect(
      await rejection(
        teacher.classes.save({
          yearId: options.workingYearId ?? "",
          code: "NOPE",
          titleEn: "Nope",
          subjects: [],
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("enrolment", () => {
  test("a move ends the old homeroom on the day and starts the new one", async () => {
    const api = await principal();
    const list = (await api.classes.directory({})).rows.filter(
      (row) => row.students > 0,
    );
    const [from, to] = list;
    if (!from || !to) throw new Error("seed homerooms");
    const student = (await api.classes.record({ id: from.id })).roster[0];
    if (!student) throw new Error("seed student");
    const year = (await api.classes.directory({})).year;
    if (!year) throw new Error("seed year");
    const moved = await api.classes.enrol({
      studentId: student.userId,
      classId: to.id,
    });
    expect(moved.moved).toBe(true);
    const history = await api.classes.history({ studentId: student.userId });
    const [latest, earlier] = history;
    expect(latest?.classId).toBe(to.id);
    expect(earlier?.classId).toBe(from.id);
    expect(earlier?.to).toBe(latest?.from);
    const placed = (await api.people.students({ q: student.reference ?? "" }))
      .rows[0];
    expect(placed?.homeroom?.classId).toBe(to.id);
  });

  test("a placement scheduled after the date blocks an immediate move", async () => {
    const api = await principal();
    const list = (await api.classes.directory({})).rows.filter(
      (row) => row.students > 0,
    );
    const [a, b, c] = list;
    if (!a || !b || !c) throw new Error("seed homerooms");
    const student = (await api.classes.record({ id: c.id })).roster.at(-1);
    const year = (await api.classes.directory({})).year;
    if (!student || !year) throw new Error("seed student");
    const later = new Date(`${year.endsBefore}T00:00:00Z`);
    later.setUTCDate(later.getUTCDate() - 20);
    await api.classes.enrol({
      studentId: student.userId,
      classId: b.id,
      from: later.toISOString().slice(0, 10),
    });
    expect(
      await rejection(
        api.classes.enrol({ studentId: student.userId, classId: a.id }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: "enrollment.future_placement",
    });
  });

  test("a backdated move cannot reach over a register already taken", async () => {
    const api = await principal();
    const list = (await api.classes.directory({})).rows.filter(
      (row) => row.students > 0,
    );
    const homeroom = list.at(-1);
    const other = list[0];
    if (!homeroom || !other) throw new Error("seed homerooms");
    const marked = "2026-09-15";
    const student = (await api.classes.record({ id: homeroom.id, on: marked }))
      .roster[0];
    if (!student) throw new Error("seed student");
    const before = await api.classes.history({ studentId: student.userId });
    expect(
      await rejection(
        api.classes.enrol({
          studentId: student.userId,
          classId: other.id,
          from: marked,
        }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(
        /^enrollment\.registers_after:\d{4}-\d{2}-\d{2}$/,
      ),
    });
    expect(await api.classes.history({ studentId: student.userId })).toEqual(
      before,
    );
  });

  test("withdrawing keeps the days already spent in the class", async () => {
    const api = await principal();
    const list = (await api.classes.directory({})).rows.filter(
      (row) => row.students > 0,
    );
    const homeroom = list[1];
    if (!homeroom) throw new Error("seed homeroom");
    const record = await api.classes.record({ id: homeroom.id });
    const student = record.roster.find((row) => row.from < record.on);
    if (!student) throw new Error("seed student");
    // Other suites take today's registers in some homerooms, and a student
    // marked on the day cannot leave before it; tomorrow is clear of them.
    await api.classes.withdraw({
      studentId: student.userId,
      enrollmentId: student.enrollmentId,
      expectedVersion: student.version,
      on: addDays(record.on, 1),
    });
    const history = await api.classes.history({ studentId: student.userId });
    const episode = history.find((row) => row.id === student.enrollmentId);
    expect(episode?.from).toBe(student.from);
    expect(episode && episode.to < student.to).toBe(true);
  });
});

describe("subjects", () => {
  test("a school adds its own subject and relabels a shared one only for itself", async () => {
    const api = await principal();
    const added = await api.classes.saveSubject({
      code: "robotics",
      labelEn: "Robotics",
      labelAr: "الروبوتات",
      color: "#336699",
    });
    const shared = (await api.classes.subjects()).rows.find(
      (row) => row.code === "art",
    );
    if (!shared) throw new Error("seed art");
    await api.classes.saveSubject({
      id: shared.id,
      code: "art",
      labelEn: "Visual art",
      labelAr: "الفنون البصرية",
      expected: {
        labelEn: shared.labelEn ?? "",
        labelAr: shared.labelAr ?? "",
      },
    });
    // A sheet opened before that save would put back what it showed.
    expect(
      await rejection(
        api.classes.saveSubject({
          id: shared.id,
          code: "art",
          labelEn: "Fine art",
          labelAr: "الفنون الجميلة",
          expected: {
            labelEn: shared.labelEn ?? "",
            labelAr: shared.labelAr ?? "",
          },
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "conflict.version" });
    const here = (await api.classes.subjects()).rows;
    expect(here.find((row) => row.id === added.id)?.schoolOnly).toBe(true);
    expect(here.find((row) => row.id === shared.id)?.labelEn).toBe(
      "Visual art",
    );
    const east = await signedIn("northwind-east", login("principal", 0, 1));
    const there = (await east.classes.subjects()).rows;
    expect(there.find((row) => row.id === shared.id)?.labelEn).toBe("Art");
    expect(there.some((row) => row.id === added.id)).toBe(false);
  });
});
