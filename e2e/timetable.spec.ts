import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3001/v1";

async function signIn(request: APIRequestContext, email: string) {
  const response = await request.post(`${origin}/auth/signIn`, {
    data: { school: "northwind", email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
}

async function login(page: Page) {
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
}

async function createTeacher(
  request: APIRequestContext,
  admin: Record<string, string>,
  name: string,
) {
  const response = await request.post(`${origin}/saveUser`, {
    headers: admin,
    data: {
      name,
      email: `${name.toLowerCase().replaceAll(" ", "-")}@example.com`,
      role: "teacher",
      title: "",
      mobile: "",
      password: "timetable-passphrase-2026",
      isActive: true,
    },
  });
  expect(response.status()).toBe(200);
  const row = (await response.json()) as { id: string };
  return { id: row.id, name };
}

/** Fresh teachers, so the seeded week cannot collide with the one under test. */
async function fixtures(
  request: APIRequestContext,
  admin: Record<string, string>,
  suffix: string,
) {
  const subjects = (await (
    await request.post(`${origin}/getSubjects`, { headers: admin })
  ).json()) as { id: string; name: string }[];
  const [first, second, third] = subjects;
  if (!first || !second || !third) throw new Error("Seed is missing subjects");
  const teacherA = await createTeacher(request, admin, `Salama A ${suffix}`);
  const teacherB = await createTeacher(request, admin, `Salama B ${suffix}`);
  return { first, second, third, teacherA, teacherB };
}

async function createClass(
  request: APIRequestContext,
  admin: Record<string, string>,
  name: string,
  subjects: { subjectId: string; teacherId: string }[],
) {
  const response = await request.post(`${origin}/saveClass`, {
    headers: admin,
    data: {
      name,
      grade: "3",
      stage: "primary",
      room: "",
      homeroomTeacherId: "",
      subjects,
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { id: string };
}

test("a class week is replaced under overlap, offering and teacher checks and terms stay inside their year", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = await signIn(request, "admin@example.com");
  const teacher = await signIn(request, "sara@example.com");
  const { first, second, third, teacherA, teacherB } = await fixtures(
    request,
    admin,
    suffix,
  );
  const classA = await createClass(request, admin, `TT-A ${suffix}`, [
    { subjectId: first.id, teacherId: teacherA.id },
    { subjectId: second.id, teacherId: teacherB.id },
  ]);
  const classB = await createClass(request, admin, `TT-B ${suffix}`, [
    { subjectId: first.id, teacherId: teacherA.id },
  ]);

  expect(
    (
      await request.post(`${origin}/getClassTimetable`, {
        headers: teacher,
        data: { classId: classA.id },
      })
    ).status(),
  ).toBe(403);
  const empty = await request.post(`${origin}/getClassTimetable`, {
    headers: admin,
    data: { classId: classA.id },
  });
  expect(empty.status()).toBe(200);
  const detail = (await empty.json()) as {
    revision: number;
    classSubjects: unknown[];
    timetableSlots: unknown[];
  };
  expect(detail.revision).toBe(1);
  expect(detail.classSubjects).toHaveLength(2);
  expect(detail.timetableSlots).toHaveLength(0);

  const week = [
    {
      weekday: 0,
      startTime: "08:00",
      endTime: "08:45",
      subjectId: first.id,
      teacherId: "",
      room: "R1",
    },
    {
      weekday: 0,
      startTime: "08:45",
      endTime: "09:30",
      subjectId: second.id,
      teacherId: "",
      room: "",
    },
  ];
  const saved = await request.post(`${origin}/saveTimetable`, {
    headers: admin,
    data: { classId: classA.id, expectedRevision: 1, slots: week },
  });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ classId: classA.id, revision: 2 });

  const overlap = await request.post(`${origin}/saveTimetable`, {
    headers: admin,
    data: {
      classId: classA.id,
      expectedRevision: 2,
      slots: [week[0], { ...week[1], startTime: "08:30", endTime: "09:15" }],
    },
  });
  expect(overlap.status()).toBe(400);
  const stale = await request.post(`${origin}/saveTimetable`, {
    headers: admin,
    data: { classId: classA.id, expectedRevision: 1, slots: week },
  });
  expect(stale.status()).toBe(409);
  const notOffered = await request.post(`${origin}/saveTimetable`, {
    headers: admin,
    data: {
      classId: classA.id,
      expectedRevision: 2,
      slots: [{ ...week[0], subjectId: third.id }],
    },
  });
  expect(notOffered.status()).toBe(400);

  const busy = await request.post(`${origin}/saveTimetable`, {
    headers: admin,
    data: { classId: classB.id, expectedRevision: 1, slots: [week[0]] },
  });
  expect(busy.status()).toBe(409);
  const later = await request.post(`${origin}/saveTimetable`, {
    headers: admin,
    data: {
      classId: classB.id,
      expectedRevision: 1,
      slots: [{ ...week[0], startTime: "09:30", endTime: "10:15" }],
    },
  });
  expect(later.status()).toBe(200);

  const record = await request.post(`${origin}/getClass`, {
    headers: admin,
    data: { id: classA.id },
  });
  expect(record.status()).toBe(200);
  const classRecord = (await record.json()) as {
    timetable: { teacher: { name: string } | null; room: string | null }[];
  };
  expect(classRecord.timetable).toHaveLength(2);
  expect(classRecord.timetable[0]?.teacher?.name).toBe(teacherA.name);
  expect(classRecord.timetable[0]?.room).toBe("R1");

  const year = await request.post(`${origin}/saveAcademicYear`, {
    headers: admin,
    data: {
      name: `T${suffix.slice(0, 6)}`,
      startsOn: "2040-09-01",
      endsOn: "2041-06-30",
      terms: [
        { name: "Term 1", startsOn: "2040-09-01", endsOn: "2041-01-20" },
        { name: "Term 2", startsOn: "2041-02-01", endsOn: "2041-06-30" },
      ],
    },
  });
  expect(year.status()).toBe(200);
  const yearRow = (await year.json()) as { id: string; revision: number };
  const stored = (await (
    await request.post(`${origin}/getAcademicYear`, {
      headers: admin,
      data: { id: yearRow.id },
    })
  ).json()) as { terms: { id: string; name: string }[] };
  expect(stored.terms.map((term) => term.name)).toEqual(["Term 1", "Term 2"]);
  const [termOne] = stored.terms;
  if (!termOne) throw new Error("Missing term");
  const edit = (terms: unknown[], expectedRevision = yearRow.revision) =>
    request.post(`${origin}/saveAcademicYear`, {
      headers: admin,
      data: {
        id: yearRow.id,
        expectedRevision,
        name: `T${suffix.slice(0, 6)}`,
        startsOn: "2040-09-01",
        endsOn: "2041-06-30",
        terms,
      },
    });
  expect(
    (
      await edit([
        {
          id: termOne.id,
          name: "Term 1",
          startsOn: "2040-09-01",
          endsOn: "2041-02-10",
        },
        { name: "Term 2", startsOn: "2041-02-01", endsOn: "2041-06-30" },
      ])
    ).status(),
  ).toBe(400);
  expect(
    (
      await edit([
        {
          id: termOne.id,
          name: "Term 1",
          startsOn: "2040-09-01",
          endsOn: "2041-07-05",
        },
      ])
    ).status(),
  ).toBe(400);
  expect(
    (
      await edit([
        {
          id: termOne.id,
          name: "Term 1",
          startsOn: "2040-09-01",
          endsOn: "2041-01-20",
        },
        { name: "term 1", startsOn: "2041-02-01", endsOn: "2041-06-30" },
      ])
    ).status(),
  ).toBe(400);
  const trimmed = await edit([
    {
      id: termOne.id,
      name: "Autumn",
      startsOn: "2040-09-01",
      endsOn: "2041-01-20",
    },
  ]);
  expect(trimmed.status()).toBe(200);
  const after = (await (
    await request.post(`${origin}/getAcademicYear`, {
      headers: admin,
      data: { id: yearRow.id },
    })
  ).json()) as { revision: number; terms: { id: string; name: string }[] };
  expect(after.revision).toBe(yearRow.revision + 1);
  expect(after.terms).toEqual([
    expect.objectContaining({ id: termOne.id, name: "Autumn" }),
  ]);
  expect((await edit([], yearRow.revision)).status()).toBe(409);
});

test("administrators plan a class week from its record and define terms on the year page", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = await signIn(request, "admin@example.com");
  const { first, teacherA } = await fixtures(request, admin, suffix);
  const created = await createClass(request, admin, `TT-UI ${suffix}`, [
    { subjectId: first.id, teacherId: teacherA.id },
  ]);

  await login(page);
  await page.goto(`/classes/${created.id}?tab=timetable`);
  await expect(
    page.getByRole("heading", { level: 1, name: `TT-UI ${suffix}` }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Edit timetable", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Edit timetable" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add Sunday lesson", exact: true })
    .click();
  await page.locator("#slot-0-room").fill(`Lab ${suffix}`);
  await page.locator("#slot-0-endTime").fill("07:30");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("A lesson must end after it starts."),
  ).toBeVisible();
  await page.locator("#slot-0-endTime").fill("08:45");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/classes\/.*tab=timetable/);
  await expect(
    page.getByRole("cell", { name: new RegExp(`Lab ${suffix}`) }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: new RegExp(teacherA.name) }),
  ).toBeVisible();

  await page.goto("/admin/academic-years");
  await page.getByRole("link", { name: "Create school year" }).click();
  const name = `U-${suffix.slice(0, 6)}`;
  await page.getByLabel("School year name", { exact: true }).fill(name);
  await page.locator("#academic-year-startsOn").fill("2042-09-01");
  await page.locator("#academic-year-endsOn").fill("2043-06-30");
  await page.getByRole("button", { name: "Add term", exact: true }).click();
  await page.locator("#term-0-name").fill("Autumn");
  await page.locator("#term-0-startsOn").fill("2042-08-20");
  await page.locator("#term-0-endsOn").fill("2043-01-20");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Every term must fall inside the year's dates."),
  ).toBeVisible();
  await page.locator("#term-0-startsOn").fill("2042-09-01");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/academic-years$/);
  await page.getByRole("link", { name: `Edit ${name}`, exact: true }).click();
  await expect(page.locator("#term-0-name")).toHaveValue("Autumn");
  await expect(page.locator("#term-0-endsOn")).toHaveValue("2043-01-20");
});
