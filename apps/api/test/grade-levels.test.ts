import { plainContent } from "@faridalms/domain/content-conversion";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";

import { names } from "./admission-fixtures";
import { login, rejection, seeded, setPlan, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const pupil = () => signedIn("northwind", login("student"));
// Students and places made here are Acme's, so Northwind's counts stay the seed's.
const office = () => signedIn("acme", login("principal", 1));

const suffix = () => crypto.randomUUID().slice(0, 6).toUpperCase();

function northwind() {
  const school = seeded().tenants[0]?.schools.find(
    (row) => row.slug === "northwind",
  );
  if (!school) throw new Error("the seed lacks Northwind");
  return school.id;
}

/** Runs a test with these modules off at Northwind, and puts its plan back after. */
async function without(
  off: readonly string[],
  run: () => Promise<void>,
): Promise<void> {
  const schoolId = northwind();
  await setPlan(schoolId, {
    modules: MODULE_IDS.filter((id) => !off.includes(id)),
  });
  try {
    await run();
  } finally {
    await setPlan(schoolId, null);
  }
}

type Api = Awaited<ReturnType<typeof office>>;

async function gradeNamed(api: Api, labelEn: string) {
  const grade = (await api.gradeLevels.options()).grades.find(
    (row) => row.labelEn === labelEn,
  );
  if (!grade) throw new Error(`no ${labelEn}`);
  return grade.id;
}

/** A student of the school's own, in no class, with a grade from today. */
async function newStudent(api: Api, gradeId: string) {
  const reference = `GL-${suffix()}`;
  const { id } = await api.people.saveStudent({
    names: names("Salama Ashoush", "سلامة عشوش"),
    reference,
    parts: { grade: { gradeId } },
  });
  return { id, reference };
}

const gradesOf = async (api: Api, studentId: string) =>
  (await api.gradeLevels.student({ studentId })).rows.map((row) => [
    row.grade?.id,
    row.from,
    row.until,
  ]);

describe("grades and levels", () => {
  test("a class's grade is saved with it, shown in its column, and narrows and orders the list", async () => {
    const api = await office();
    const [one, two] = await Promise.all([
      gradeNamed(api, "Grade 5"),
      gradeNamed(api, "Grade 6"),
    ]);
    const { today } = await api.classes.options();
    const years = await api.years.options();
    const year = years.years.find((row) => row.id === years.workingYearId);
    if (!year) throw new Error("the seed has no working year");
    const code = `GL-${suffix()}`;
    const saved = await api.classes.save({
      code,
      titleEn: `Salama level class ${code}`,
      startsOn: today,
      endsOn: addDays(year.endsBefore, -1),
      teacherIds: [],
      parts: { grade: { gradeId: two }, year: { yearId: year.id } },
    });
    const record = await api.classes.record({ id: saved.id });
    expect(record.columns.grade).toBe(two);
    const ofTwo = await api.classes.directory({ views: { grade: [two] } });
    expect(ofTwo.rows.map((row) => row.id)).toContain(saved.id);
    expect(
      ofTwo.rows.every((row) => ofTwo.columns.grade?.[row.id] === two),
    ).toBe(true);
    const ofOne = await api.classes.directory({ views: { grade: one } });
    expect(ofOne.rows.map((row) => row.id)).not.toContain(saved.id);
    const all = await api.classes.directory({});
    const order = (await api.gradeLevels.options()).grades.map((row) => row.id);
    const ranks = all.rows.map((row) => {
      const at = order.indexOf(all.columns.grade?.[row.id] ?? "");
      return at < 0 ? order.length : at;
    });
    expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
  });

  test("the student list shows, filters and sorts by grade, and lists a new student in no class", async () => {
    const api = await office();
    const three = await gradeNamed(api, "Grade 5");
    const created = await newStudent(api, three);
    const found = await api.people.students({ q: created.reference });
    expect(found.rows.map((row) => [row.id, row.columns.grade])).toEqual([
      [created.id, three],
    ]);
    const ofThree = await api.people.students({
      views: { grade: [three] },
      pageSize: 50,
    });
    expect(ofThree.rows.every((row) => row.columns.grade === three)).toBe(true);
    expect(ofThree.rows.map((row) => row.id)).toContain(created.id);
    const sorted = await api.people.students({ sort: "grade", pageSize: 50 });
    const order = (await api.gradeLevels.options()).grades.map((row) => row.id);
    const ranks = sorted.rows.map((row) => {
      const at = order.indexOf(row.columns.grade ?? "");
      return at < 0 ? order.length : at;
    });
    expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
  });

  test("joining a class of another grade leaves a student's grade, and a homeroom moves it, keeping a change set for later", async () => {
    const api = await office();
    const homerooms = await api.homerooms.directory({});
    const gradeOf = homerooms.columns.grade ?? {};
    const first = homerooms.rows.find((row) => gradeOf[row.id]);
    const other = homerooms.rows.find(
      (row) => gradeOf[row.id] && gradeOf[row.id] !== gradeOf[first?.id ?? ""],
    );
    const firstGrade = gradeOf[first?.id ?? ""];
    const otherGrade = gradeOf[other?.id ?? ""];
    if (!other || !firstGrade || !otherGrade)
      throw new Error("two homerooms of two grades");
    const { today } = await api.classes.options();
    const created = await newStudent(api, firstGrade);
    const later = addDays(today, 60);
    const nine = (await api.gradeLevels.options()).grades.find(
      (row) => row.id !== firstGrade && row.id !== otherGrade,
    )?.id;
    if (!nine) throw new Error("a third grade");
    await api.gradeLevels.setStudentGrade({
      studentId: created.id,
      gradeId: nine,
      from: later,
    });

    const code = `GL-${suffix()}`;
    const elective = await api.classes.save({
      code,
      titleEn: `Salama elective ${code}`,
      startsOn: today,
      teacherIds: [],
      parts: { grade: { gradeId: otherGrade } },
    });
    await api.classes.enrol({ studentId: created.id, classId: elective.id });
    expect(await gradesOf(api, created.id)).toEqual([
      [firstGrade, today, later],
      [nine, later, null],
    ]);

    const { id: ungraded } = await api.people.saveStudent({
      names: names("Salama Ashoush", "سلامة عشوش"),
      reference: `GL-${suffix()}`,
    });
    expect(await gradesOf(api, ungraded)).toEqual([]);
    await api.classes.enrol({ studentId: ungraded, classId: elective.id });
    expect(await gradesOf(api, ungraded)).toEqual([[otherGrade, today, null]]);

    await api.homerooms.place({ studentId: created.id, classId: other.id });
    const after = await gradesOf(api, created.id);
    expect(after.at(-2)).toEqual([otherGrade, today, later]);
    expect(after.at(-1)).toEqual([nine, later, null]);
  });

  test("an event for a grade reaches its students and no one else's", async () => {
    const api = await principal();
    const student = await pupil();
    const me = await student.identity.currentUser();
    const held = await api.gradeLevels.student({ studentId: me.id });
    const mine = held.rows.find(
      (row) =>
        row.from <= held.today &&
        (row.until === null || held.today < row.until),
    )?.grade?.id;
    if (!mine) throw new Error("the seeded student has no grade");
    const other = (await api.calendar.options()).kinds
      .find((kind) => kind.scope === "grade")
      ?.options.find((option) => option.id !== mine);
    if (!other) throw new Error("another grade with classes");
    const day = addDays(held.today, 3);
    const save = (title: string, targetId: string) =>
      api.calendar.save({
        id: "",
        expectedVersion: 0,
        titleEn: title,
        titleAr: "",
        category: "meeting",
        startsOn: day,
        endsOn: day,
        allDay: true,
        startTime: "",
        endTime: "",
        location: "",
        provisional: false,
        audiences: [{ scope: "grade", classId: "", targetId }],
        description: plainContent(`${title}.`),
      });
    const theirs = await save(`Salama grade trip ${suffix()}`, mine);
    const elsewhere = await save(`Salama other trip ${suffix()}`, other.id);
    for (const saved of [theirs, elsewhere])
      await api.calendar.publish({
        id: saved.id,
        expectedVersion: saved.version,
        notify: false,
      });
    const event = await api.calendar.event({ id: theirs.id });
    expect(event.audiences).toMatchObject([{ scope: "grade", targetId: mine }]);
    expect(event.reached).toBeGreaterThan(0);
    const seen = (
      await student.calendar.range({ from: day, to: day, child: "" })
    ).events;
    expect(seen.map((row) => row.id)).toContain(theirs.id);
    expect(seen.map((row) => row.id)).not.toContain(elsewhere.id);
  });

  test("the school's grades are renamed, added, put in order, and retired only once nothing holds them", async () => {
    const api = await principal();
    const before = await api.gradeLevels.settings();
    const held = before.rows.find((row) => row.students > 0);
    if (!held) throw new Error("a grade a student holds");
    expect(
      await rejection(api.gradeLevels.retire({ id: held.id })),
    ).toMatchObject({ code: "CONFLICT", message: "grade_level.in_use" });

    const code = `salama-${suffix().toLowerCase()}`;
    const { id } = await api.gradeLevels.save({
      code,
      labelEn: "Salama level",
      labelAr: "مستوى سلامة",
    });
    const added = (await api.gradeLevels.settings()).rows;
    expect(added.at(-1)).toMatchObject({ id, retired: false, students: 0 });
    expect(
      await rejection(
        api.gradeLevels.save({ code, labelEn: "Again", labelAr: "" }),
      ),
    ).toMatchObject({ message: "grade_level.code_taken" });

    await api.gradeLevels.save({
      id,
      labelEn: "Salama advanced",
      labelAr: "مستوى سلامة",
      expected: { labelEn: "Salama level", labelAr: "مستوى سلامة" },
    });
    const ids = added.map((row) => row.id);
    await api.gradeLevels.order({
      ids: [id, ...ids.filter((row) => row !== id)],
    });
    expect((await api.gradeLevels.settings()).rows[0]).toMatchObject({
      id,
      labelEn: "Salama advanced",
    });
    await api.gradeLevels.order({ ids });

    await api.gradeLevels.retire({ id });
    expect(
      (await api.gradeLevels.settings()).rows.find((row) => row.id === id),
    ).toMatchObject({ retired: true });
    const created = await rejection(newStudent(api, id));
    expect(created).toMatchObject({ message: "grade_level.unknown" });
  });
});

describe("a school without grade levels", () => {
  test("offers no grade anywhere and refuses one, while classes, students and the calendar work", async () => {
    await without(["grade_levels"], async () => {
      const api = await principal();
      expect(await rejection(api.gradeLevels.options())).toMatchObject({
        code: "NOT_FOUND",
      });
      const { today } = await api.classes.options();
      const code = `NG-${suffix()}`;
      expect(
        await rejection(
          api.classes.save({
            code,
            titleEn: "Graded",
            startsOn: today,
            teacherIds: [],
            parts: { grade: { gradeId: crypto.randomUUID() } },
          }),
        ),
      ).toMatchObject({ message: "classes.part_unknown" });
      const saved = await api.classes.save({
        code,
        titleEn: `Salama class with no grade ${code}`,
        startsOn: today,
        teacherIds: [],
      });
      const record = await api.classes.record({ id: saved.id });
      expect(record.columns).toEqual({});
      expect(record.young).toBe(false);
      expect(
        await rejection(
          api.classes.directory({ views: { grade: crypto.randomUUID() } }),
        ),
      ).toMatchObject({ message: "classes.view_unknown" });
      const directory = await api.classes.directory({});
      expect(directory.columns).toEqual({});

      const students = await api.people.students({});
      expect(students.rows.length).toBeGreaterThan(0);
      expect(
        students.rows.every((row) => Object.keys(row.columns).length === 0),
      ).toBe(true);
      expect(
        await rejection(api.people.students({ sort: "grade" })),
      ).toMatchObject({ message: "people.sort_unknown" });

      expect((await api.calendar.options()).kinds).toEqual([]);
      expect(
        await rejection(
          api.calendar.save({
            id: "",
            expectedVersion: 0,
            titleEn: "Graded",
            titleAr: "",
            category: "meeting",
            startsOn: today,
            endsOn: today,
            allDay: true,
            startTime: "",
            endTime: "",
            location: "",
            provisional: false,
            audiences: [
              { scope: "grade", classId: "", targetId: crypto.randomUUID() },
            ],
            description: plainContent("Graded."),
          }),
        ),
      ).toMatchObject({ message: "announcements.audience_target" });

      expect(await rejection(api.reading.norms())).toMatchObject({
        code: "NOT_FOUND",
      });
      expect(
        await rejection(
          api.grading.saveProgramme({
            titleEn: "Levelled",
            titleAr: null,
            scaleId: null,
            parts: { levels: { gradeLevelIds: [] } },
          }),
        ),
      ).toMatchObject({ message: "grading.part_unknown" });
      expect(
        await rejection(api.badges.classBadges({ classId: saved.id })),
      ).toMatchObject({ code: "NOT_FOUND" });

      const family = await signedIn(
        "northwind",
        login("student").replace("student", "parent"),
      );
      const [first] = (await family.home.family({})).choices;
      if (!first) throw new Error("the seeded parent has no child");
      expect(
        (await family.home.child({ studentId: first.studentId })).place,
      ).toBeNull();
    });
  });
});
