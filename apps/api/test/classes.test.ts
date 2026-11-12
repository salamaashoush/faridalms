import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

async function principal() {
  return signedIn("northwind", login("principal"));
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
    const year = options.workingYearId ?? "";
    const [teacher] = options.teachers.filter((row) => row.teaches);
    if (!teacher) throw new Error("seed teacher");
    const saved = await api.classes.save({
      yearId: year,
      code: "CLUB-1",
      titleEn: "Chess club",
      titleAr: "نادي الشطرنج",
      teacherIds: [teacher.id],
    });
    const made = await api.classes.record({ id: saved.id });
    expect(made).toMatchObject({ subjectId: null, courseId: null });
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
    const options = await (await principal()).classes.options();
    expect(
      await rejection(
        teacher.classes.save({
          yearId: options.workingYearId ?? "",
          code: "NOPE",
          titleEn: "Nope",
          teacherIds: [],
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("a code already used this year is refused", async () => {
    const api = await principal();
    const options = await api.classes.options();
    expect(
      await rejection(
        api.classes.save({
          yearId: options.workingYearId ?? "",
          code: "7-A",
          titleEn: "Duplicate",
          teacherIds: [],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "class.code_taken" });
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
