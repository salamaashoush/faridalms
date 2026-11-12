import { describe, expect, test } from "bun:test";

import {
  login,
  raw,
  rejection,
  sessionFor,
  signedIn,
  withoutModules,
} from "./harness";

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
    const home = await family.home.followed({});
    expect(home.choices.length).toBeGreaterThan(0);
    expect(home.children.map((row) => row.studentId)).toEqual(
      home.choices.map((row) => row.studentId),
    );
    for (const child of home.children)
      expect(child.attention.length).toBeLessThanOrEqual(3);
    const [first] = home.choices;
    if (!first) throw new Error("the seeded parent has no child");
    const one = await family.home.followed({ studentId: first.studentId });
    expect(one.children.map((row) => row.studentId)).toEqual([first.studentId]);
    expect(
      await rejection(family.home.followed({ studentId: crypto.randomUUID() })),
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

  test("the office sees the school's first steps, live from its data, until it has taken them all", async () => {
    const office = await signedIn("northwind", login("principal"));
    const onboarding = (await office.home.admin()).onboarding;
    if (!onboarding) throw new Error("the seeded school has steps left");
    const step = (id: string) => onboarding.steps.find((row) => row.id === id);
    const done = (item: string) =>
      onboarding.items.find((row) => row.item === item);
    // What its data shows counts at once, before any daily measure.
    expect(step("classes")).toEqual({
      id: "classes",
      done: true,
      optional: false,
    });
    expect(step("students")?.done).toBe(true);
    expect(done("staff_signed_in")?.done).toBe(true);
    // An operator's step waits for the operator.
    expect(done("kickoff_call")).toEqual({ item: "kickoff_call", done: false });
    expect(step("year")?.done).toBe(true);
    // A school without years has no year to set up, so the step is gone
    // rather than waiting for ever.
    await withoutModules("northwind", ["school_years"], async () => {
      const yearless = (await office.home.admin()).onboarding;
      expect(yearless?.steps.map((row) => row.id)).not.toContain("year");
    });
  });

  test("the office hides the school's setup once it is finished", async () => {
    // A logo and a way to reach the school are the last of its details.
    const office = await sessionFor("northwind", login("principal"));
    const png = new Blob([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
    ]);
    const file = await office.api.files.initiate({
      purpose: "document_media",
      name: "logo.png",
      mediaType: "image/png",
      sizeBytes: png.size,
    });
    await raw("northwind", office.token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body: png,
    });
    const profile = await office.api.school.profile();
    await office.api.school.saveProfile({
      expectedVersion: profile.version,
      nameEn: profile.nameEn ?? "",
      nameAr: profile.nameAr ?? "",
      identifier: profile.identifier ?? "",
      timeZone: profile.timeZone ?? "Africa/Cairo",
      defaultLocale: profile.defaultLocale,
      weekStart: profile.weekStart,
      weekendDays: profile.weekendDays,
      secondaryCalendar: profile.secondaryCalendar ?? "",
      phone: profile.phone ?? "0225550100",
      email: profile.email ?? "",
      logoFileId: file.id,
    });
    const onboarding = (await office.api.home.admin()).onboarding;
    expect(onboarding?.steps.find((row) => row.id === "details")?.done).toBe(
      true,
    );
    expect(onboarding?.finished).toBe(true);
    expect(await office.api.home.hideOnboarding()).toEqual({ hidden: true });
    expect((await office.api.home.admin()).onboarding).toBeNull();
  });

  test("a guardian reads what the school holds about their child and asks the office to correct it", async () => {
    const family = await signedIn("northwind", login("parent"));
    const [first] = (await family.home.followed({})).choices;
    if (!first) throw new Error("the seeded parent has no child");
    const held = await family.home.details({ studentId: first.studentId });
    expect(held).toMatchObject({ studentId: first.studentId, decides: true });
    expect(held.fullNameEn).toBeTruthy();
    expect(held.reference).toMatch(/^NO/);
    expect(held.place?.labelEn).toBeTruthy();
    expect(
      await rejection(family.home.details({ studentId: crypto.randomUUID() })),
    ).toMatchObject({ code: "NOT_FOUND" });

    const asked = await family.privacy.askCorrection({
      studentId: first.studentId,
      details: "The date of birth should be 2 March 2014.",
    });
    expect(asked.dueOn >= (await family.home.followed({})).today).toBe(true);
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
