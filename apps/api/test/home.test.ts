import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

describe("home pages", () => {
  test("a teacher's day lists their classes and the lessons the timetable gives them", async () => {
    const teacher = await signedIn(
      "northwind",
      "teacher2.northwind@northwind.example.com",
    );
    const home = await teacher.home.teacher();
    expect(home.classes.length).toBeGreaterThan(0);
    for (const slot of home.slots) {
      expect(home.classes.map((row) => row.id)).toContain(slot.classId);
      expect(["now", "next", null]).toContain(slot.when);
    }
    expect(
      home.slots.filter((slot) => slot.when === "now").length,
    ).toBeLessThanOrEqual(1);
    expect(await rejection(teacher.home.admin())).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("a family sees each of their children, and only their own", async () => {
    const family = await signedIn("northwind", login("parent"));
    const home = await family.home.family({});
    expect(home.choices.length).toBeGreaterThan(0);
    expect(home.children.map((row) => row.studentId)).toEqual(
      home.choices.map((row) => row.studentId),
    );
    for (const child of home.children)
      expect(child.attention.length).toBeLessThanOrEqual(3);
    const [first] = home.choices;
    if (!first) throw new Error("the seeded parent has no child");
    const one = await family.home.family({ studentId: first.studentId });
    expect(one.children.map((row) => row.studentId)).toEqual([first.studentId]);
    expect(
      await rejection(family.home.family({ studentId: crypto.randomUUID() })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a student sees what is due soon and the module to continue", async () => {
    const student = await signedIn("northwind", login("student"));
    const home = await student.home.student();
    expect(home.due.length).toBeLessThanOrEqual(5);
    const going = home.module;
    if (!going) throw new Error("the student has no module to continue");
    expect(going.completed).toBeLessThan(going.lessons);
    expect(await rejection(student.home.teacher())).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("the office sees what needs action and how attendance is going", async () => {
    const office = await signedIn("northwind", login("principal"));
    const home = await office.home.admin();
    expect(home.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(home.registers).not.toBeNull();
    expect(home.attendance).not.toBeNull();
    expect(home.communications.length).toBeGreaterThan(0);
  });

  test("a guardian reads what the school holds about their child and asks the office to correct it", async () => {
    const family = await signedIn("northwind", login("parent"));
    const [first] = (await family.home.family({})).choices;
    if (!first) throw new Error("the seeded parent has no child");
    const held = await family.home.child({ studentId: first.studentId });
    expect(held).toMatchObject({ studentId: first.studentId, decides: true });
    expect(held.fullNameEn).toBeTruthy();
    expect(held.reference).toMatch(/^NO/);
    expect(held.grade?.labelEn).toBeTruthy();
    expect(
      await rejection(family.home.child({ studentId: crypto.randomUUID() })),
    ).toMatchObject({ code: "NOT_FOUND" });

    const asked = await family.privacy.askCorrection({
      studentId: first.studentId,
      details: "The date of birth should be 2 March 2014.",
    });
    expect(asked.dueOn >= (await family.home.family({})).today).toBe(true);
    // It is in the office's register, on the clock the school's law sets.
    const office = await signedIn("northwind", login("principal"));
    const logged = (await office.privacy.overview()).requests.find(
      (row) => row.id === asked.id,
    );
    expect(logged).toMatchObject({
      subjectUserId: first.studentId,
      kind: "correction",
      relation: "parent",
      law: "egypt",
      dueOn: asked.dueOn,
      details: "The date of birth should be 2 March 2014.",
    });

    expect(
      await rejection(
        family.privacy.askCorrection({
          studentId: crypto.randomUUID(),
          details: "Somebody else's child.",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    for (const details of ["Second.", "Third."])
      await family.privacy.askCorrection({
        studentId: first.studentId,
        details,
      });
    expect(
      await rejection(
        family.privacy.askCorrection({
          studentId: first.studentId,
          details: "A fourth while three are open.",
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "privacy.requests_open" });
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.privacy.askCorrection({
          studentId: first.studentId,
          details: "Not a guardian.",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
