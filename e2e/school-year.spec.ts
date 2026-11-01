import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { apiAs, signedInApi } from "./fixtures/api";
import {
  newClass,
  newStudent,
  newYear,
  refusal,
  schoolDaysTo,
} from "./fixtures/school";
import { signIn, untilHydrated } from "./fixtures/sign-in";

// Browser projects share one school and years may not overlap, so each
// browser keeps years of its own.
const EARLIER = {
  chromium: {
    title: "2019–2020 Salama",
    startsOn: "2019-09-08",
    endsOn: "2020-06-11",
  },
  firefox: {
    title: "2018–2019 Salama",
    startsOn: "2018-09-09",
    endsOn: "2019-06-12",
  },
  webkit: {
    title: "2017–2018 Salama",
    startsOn: "2017-09-10",
    endsOn: "2018-06-13",
  },
} as const;
const REVISED = {
  chromium: { startsOn: "2083-09-05", endsOn: "2084-06-15" },
  firefox: { startsOn: "2085-09-02", endsOn: "2086-06-14" },
  webkit: { startsOn: "2087-09-07", endsOn: "2088-06-16" },
} as const;
const EDITED = {
  chromium: { startsOn: "2089-09-04", endsOn: "2090-06-14" },
  firefox: { startsOn: "2091-09-02", endsOn: "2092-06-12" },
  webkit: { startsOn: "2093-09-06", endsOn: "2094-06-17" },
} as const;

test("class moves keep other school years and return to a class as a new episode", async ({
  browserName,
}) => {
  const admin = await apiAs("admin");
  const unique = crypto.randomUUID().slice(0, 6);
  const earlier = await newYear(admin, EARLIER[browserName]);
  const before = await newClass(admin, {
    yearId: earlier.id,
    title: `Salama earlier ${unique}`,
  });
  const { workingYearId } = await admin.classes.options();
  if (!workingYearId) throw new Error("the school has no working year");
  const [first, second] = await Promise.all([
    newClass(admin, { yearId: workingYearId, title: `Salama A ${unique}` }),
    newClass(admin, { yearId: workingYearId, title: `Salama B ${unique}` }),
  ]);
  const [student, scheduled] = await Promise.all([
    newStudent(admin, `Ashoush ${unique}`),
    newStudent(admin, `Ashoush later ${unique}`),
  ]);

  await admin.classes.enrol({
    studentId: student.id,
    classId: before.id,
    from: EARLIER[browserName].startsOn,
  });
  const { today } = await admin.identity.currentUser();
  const days = await schoolDaysTo(admin, workingYearId, today);
  const day = days.at(-1);
  const left = days.at(-4);
  const joined = days.at(-9);
  if (!day || !left || !joined) throw new Error("too few school days so far");

  await admin.classes.enrol({
    studentId: student.id,
    classId: first.id,
    from: joined,
  });
  const register = await admin.attendance.register({
    classId: first.id,
    date: joined,
  });
  expect(register.students.map((row) => row.id)).toContain(student.id);
  const mark = (classId: string, date: string, periodId: string) =>
    admin.attendance.save({
      classId,
      date,
      periodId,
      expectedVersion: 0,
      marks: [{ studentId: student.id, meaning: "present" }],
    });
  await mark(first.id, joined, register.period.id);

  const placed = (
    await admin.classes.record({ id: first.id, on: joined })
  ).roster.find((row) => row.userId === student.id);
  if (!placed) throw new Error("the student is not in the class");
  await admin.classes.withdraw({
    studentId: student.id,
    enrollmentId: placed.enrollmentId,
    expectedVersion: placed.version,
    on: left,
  });
  expect(await refusal(mark(first.id, left, register.period.id))).toMatchObject(
    { code: "CONFLICT", message: "attendance.not_roster" },
  );
  // The register taken while they were in the class still reads with them.
  const past = await admin.attendance.register({
    classId: first.id,
    date: joined,
  });
  expect(past.students.map((row) => row.id)).toContain(student.id);
  expect(past.marks).toContainEqual(
    expect.objectContaining({ studentId: student.id, meaning: "present" }),
  );
  expect(
    await refusal(mark(first.id, "1900-01-01", register.period.id)),
  ).toMatchObject({ code: "BAD_REQUEST", message: "attendance.outside_year" });

  await admin.classes.enrol({
    studentId: student.id,
    classId: first.id,
    from: day,
  });
  await mark(first.id, day, register.period.id);
  // A day already counted in one class cannot be counted again in another.
  expect(
    await refusal(
      admin.classes.enrol({
        studentId: student.id,
        classId: second.id,
        from: day,
      }),
    ),
  ).toMatchObject({ code: "CONFLICT" });
  expect(
    await admin.classes.enrol({
      studentId: student.id,
      classId: first.id,
      from: day,
    }),
  ).toMatchObject({ moved: false });

  const history = await admin.classes.history({ studentId: student.id });
  expect(history.find((row) => row.classId === before.id)).toMatchObject({
    from: EARLIER[browserName].startsOn,
    to: addDays(EARLIER[browserName].endsOn, 1),
  });
  const returns = history.filter((row) => row.classId === first.id);
  expect(returns).toHaveLength(2);
  expect(returns.find((row) => row.from === joined)?.to).toBe(left);
  expect(
    returns.filter((row) => row.from <= today && today < row.to),
  ).toHaveLength(1);
  expect(history.some((row) => row.classId === second.id)).toBe(false);
  const listed = (await admin.people.students({ q: student.reference }))
    .rows[0];
  expect(listed?.homeroom?.classId).toBe(first.id);

  const teacher = await apiAs("teacher");
  expect(
    await refusal(teacher.people.student({ id: student.id })),
  ).toMatchObject({ code: "NOT_FOUND" });

  await admin.classes.enrol({
    studentId: scheduled.id,
    classId: first.id,
    from: addDays(today, 3),
  });
  expect(
    await refusal(
      admin.classes.enrol({ studentId: scheduled.id, classId: second.id }),
    ),
  ).toMatchObject({
    code: "CONFLICT",
    message: "enrollment.future_placement",
  });
  const waiting = await admin.classes.history({ studentId: scheduled.id });
  expect(waiting.map((row) => [row.classId, row.from])).toEqual([
    [first.id, addDays(today, 3)],
  ]);
});

test("a backdated move cannot reach over a register already taken, and each day keeps its roster", async () => {
  const admin = await apiAs("admin");
  const unique = crypto.randomUUID().slice(0, 6);
  const { workingYearId } = await admin.classes.options();
  if (!workingYearId) throw new Error("the school has no working year");
  const [registered, moved] = await Promise.all([
    newClass(admin, {
      yearId: workingYearId,
      title: `Salama registered ${unique}`,
    }),
    newClass(admin, { yearId: workingYearId, title: `Salama moved ${unique}` }),
  ]);
  const student = await newStudent(admin, `Ashoush register ${unique}`);
  const { today } = await admin.identity.currentUser();
  const days = await schoolDaysTo(admin, workingYearId, today);
  const [placedOn, takenOn, movedOn] = days.slice(-3);
  if (!placedOn || !takenOn || !movedOn)
    throw new Error("too few school days so far");
  await admin.classes.enrol({
    studentId: student.id,
    classId: registered.id,
    from: placedOn,
  });
  const taken = await admin.attendance.register({
    classId: registered.id,
    date: takenOn,
  });
  await admin.attendance.save({
    classId: registered.id,
    date: takenOn,
    periodId: taken.period.id,
    expectedVersion: 0,
    marks: [{ studentId: student.id, meaning: "present" }],
  });
  const roster = async (classId: string, date: string) =>
    (await admin.attendance.register({ classId, date })).students.map(
      (row) => row.id,
    );

  const refused = {
    code: "CONFLICT",
    message: `enrollment.registers_after:${takenOn}`,
  };
  expect(
    await Promise.all(
      [placedOn, takenOn].map((from) =>
        refusal(
          admin.classes.enrol({
            studentId: student.id,
            classId: moved.id,
            from,
          }),
        ),
      ),
    ),
  ).toMatchObject([refused, refused]);
  const unchanged = await admin.attendance.register({
    classId: registered.id,
    date: takenOn,
  });
  expect(unchanged.students.map((row) => row.id)).toContain(student.id);
  expect(unchanged.marks).toContainEqual(
    expect.objectContaining({ studentId: student.id, meaning: "present" }),
  );

  expect(
    await admin.classes.enrol({
      studentId: student.id,
      classId: moved.id,
      from: movedOn,
    }),
  ).toMatchObject({ moved: true });
  expect(await roster(registered.id, takenOn)).toContain(student.id);
  expect(await roster(moved.id, takenOn)).not.toContain(student.id);
  expect(await roster(moved.id, movedOn)).toContain(student.id);
  expect(await roster(registered.id, movedOn)).not.toContain(student.id);
});

test("school year edits refuse stale versions and stay inside the school", async ({
  browserName,
}) => {
  const [admin, parent] = await Promise.all([apiAs("admin"), apiAs("parent")]);
  const { api: acme } = await signedInApi(
    "principal.acme@acme.example.com",
    undefined,
    "acme",
  );
  const input = {
    titleEn: `Y-${crypto.randomUUID().slice(0, 8)}`,
    titleAr: "",
    terms: [],
    ...REVISED[browserName],
  };
  expect(await refusal(parent.years.save(input))).toMatchObject({
    code: "FORBIDDEN",
  });
  expect(
    await refusal(
      admin.years.save({ ...input, endsOn: addDays(input.startsOn, -30) }),
    ),
  ).toMatchObject({ code: "BAD_REQUEST" });

  const { id } = await admin.years.save(input);
  const year = await admin.years.record({ id });
  expect(year).toMatchObject({ lifecycle: "upcoming", standing: "upcoming" });
  expect(await refusal(admin.years.save(input))).toMatchObject({
    code: "CONFLICT",
    message: "school_year.overlapping",
  });

  const updates = await Promise.allSettled(
    [1, 2].map((offset) =>
      admin.years.save({
        ...input,
        id,
        expectedVersion: year.version,
        endsOn: addDays(input.endsOn, offset),
      }),
    ),
  );
  expect(updates.map((result) => result.status).toSorted()).toEqual([
    "fulfilled",
    "rejected",
  ]);
  const stale = updates.find((result) => result.status === "rejected");
  expect(stale?.status === "rejected" ? stale.reason : null).toMatchObject({
    code: "CONFLICT",
    message: "conflict.version",
  });
  const won = updates.find((result) => result.status === "fulfilled");
  if (won?.status !== "fulfilled") throw new Error("no save went through");
  const stored = await admin.years.record({ id });
  expect(stored).toMatchObject({
    version: won.value.version,
    lifecycle: "upcoming",
    endsBefore: addDays(input.endsOn, 1 + (updates[0] === won ? 1 : 2)),
  });
  expect(stored.version).toBeGreaterThan(year.version);

  expect(await refusal(acme.years.record({ id }))).toMatchObject({
    code: "NOT_FOUND",
  });
  expect(
    await refusal(
      acme.years.save({ ...input, id, expectedVersion: stored.version }),
    ),
  ).toMatchObject({ code: "NOT_FOUND" });
});

test("administrators add a school year through a checked page and reopen it", async ({
  page,
  browserName,
}) => {
  const dates = EDITED[browserName];
  const name = `Y-${crypto.randomUUID().slice(0, 8)}`;
  await signIn(page, "admin");
  await page.goto("/admin/academic-years");
  await untilHydrated(page);
  await page
    .getByRole("link", { name: "Add school year", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/academic-year-editor/);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Year name in Arabic" }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByLabel("First day", { exact: true }).first(),
  ).toHaveAttribute("aria-invalid", "true");

  await page.getByRole("textbox", { name: "Year name in English" }).fill(name);
  await page
    .getByLabel("First day", { exact: true })
    .first()
    .fill(dates.startsOn);
  await page.getByLabel("Last day", { exact: true }).first().fill(dates.endsOn);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/years\/[a-f0-9-]+/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await page.reload();
  await untilHydrated(page);
  await page.getByRole("button", { name: "Edit year" }).click();
  await expect(page).toHaveURL(/\/admin\/academic-year-editor\?id=/);
  await expect(
    page.getByRole("textbox", { name: "Year name in English" }),
  ).toHaveValue(name);
  await expect(
    page.getByLabel("First day", { exact: true }).first(),
  ).toHaveValue(dates.startsOn);
  await expect(
    page.getByLabel("Last day", { exact: true }).first(),
  ).toHaveValue(dates.endsOn);
});
