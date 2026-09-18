import { expect, test } from "@playwright/test";

test("a register starts unrecorded, saves explicit marks and explains invalid dates", async ({
  page,
  request,
}) => {
  const origin = "http://127.0.0.1:3001/v1";
  const signIn = async (email: string) => {
    const response = await request.post(`${origin}/auth/signIn`, {
      data: { school: "northwind", email, password: "northwind1234" },
    });
    expect(response.status()).toBe(200);
    const { token } = (await response.json()) as { token: string };
    return { authorization: `Bearer ${token}` };
  };
  const admin = await signIn("admin@example.com");
  const teacher = await signIn("teacher@example.com");
  const account = await request.post(`${origin}/auth/currentUser`, {
    headers: teacher,
  });
  expect(account.status()).toBe(200);
  const { id: teacherId } = (await account.json()) as { id: string };
  const unique = crypto.randomUUID().slice(0, 8);
  const created = await request.post(`${origin}/saveClass`, {
    headers: admin,
    data: {
      name: `Register ${unique}`,
      grade: "P1",
      stage: "primary",
      homeroomTeacherId: teacherId,
      subjects: [],
    },
  });
  expect(created.status()).toBe(200);
  const { id: classId } = (await created.json()) as { id: string };
  const student = await request.post(`${origin}/saveStudent`, {
    headers: admin,
    data: {
      firstName: "Salama",
      lastName: "Ashoush",
      reference: `R-${unique}`,
      classId,
      guardianIds: [],
    },
  });
  expect(student.status()).toBe(200);
  const { id: studentId } = (await student.json()) as { id: string };
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("teacher@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
  await page.goto(`/teach/attendance?classId=${classId}`);
  await expect(
    page.getByRole("button", { name: "Save register", exact: true }),
  ).toBeDisabled();
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Mark unrecorded students present",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Note for Salama Ashoush", exact: true })
    .fill("Arrived with the class.");
  const originalUrl = page.url();
  await page.locator("#register-date").fill("1900-01-01");
  const leaveDialog = page.getByRole("dialog", {
    name: "Leave without saving?",
  });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(originalUrl);
  await expect(
    page.getByRole("textbox", { name: "Note for Salama Ashoush", exact: true }),
  ).toHaveValue("Arrived with the class.");
  await page
    .getByRole("button", { name: "Save register", exact: true })
    .click();
  await expect(
    page.getByText("Attendance saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save register", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.locator('input[type="radio"][value="present"]'),
  ).toBeChecked();
  await expect(
    page.getByRole("textbox", { name: "Note for Salama Ashoush", exact: true }),
  ).toHaveValue("Arrived with the class.");
  const readRegister = async () => {
    const response = await request.post(`${origin}/getAttendanceRegister`, {
      headers: teacher,
      data: { classId },
    });
    expect(response.status()).toBe(200);
    return (await response.json()) as {
      date: string;
      marks: { studentId: string; revision: number; note: string | null }[];
    };
  };
  const initial = await readRegister();
  expect(initial.marks[0]?.revision).toBe(1);
  await page
    .getByRole("textbox", { name: "Note for Salama Ashoush", exact: true })
    .fill("Returned after break.");
  await page
    .getByRole("button", { name: "Save register", exact: true })
    .click();
  await expect
    .poll(async () => (await readRegister()).marks[0]?.revision)
    .toBe(2);
  await expect(
    page.getByRole("button", { name: "Save register", exact: true }),
  ).toBeEnabled();
  const competing = await Promise.all(
    ["late", "absent"].map((status) =>
      request.post(`${origin}/saveAttendance`, {
        headers: teacher,
        data: {
          classId,
          date: initial.date,
          entries: [
            { studentId, status, note: "Concurrent edit", expectedRevision: 2 },
          ],
        },
      }),
    ),
  );
  expect(
    competing.map((response) => response.status()).toSorted((a, b) => a - b),
  ).toEqual([200, 409]);
  await page
    .getByRole("textbox", { name: "Note for Salama Ashoush", exact: true })
    .fill("My unsaved draft");
  await page
    .getByRole("button", { name: "Save register", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Another person changed this register. Your edits have not been saved. Reload and review the latest marks before trying again.",
  );
  await expect(
    page.getByRole("textbox", { name: "Note for Salama Ashoush", exact: true }),
  ).toHaveValue("My unsaved draft");
  const second = await request.post(`${origin}/saveStudent`, {
    headers: admin,
    data: {
      firstName: "Salama",
      lastName: "Ashoush Second",
      reference: `S-${unique}`,
      classId,
      guardianIds: [],
    },
  });
  expect(second.status()).toBe(200);
  const { id: secondId } = (await second.json()) as { id: string };
  const mixed = await request.post(`${origin}/saveAttendance`, {
    headers: teacher,
    data: {
      classId,
      date: initial.date,
      entries: [
        { studentId: secondId, status: "present", expectedRevision: null },
        { studentId, status: "present", expectedRevision: 2 },
      ],
    },
  });
  expect(mixed.status()).toBe(409);
  const unchanged = await readRegister();
  expect(unchanged.marks).toHaveLength(1);
  expect(unchanged.marks[0]).toMatchObject({
    studentId,
    revision: 3,
    note: "Concurrent edit",
  });
  await page.locator("#register-date").fill("1900-01-01");
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(/date=1900-01-01/);
  await expect(page.getByRole("alert")).toHaveText(
    "Choose a date within this class’s school year.",
  );
  await expect(
    page.getByRole("button", { name: "Save register", exact: true }),
  ).toHaveCount(0);
});
