import { plainContent } from "@faridalms/domain/content-conversion";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";

import { login, rejection, seeded, setPlan, signedIn } from "./harness";

async function principal() {
  return signedIn("northwind", login("principal"));
}

/** The working year, as a class in it is made. */
async function workingYear(api: Awaited<ReturnType<typeof principal>>) {
  const options = await api.years.options();
  const year = options.years.find((row) => row.id === options.workingYearId);
  if (!year) throw new Error("seed working year");
  return {
    ...year,
    lastDay: addDays(year.endsBefore, -1),
    part: { year: { yearId: year.id } },
  };
}

describe("class directory and records", () => {
  test("the principal lists every class of the year, subject classes among them, with teachers and size", async () => {
    const api = await principal();
    const list = await api.classes.directory({});
    const codes = list.rows.map((row) => row.code);
    for (const grade of ["7", "8", "9"])
      for (const code of [`${grade}-A`, `${grade}-A-ARAB`, `${grade}-A-MATH`])
        expect(codes).toContain(code);
    for (const row of list.rows.filter((item) => item.code.startsWith("7-A")))
      expect(row.teachers[0]?.isPrimary).toBe(true);
    const sizeOf = (code: string) =>
      list.rows.find((row) => row.code === code)?.students;
    expect(sizeOf("8-A-ARAB")).toBe(sizeOf("8-A"));
    expect(sizeOf("8-A")).toBeGreaterThan(0);
    expect(list.manage).toBe(true);
  });

  test("a teacher sees the classes they teach and their students, and no other class", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const mine = await teacher.classes.mine({});
    expect(mine.rows.length).toBeGreaterThan(0);
    const homeroom = mine.rows.find((row) => row.group?.own);
    if (!homeroom) throw new Error("seed homeroom teacher");
    const record = await teacher.classes.record({ id: homeroom.id });
    expect(record.roster.length).toBe(homeroom.students);
    expect(record.roster.length).toBeGreaterThan(0);
    const everyone = (await (await principal()).homerooms.directory({})).rows;
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
    for (const row of everyone) {
      const result = await parent.classes.record({ id: row.id }).then(
        (record) => record,
        () => null,
      );
      if (!result) continue;
      seen += 1;
      expect(result.access.staff).toBe(false);
      expect(result.roster.length).toBeGreaterThanOrEqual(1);
      expect(result.roster.length).toBeLessThan(6);
    }
    expect(seen).toBeGreaterThan(1);
  });
});

describe("a class of its own", () => {
  test("is made without a course or subject, takes a student and gives one back", async () => {
    const api = await principal();
    const options = await api.classes.options();
    const year = await workingYear(api);
    const [teacher] = options.teachers.filter((row) => row.teaches);
    if (!teacher) throw new Error("seed teacher");
    const saved = await api.classes.save({
      startsOn: year.startsOn,
      endsOn: year.lastDay,
      parts: year.part,
      code: "CLUB-1",
      titleEn: "Chess club",
      titleAr: "نادي الشطرنج",
      teacherIds: [teacher.id],
    });
    const made = await api.classes.record({ id: saved.id });
    expect(made).toMatchObject({
      subjectId: null,
      courseId: null,
      runs: { from: year.startsOn, to: year.endsBefore },
    });
    expect((await api.years.ofClass({ classId: saved.id })).year?.id).toBe(
      year.id,
    );
    expect(made.teachers.map((row) => row.userId)).toEqual([teacher.id]);
    expect(made.roster).toEqual([]);

    const someone = (
      await api.classes.record({
        id:
          (await api.homerooms.directory({})).rows.find(
            (row) => row.students > 0,
          )?.id ?? "",
      })
    ).roster[0];
    if (!someone) throw new Error("seed student");
    const enrolled = await api.classes.enrol({
      studentId: someone.userId,
      classId: saved.id,
    });
    expect(enrolled.moved).toBe(false);
    const record = await api.classes.record({ id: saved.id });
    expect(record.roster.map((row) => row.userId)).toEqual([someone.userId]);
    expect(record.roster[0]?.source).toBe("manual");

    const episode = record.roster[0];
    if (!episode) throw new Error("enrolled");
    await api.classes.withdraw({
      studentId: someone.userId,
      enrollmentId: episode.enrollmentId,
      expectedVersion: episode.version,
      on: record.on,
    });
    expect((await api.classes.record({ id: saved.id })).roster).toEqual([]);
  });

  test("a teacher cannot save classes", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.classes.save({
          startsOn: "2026-09-13",
          code: "NOPE",
          titleEn: "Nope",
          teacherIds: [],
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("a code used by a class whose dates overlap is refused, and is free for one that starts after it ends", async () => {
    const api = await principal();
    const year = await workingYear(api);
    expect(
      await rejection(
        api.classes.save({
          startsOn: year.startsOn,
          endsOn: year.lastDay,
          parts: year.part,
          code: "7-A",
          titleEn: "Duplicate",
          teacherIds: [],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "class.code_taken" });
    const later = await api.classes.save({
      startsOn: year.endsBefore,
      endsOn: addDays(year.endsBefore, 20),
      code: "7-A",
      titleEn: "Seven A over the summer",
      teacherIds: [],
    });
    expect((await api.classes.record({ id: later.id })).runs).toEqual({
      from: year.endsBefore,
      to: addDays(year.endsBefore, 21),
    });
  });

  test("a class in a year keeps its dates inside it", async () => {
    const api = await principal();
    const year = await workingYear(api);
    expect(
      await rejection(
        api.classes.save({
          startsOn: year.startsOn,
          parts: year.part,
          code: "OPEN-YEAR",
          titleEn: "Runs on past its year",
          teacherIds: [],
        }),
      ),
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "school_year.class_outside",
    });
    const saved = await api.classes.save({
      startsOn: year.startsOn,
      endsOn: year.lastDay,
      parts: year.part,
      code: "IN-YEAR",
      titleEn: "In its year",
      teacherIds: [],
    });
    const made = await api.classes.record({ id: saved.id });
    expect(
      await rejection(
        api.classes.save({
          id: saved.id,
          expectedVersion: made.version,
          startsOn: year.startsOn,
          code: "IN-YEAR",
          titleEn: "In its year",
          teacherIds: [],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "school_year.class_outside" });
  });

  test("a closed year's classes take no enrolments, and a class with no year takes an assignment", async () => {
    const api = await principal();
    const created = await api.years.save({
      titleEn: "Salama's closed year",
      titleAr: "",
      startsOn: "2041-09-01",
      endsOn: "2042-06-15",
      terms: [],
    });
    const saved = await api.classes.save({
      startsOn: "2041-09-01",
      endsOn: "2042-06-15",
      parts: { year: { yearId: created.id } },
      code: "CLOSED-1",
      titleEn: "In a closed year",
      teacherIds: [],
    });
    await api.years.lifecycle({
      id: created.id,
      expectedVersion: created.version,
      action: "close",
    });
    const someone = (
      await api.classes.record({
        id:
          (await api.classes.directory({})).rows.find((row) => row.students > 0)
            ?.id ?? "",
      })
    ).roster[0];
    if (!someone) throw new Error("seed student");
    expect(
      await rejection(
        api.classes.enrol({ studentId: someone.userId, classId: saved.id }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "school_year.closed" });
    expect((await api.classes.record({ id: saved.id })).access.enrol).toBe(
      false,
    );

    const yearless = await api.classes.save({
      startsOn: "2026-09-13",
      code: "NO-YEAR-1",
      titleEn: "In no year",
      teacherIds: [],
    });
    // Work, lessons and registers belong to no year: a class in none takes
    // an assignment, and is planned and registered like any other.
    const work = await api.coursework.save({
      classId: yearless.id,
      title: "Work for a class in no year",
      brief: plainContent("Instructions."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    expect((await api.coursework.editor({ id: work.id })).classId).toBe(
      yearless.id,
    );
    const week = await api.timetable.classWeek({ classId: yearless.id });
    expect(week).toMatchObject({ canPlan: true, gridClassId: yearless.id });
    expect(week.week.meetings).toEqual([]);
    expect(
      await api.attendance.classSummary({ classId: yearless.id }),
    ).toMatchObject({ registers: 0, canRecord: true });
    expect(
      (await api.classes.directory({ views: { year: created.id } })).manage,
    ).toBe(false);
  });

  test("ending a class ends its enrolments on the day, and widening it carries them on", async () => {
    const api = await principal();
    const year = await workingYear(api);
    const saved = await api.classes.save({
      startsOn: year.startsOn,
      code: "END-ME",
      titleEn: "Ends early",
      teacherIds: [],
    });
    const someone = (
      await api.classes.record({
        id:
          (await api.homerooms.directory({})).rows.find(
            (row) => row.students > 0,
          )?.id ?? "",
      })
    ).roster[0];
    if (!someone) throw new Error("seed student");
    await api.classes.enrol({
      studentId: someone.userId,
      classId: saved.id,
      from: year.startsOn,
    });
    const before = await api.classes.record({ id: saved.id });
    expect(before.roster[0]?.to).toBeNull();
    const end = addDays(year.startsOn, 30);
    await api.classes.save({
      id: saved.id,
      expectedVersion: before.version,
      startsOn: year.startsOn,
      endsOn: end,
      code: "END-ME",
      titleEn: "Ends early",
      teacherIds: [],
    });
    const ended = await api.classes.record({
      id: saved.id,
      on: year.startsOn,
    });
    expect(ended.runs.to).toBe(addDays(end, 1));
    expect(ended.roster[0]?.to).toBe(addDays(end, 1));
    await api.classes.save({
      id: saved.id,
      expectedVersion: ended.version,
      startsOn: year.startsOn,
      code: "END-ME",
      titleEn: "Ends early",
      teacherIds: [],
    });
    expect(
      (await api.classes.record({ id: saved.id, on: year.startsOn })).roster[0]
        ?.to,
    ).toBeNull();
  });
});

const schoolOf = (slug: string) => {
  const school = seeded()
    .tenants.flatMap((tenant) => tenant.schools)
    .find((row) => row.slug === slug);
  if (!school) throw new Error(`no ${slug} school`);
  return school;
};

/** Runs with the school's plan leaving these modules out, then puts its plan back. */
async function without(
  slug: string,
  modules: readonly string[],
  run: () => Promise<void>,
) {
  await setPlan(schoolOf(slug).id, {
    modules: MODULE_IDS.filter((module) => !modules.includes(module)),
  });
  try {
    await run();
  } finally {
    await setPlan(schoolOf(slug).id, null);
  }
}

for (const off of [["school_years"], ["school_years", "homerooms"]])
  describe(`a school without ${off.join(" or ")}`, () => {
    test("makes a class that keeps running, enrols a student, lists it with no year, and ends it", async () => {
      await without("acme", off, async () => {
        const api = await signedIn("acme", login("principal", 1));
        const options = await api.classes.options();
        const student = (
          await api.people.students({ q: "", pageSize: 25 })
        ).rows.find((row) => row.status === "enrolled");
        if (!student) throw new Error("seed student");
        const code = `PY-${off.length}`;
        const saved = await api.classes.save({
          startsOn: options.today,
          code,
          titleEn: "Python from scratch",
          teacherIds: [],
        });
        await api.classes.enrol({ studentId: student.id, classId: saved.id });
        const listed = await api.classes.directory({});
        expect(listed.rows.map((row) => row.code)).toContain(code);
        const record = await api.classes.record({ id: saved.id });
        expect(record).not.toHaveProperty("year");
        expect(record.runs).toEqual({ from: options.today, to: null });
        expect(record.roster.map((row) => row.userId)).toEqual([student.id]);
        expect(record.roster[0]?.to).toBeNull();
        const history = await api.classes.history({ studentId: student.id });
        expect(history.find((row) => row.classId === saved.id)?.to).toBeNull();

        expect(
          await rejection(api.classes.directory({ views: { year: "all" } })),
        ).toMatchObject({
          code: "BAD_REQUEST",
          message: "classes.view_unknown",
        });
        expect(
          await rejection(
            api.classes.save({
              startsOn: options.today,
              code: `${code}-B`,
              titleEn: "A year part",
              teacherIds: [],
              parts: { year: { yearId: "" } },
            }),
          ),
        ).toMatchObject({
          code: "BAD_REQUEST",
          message: "classes.part_unknown",
        });
        for (const call of [
          () => api.years.directory(),
          () => api.years.options(),
          () => api.rollover.asking(),
        ])
          expect(await rejection(call())).toMatchObject({ code: "NOT_FOUND" });

        const end = addDays(options.today, 10);
        await api.classes.save({
          id: saved.id,
          expectedVersion: record.version,
          startsOn: options.today,
          endsOn: end,
          code,
          titleEn: "Python from scratch",
          teacherIds: [],
        });
        const ended = await api.classes.record({ id: saved.id });
        expect(ended.roster[0]?.to).toBe(addDays(end, 1));
        const next = await api.classes.save({
          startsOn: addDays(end, 1),
          code,
          titleEn: "Python again",
          teacherIds: [],
        });
        expect(next.id).not.toBe(saved.id);
      });
    });

    test("lists students by their roles, and a leaver leaves and comes back as they were", async () => {
      await without("acme", off, async () => {
        const api = await signedIn("acme", login("principal", 1));
        const list = await api.people.students({ q: "", pageSize: 50 });
        expect(list).not.toHaveProperty("year");
        expect(list.rows.length).toBeGreaterThan(0);
        expect(list.rows.every((row) => row.grade === null)).toBe(true);
        const student = list.rows.find((row) => row.status === "enrolled");
        if (!student) throw new Error("seed student");
        const before = await api.people.student({ id: student.id });
        const classesOf = async () =>
          (await api.classes.history({ studentId: student.id })).map(
            ({ version: _, ...row }) => row,
          );
        const classesBefore = await classesOf();
        const lastDay = addDays(before.today, -1);
        await api.people.recordLeaving({
          studentId: student.id,
          lastDay,
          accessUntil: addDays(lastDay, 30),
        });
        const gone = await api.people.student({ id: student.id });
        expect(gone.status).toBe("left");
        expect(gone.departure).toEqual({
          leftOn: addDays(lastDay, 1),
          accessEndsOn: addDays(lastDay, 31),
        });
        expect(
          (await api.people.students({ q: "", pageSize: 50 })).rows.some(
            (row) => row.id === student.id,
          ),
        ).toBe(false);
        expect(
          (
            await api.people.students({ q: "", status: ["left"], pageSize: 50 })
          ).rows.some((row) => row.id === student.id),
        ).toBe(true);
        await api.people.cancelLeaving({ studentId: student.id });
        const back = await api.people.student({ id: student.id });
        expect(back.status).toBe("enrolled");
        expect(back.departure).toBeNull();
        expect(back.roles).toEqual(before.roles);
        expect(await classesOf()).toEqual(classesBefore);
      });
    });
  });

describe("a class whose dates left its year while the module was off", () => {
  test("is the year's no longer once the module next acts on it", async () => {
    const api = await signedIn("acme", login("principal", 1));
    const year = await workingYear(api);
    const saved = await api.classes.save({
      startsOn: year.startsOn,
      endsOn: year.lastDay,
      parts: year.part,
      code: "DRIFT-1",
      titleEn: "Drifts",
      teacherIds: [],
    });
    await without("acme", ["school_years"], async () => {
      const record = await api.classes.record({ id: saved.id });
      await api.classes.save({
        id: saved.id,
        expectedVersion: record.version,
        startsOn: year.startsOn,
        code: "DRIFT-1",
        titleEn: "Drifts",
        teacherIds: [],
      });
    });
    expect((await api.years.ofClass({ classId: saved.id })).year?.id).toBe(
      year.id,
    );
    const student = (
      await api.people.students({ q: "", pageSize: 25 })
    ).rows.find((row) => row.status === "enrolled");
    if (!student) throw new Error("seed student");
    await api.classes.enrol({ studentId: student.id, classId: saved.id });
    expect((await api.years.ofClass({ classId: saved.id })).year).toBeNull();
    expect(
      (await api.classes.directory({ views: { year: year.id } })).rows.some(
        (row) => row.id === saved.id,
      ),
    ).toBe(false);
  });
});

describe("enrolments a homeroom keeps", () => {
  test("are not ended by hand while the homeroom keeps them", async () => {
    const api = await principal();
    const homeroom = (await api.homerooms.directory({})).rows.find(
      (row) => row.students > 0 && row.subjects.length > 0,
    );
    if (!homeroom) throw new Error("seed homeroom");
    const subject = await api.homerooms.ofClass({ classId: homeroom.id });
    if (subject.kind !== "homeroom") throw new Error("seed homeroom");
    const subjectClass = subject.subjects[0];
    if (!subjectClass) throw new Error("seed subject class");
    const record = await api.classes.record({ id: subjectClass.id });
    const student = record.roster[0];
    if (!student) throw new Error("seed student");
    expect(student.source).toBe("homeroom");
    expect(
      await rejection(
        api.classes.withdraw({
          studentId: student.userId,
          enrollmentId: student.enrollmentId,
          expectedVersion: student.version,
          on: addDays(record.on, 1),
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "enrollment.derived" });
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
