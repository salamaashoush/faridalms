import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

describe("home pages", () => {
  test("a teacher's day lists their classes and the lessons the timetable gives them", async () => {
    const teacher = await signedIn("northwind", "teacher2.northwind@northwind.example.com");
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
});
