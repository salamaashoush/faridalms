import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("class transfers preserve other school years and returning enrollment episodes", async ({
  request,
}) => {
  const fixture = JSON.parse(
    execFileSync("bun", ["e2e/fixtures/academic-year.ts", "--enrollment"], {
      encoding: "utf8",
    }),
  ) as {
    classId: string;
    today: string;
    enrollmentFixture: {
      scheduledStudentId: string;
      scheduledReference: string;
      studentId: string;
      reference: string;
      firstClassId: string;
      secondClassId: string;
      past: { id: string; since: string; until: string };
    };
  };
  const origin = "http://127.0.0.1:3001/v1";
  const login = await request.post(`${origin}/auth/signIn`, {
    data: {
      school: "northwind",
      email: "admin@example.com",
      password: "northwind1234",
    },
  });
  expect(login.status()).toBe(200);
  const { token } = (await login.json()) as { token: string };
  const headers = { authorization: `Bearer ${token}` };
  const { studentId, reference, firstClassId, secondClassId, past } =
    fixture.enrollmentFixture;
  const save = async (classId: string) => {
    const response = await request.post(`${origin}/saveStudent`, {
      headers,
      data: {
        id: studentId,
        reference,
        firstName: "Salama",
        lastName: "Ashoush",
        classId,
        guardianIds: [],
      },
    });
    expect(response.status()).toBe(200);
  };
  const mark = (classId: string, date: string) =>
    request.post(`${origin}/saveAttendance`, {
      headers,
      data: {
        classId,
        date,
        entries: [{ studentId, status: "present", note: "" }],
      },
    });
  const historicalRegister = await request.post(
    `${origin}/getAttendanceRegister`,
    { headers, data: { classId: firstClassId, date: past.since } },
  );
  expect(historicalRegister.status()).toBe(200);
  const historical = (await historicalRegister.json()) as {
    roster: { id: string }[];
  };
  expect(historical.roster.map((row) => row.id)).toContain(studentId);
  expect((await mark(firstClassId, past.since)).status()).toBe(200);
  expect((await mark(firstClassId, past.until)).status()).toBe(403);
  expect((await mark(firstClassId, "1900-01-01")).status()).toBe(400);
  await save(firstClassId);
  expect((await mark(firstClassId, fixture.today)).status()).toBe(200);
  await save(secondClassId);
  expect((await mark(secondClassId, fixture.today)).status()).toBe(409);
  await save(firstClassId);
  await save(firstClassId);
  const response = await request.post(`${origin}/getStudent`, {
    headers,
    data: { studentId },
  });
  expect(response.status()).toBe(200);
  const { profile } = (await response.json()) as {
    profile: {
      classId: string;
      enrollmentHistory: {
        id: string;
        classId: string;
        since: string;
        until: string | null;
      }[];
    };
  };
  const history = profile.enrollmentHistory;
  expect(profile.classId).toBe(firstClassId);
  expect(history).toHaveLength(5);
  expect(history.find((row) => row.id === past.id)).toMatchObject({
    since: past.since,
    until: past.until,
  });
  expect(
    history.find((row) => row.classId === fixture.classId)?.until,
  ).toBeNull();
  const returns = history.filter((row) => row.classId === firstClassId);
  expect(returns).toHaveLength(3);
  expect(returns.filter((row) => row.until === null)).toHaveLength(1);
  const editor = await request.post(`${origin}/getStudentForManagement`, {
    headers,
    data: { id: studentId },
  });
  expect(editor.status()).toBe(200);
  expect(await editor.json()).toMatchObject({ classId: firstClassId });
  const teacherLogin = await request.post(`${origin}/auth/signIn`, {
    data: {
      school: "northwind",
      email: "teacher@example.com",
      password: "northwind1234",
    },
  });
  expect(teacherLogin.status()).toBe(200);
  const teacher = (await teacherLogin.json()) as { token: string };
  const forbiddenProfile = await request.post(`${origin}/getStudent`, {
    headers: { authorization: `Bearer ${teacher.token}` },
    data: { studentId },
  });
  expect(forbiddenProfile.status()).toBe(403);
  const scheduledConflict = await request.post(`${origin}/saveStudent`, {
    headers,
    data: {
      id: fixture.enrollmentFixture.scheduledStudentId,
      reference: fixture.enrollmentFixture.scheduledReference,
      firstName: "Changed",
      lastName: "Ashoush",
      classId: secondClassId,
      guardianIds: [],
    },
  });
  expect(scheduledConflict.status()).toBe(409);
  const unchanged = await request.post(`${origin}/getStudent`, {
    headers,
    data: { studentId: fixture.enrollmentFixture.scheduledStudentId },
  });
  expect(unchanged.status()).toBe(200);
  expect(await unchanged.json()).toMatchObject({
    profile: { firstName: "Salama", classId: null },
  });
});

test("academic year edits reject stale revisions and stay isolated by school", async ({
  request,
}) => {
  const origin = "http://127.0.0.1:3001/v1";
  const signIn = async (school: string, email: string) => {
    const response = await request.post(`${origin}/auth/signIn`, {
      data: { school, email, password: "northwind1234" },
    });
    expect(response.status()).toBe(200);
    const { token } = (await response.json()) as { token: string };
    return { authorization: `Bearer ${token}` };
  };
  const [admin, parent, otherSchool] = await Promise.all([
    signIn("northwind", "admin@example.com"),
    signIn("northwind", "parent@example.com"),
    signIn("acme", "admin@example.com"),
  ]);
  const input = {
    name: `Y-${crypto.randomUUID().slice(0, 8)}`,
    startsOn: "2030-09-01",
    endsOn: "2031-06-30",
  };
  const forbidden = await request.post(`${origin}/saveAcademicYear`, {
    headers: parent,
    data: input,
  });
  expect(forbidden.status()).toBe(403);
  const invalid = await request.post(`${origin}/saveAcademicYear`, {
    headers: admin,
    data: { ...input, endsOn: "2030-08-01" },
  });
  expect(invalid.status()).toBe(400);
  const created = await request.post(`${origin}/saveAcademicYear`, {
    headers: admin,
    data: input,
  });
  expect(created.status()).toBe(200);
  const year = (await created.json()) as {
    id: string;
    revision: number;
    isCurrent: boolean;
  };
  expect(year.isCurrent).toBe(false);
  const duplicate = await request.post(`${origin}/saveAcademicYear`, {
    headers: admin,
    data: input,
  });
  expect(duplicate.status()).toBe(409);
  const updates = await Promise.all(
    ["2031-07-01", "2031-07-02"].map((endsOn) =>
      request.post(`${origin}/saveAcademicYear`, {
        headers: admin,
        data: {
          ...input,
          id: year.id,
          expectedRevision: year.revision,
          endsOn,
        },
      }),
    ),
  );
  expect(
    updates.map((response) => response.status()).toSorted((a, b) => a - b),
  ).toEqual([200, 409]);
  const detail = await request.post(`${origin}/getAcademicYear`, {
    headers: admin,
    data: { id: year.id },
  });
  expect(detail.status()).toBe(200);
  expect(await detail.json()).toMatchObject({
    revision: year.revision + 1,
    isCurrent: false,
  });
  const missing = await request.post(`${origin}/getAcademicYear`, {
    headers: otherSchool,
    data: { id: year.id },
  });
  expect(missing.status()).toBe(404);
  const foreignWrite = await request.post(`${origin}/saveAcademicYear`, {
    headers: otherSchool,
    data: { ...input, id: year.id, expectedRevision: year.revision + 1 },
  });
  expect(foreignWrite.status()).toBe(404);
});

test("administrators create a school year through a validated page and reopen it", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
  await page.goto("/admin/settings");
  await page.getByRole("link", { name: "Manage school years" }).click();
  await page.getByRole("link", { name: "Create school year" }).click();
  const name = `Y-${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByLabel("School year name", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("School year name", { exact: true }).fill(name);
  await page.getByLabel("Starts", { exact: true }).fill("2032-09-01");
  await page.getByLabel("Ends", { exact: true }).fill("2033-06-30");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/academic-years$/);
  await page.reload();
  await page.getByRole("link", { name: `Edit ${name}`, exact: true }).click();
  await expect(
    page.getByLabel("School year name", { exact: true }),
  ).toHaveValue(name);
  await expect(page.getByLabel("Starts", { exact: true })).toHaveValue(
    "2032-09-01",
  );
  await expect(page.getByLabel("Ends", { exact: true })).toHaveValue(
    "2033-06-30",
  );
});
