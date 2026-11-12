import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

async function principal() {
  return signedIn("northwind", login("principal"));
}

type Api = Awaited<ReturnType<typeof principal>>;

/** The students of a class on its record's day. */
async function studentsOf(api: Api, classId: string, on = "") {
  return (await api.classes.record({ id: classId, on })).roster
    .map((row) => row.userId)
    .toSorted();
}

/** Whether every subject class of a homeroom has exactly the homeroom's students. */
async function subjectsFollow(api: Api, homeroomId: string, on = "") {
  const of = await api.homerooms.ofClass({ classId: homeroomId, on });
  if (of.kind !== "homeroom") throw new Error("not a homeroom");
  const members = await studentsOf(api, homeroomId, on);
  for (const subject of of.subjects)
    expect(await studentsOf(api, subject.id, on)).toEqual(members);
  return of.subjects.length;
}

describe("the homeroom directory", () => {
  test("the principal lists each homeroom with its teacher, size and subject classes", async () => {
    const api = await principal();
    const list = await api.homerooms.directory({});
    expect(list.rows.length).toBe(3);
    for (const homeroom of list.rows) {
      expect(homeroom.teachers[0]?.isPrimary).toBe(true);
      expect(homeroom.students).toBe(6);
      expect(homeroom.subjects).toHaveLength(4);
      expect(await subjectsFollow(api, homeroom.id)).toBe(4);
    }
    expect(list.manage).toBe(true);
  });

  test("a homeroom's subject classes say whose they are, and a class of its own says nothing", async () => {
    const api = await principal();
    const [homeroom] = (await api.homerooms.directory({})).rows;
    const subject = homeroom?.subjects[0];
    if (!homeroom || !subject) throw new Error("seed homeroom");
    expect(
      await api.homerooms.ofClass({ classId: subject.classId }),
    ).toMatchObject({ kind: "subject", homeroom: { id: homeroom.id } });
  });
});

describe("reach through a homeroom", () => {
  test("a homeroom teacher opens its subject classes, and a subject teacher the homeroom", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const mine = (await teacher.classes.mine({})).rows;
    const homeroom = mine.find((row) => row.group?.own);
    if (!homeroom) throw new Error("seed homeroom teacher");
    const of = await teacher.homerooms.ofClass({ classId: homeroom.id });
    if (of.kind !== "homeroom") throw new Error("not a homeroom");
    const notTaught = of.subjects.find(
      (row) => !mine.some((own) => own.id === row.id),
    );
    if (notTaught)
      expect((await teacher.classes.record({ id: notTaught.id })).id).toBe(
        notTaught.id,
      );
    const subjectOnly = mine.find(
      (row) => row.group && !row.group.own && row.group.classId !== homeroom.id,
    );
    if (subjectOnly?.group)
      expect(
        (await teacher.classes.record({ id: subjectOnly.group.classId })).id,
      ).toBe(subjectOnly.group.classId);
    expect(notTaught ?? subjectOnly).toBeDefined();
  });
});

describe("saving homerooms", () => {
  test("a homeroom is created with subjects, then a subject is dropped and a teacher changed", async () => {
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
    const saved = await api.homerooms.save({
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
    const made = await api.homerooms.ofClass({ classId: saved.id });
    if (made.kind !== "homeroom") throw new Error("not a homeroom");
    expect(new Set(made.subjects.map((row) => row.subjectId))).toEqual(
      new Set([arabic.id, science.id]),
    );
    await api.homerooms.save({
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
    const changed = await api.homerooms.ofClass({ classId: saved.id });
    if (changed.kind !== "homeroom") throw new Error("not a homeroom");
    expect(changed.subjects.map((row) => row.subjectId)).toEqual([arabic.id]);
    expect(changed.subjects[0]?.teachers.map((row) => row.userId)).toEqual([
      second.id,
    ]);
    expect(
      await rejection(
        api.homerooms.save({
          yearId: year,
          code: "T-B",
          titleEn: "Duplicate",
          subjects: [],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "class.code_taken" });
  });

  test("a subject added to a homeroom takes its students from that day", async () => {
    const api = await principal();
    const options = await api.classes.options();
    const homeroom = (await api.homerooms.directory({})).rows[2];
    const art = options.subjects.find((row) => row.code === "art");
    if (!homeroom || !art) throw new Error("seed homeroom");
    const record = await api.classes.record({ id: homeroom.id });
    await api.homerooms.save({
      id: homeroom.id,
      expectedVersion: homeroom.version,
      yearId: options.workingYearId ?? "",
      code: homeroom.code,
      titleEn: homeroom.titleEn ?? "",
      titleAr: homeroom.titleAr ?? "",
      gradeId: homeroom.gradeId ?? "",
      locationId: homeroom.locationId ?? "",
      homeroomTeacherId: homeroom.teachers[0]?.userId ?? "",
      subjects: [
        ...homeroom.subjects.flatMap((row) =>
          row.subjectId
            ? [
                {
                  subjectId: row.subjectId,
                  teacherIds: row.teacher ? [row.teacher.userId] : [],
                },
              ]
            : [],
        ),
        { subjectId: art.id, teacherIds: [] },
      ],
    });
    expect(await subjectsFollow(api, homeroom.id)).toBe(5);
    const of = await api.homerooms.ofClass({ classId: homeroom.id });
    if (of.kind !== "homeroom") throw new Error("not a homeroom");
    const added = of.subjects.find((row) => row.subjectId === art.id);
    if (!added) throw new Error("art was not added");
    const joined = (await api.classes.record({ id: added.id })).roster;
    expect(joined.every((row) => row.from === record.on)).toBe(true);
    // Put back, so the other suites find the homeroom as the seed made it.
    const changed = (await api.homerooms.directory({})).rows.find(
      (row) => row.id === homeroom.id,
    );
    await api.homerooms.save({
      id: homeroom.id,
      expectedVersion: changed?.version ?? homeroom.version,
      yearId: options.workingYearId ?? "",
      code: homeroom.code,
      titleEn: homeroom.titleEn ?? "",
      titleAr: homeroom.titleAr ?? "",
      gradeId: homeroom.gradeId ?? "",
      locationId: homeroom.locationId ?? "",
      homeroomTeacherId: homeroom.teachers[0]?.userId ?? "",
      subjects: homeroom.subjects.flatMap((row) =>
        row.subjectId
          ? [
              {
                subjectId: row.subjectId,
                teacherIds: row.teacher ? [row.teacher.userId] : [],
              },
            ]
          : [],
      ),
    });
    expect(await subjectsFollow(api, homeroom.id)).toBe(4);
  });

  test("a teacher cannot save homerooms", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const options = await (await principal()).classes.options();
    expect(
      await rejection(
        teacher.homerooms.save({
          yearId: options.workingYearId ?? "",
          code: "NOPE",
          titleEn: "Nope",
          subjects: [],
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("a student's place in a homeroom", () => {
  test("a move ends the old homeroom on the day and starts the new one, with their subject classes", async () => {
    const api = await principal();
    const list = (await api.homerooms.directory({})).rows.filter(
      (row) => row.students > 0,
    );
    const [from, to] = list;
    if (!from || !to) throw new Error("seed homerooms");
    const student = (await api.classes.record({ id: from.id })).roster[0];
    if (!student) throw new Error("seed student");
    const moved = await api.homerooms.place({
      studentId: student.userId,
      classId: to.id,
    });
    expect(moved.moved).toBe(true);
    const { rows } = await api.homerooms.history({
      studentId: student.userId,
    });
    const [latest, earlier] = rows;
    expect(latest?.classId).toBe(to.id);
    expect(earlier?.classId).toBe(from.id);
    expect(earlier?.to).toBe(latest?.from);
    const placed = (await api.people.students({ q: student.reference ?? "" }))
      .rows[0];
    expect(placed?.group?.classId).toBe(to.id);
    await subjectsFollow(api, from.id);
    await subjectsFollow(api, to.id);
    // Put back, so the other suites find the student where the seed put them.
    await api.homerooms.place({ studentId: student.userId, classId: from.id });
    expect(await studentsOf(api, to.id)).not.toContain(student.userId);
    await subjectsFollow(api, from.id);
  });

  test("a placement scheduled after the date blocks an immediate move", async () => {
    const api = await principal();
    const list = (await api.homerooms.directory({})).rows.filter(
      (row) => row.students > 0,
    );
    const [a, b, c] = list;
    if (!a || !b || !c) throw new Error("seed homerooms");
    const student = (await api.classes.record({ id: c.id })).roster[1];
    const year = (await api.classes.directory({})).year;
    if (!student || !year) throw new Error("seed student");
    const later = addDays(year.endsBefore, -20);
    const scheduled = await api.homerooms.place({
      studentId: student.userId,
      classId: b.id,
      from: later,
    });
    expect(
      await rejection(
        api.homerooms.place({ studentId: student.userId, classId: a.id }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: "enrollment.future_placement",
    });
    // Put back, so the other suites find the student where the seed put them.
    const { rows } = await api.homerooms.history({
      studentId: student.userId,
    });
    const future = rows.find((row) => row.enrollmentId === scheduled.id);
    if (!future) throw new Error("the scheduled place");
    await api.homerooms.leave({
      studentId: student.userId,
      enrollmentId: future.enrollmentId,
      expectedVersion: future.version,
      on: later,
    });
  });

  test("a backdated move cannot reach over a register already taken", async () => {
    const api = await principal();
    const list = (await api.homerooms.directory({})).rows.filter(
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
        api.homerooms.place({
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

  test("leaving keeps the days already spent, in the homeroom and its subject classes", async () => {
    const api = await principal();
    const list = (await api.homerooms.directory({})).rows.filter(
      (row) => row.students > 0,
    );
    const homeroom = list[1];
    if (!homeroom) throw new Error("seed homeroom");
    const record = await api.classes.record({ id: homeroom.id });
    const student = record.roster.find((row) => row.from < record.on);
    if (!student) throw new Error("seed student");
    // Other suites take today's registers in some homerooms, and a student
    // marked on the day cannot leave before it; tomorrow is clear of them.
    const leaving = addDays(record.on, 1);
    await api.homerooms.leave({
      studentId: student.userId,
      enrollmentId: student.enrollmentId,
      expectedVersion: student.version,
      on: leaving,
    });
    const { rows } = await api.homerooms.history({
      studentId: student.userId,
    });
    const place = rows.find((row) => row.enrollmentId === student.enrollmentId);
    expect(place?.from).toBe(student.from);
    expect(place?.to).toBe(leaving);
    const kept = await api.classes.history({ studentId: student.userId });
    expect(
      kept
        .filter((row) => row.source === "homeroom")
        .every((row) => row.to <= leaving),
    ).toBe(true);
    await subjectsFollow(api, homeroom.id, leaving);
  });
});
