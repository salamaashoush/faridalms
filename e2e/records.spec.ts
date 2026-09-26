import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3001";

async function signIn(request: APIRequestContext, email: string) {
  const response = await request.post(`${origin}/v1/auth/signIn`, {
    data: { school: "northwind", email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
}

async function whoAmI(
  request: APIRequestContext,
  headers: Record<string, string>,
) {
  const response = await request.post(`${origin}/v1/auth/currentUser`, {
    headers,
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { id: string };
}

function person(
  request: APIRequestContext,
  headers: Record<string, string>,
  id: string,
) {
  return request.post(`${origin}/v1/getPerson`, { headers, data: { id } });
}

async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
}

test("people are reachable through shared classes, related students and conversations only", async ({
  request,
}) => {
  const admin = await signIn(request, "admin@example.com");
  const teacherByEmail = async (email: string) => {
    const response = await request.post(`${origin}/v1/getAllUsers`, {
      headers: admin,
      data: { role: "teacher", q: email },
    });
    expect(response.status()).toBe(200);
    const staff = (await response.json()) as {
      rows: { id: string; email: string }[];
    };
    return staff.rows.find((row) => row.email === email);
  };
  const norhan = await teacherByEmail("teacher@example.com");
  const sara = await teacherByEmail("sara@example.com");
  if (!norhan || !sara) throw new Error("Missing seeded teachers");

  const parent = await signIn(request, "parent@example.com");
  const learner = await signIn(request, "omar@example.com");
  const teacher = await signIn(request, "teacher@example.com");
  const [guardian, omar] = await Promise.all([
    whoAmI(request, parent),
    whoAmI(request, learner),
  ]);

  const parentSeesNorhan = await person(request, parent, norhan.id);
  expect(parentSeesNorhan.status()).toBe(200);
  expect(await parentSeesNorhan.json()).toMatchObject({
    profile: {
      role: "teacher",
      contact: { email: "teacher@example.com" },
      teaching: expect.arrayContaining([
        expect.objectContaining({
          className: "PreKG-A",
          subject: null,
          canOpen: true,
        }),
      ]),
    },
    access: { self: false, manage: false },
  });
  expect((await person(request, parent, sara.id)).status()).toBe(200);

  const teacherSeesGuardian = await person(request, teacher, guardian.id);
  expect(teacherSeesGuardian.status()).toBe(200);
  const guardianProfile = (await teacherSeesGuardian.json()) as {
    profile: { children: { fullName: string; relation: string }[] };
  };
  expect(guardianProfile.profile.children).toEqual([
    expect.objectContaining({ fullName: "Ali Ashoush", relation: "father" }),
  ]);
  expect((await person(request, teacher, omar.id)).status()).toBe(404);

  expect((await person(request, learner, sara.id)).status()).toBe(200);
  expect((await person(request, learner, norhan.id)).status()).toBe(404);
  const self = await person(request, learner, omar.id);
  expect(self.status()).toBe(200);
  expect(await self.json()).toMatchObject({
    access: { self: true },
    profile: { student: { fullName: "Omar Ashoush" } },
  });

  const adminSeesGuardian = await person(request, admin, guardian.id);
  expect(adminSeesGuardian.status()).toBe(200);
  const fullGuardian = (await adminSeesGuardian.json()) as {
    profile: { contact: { email: string }; children: { fullName: string }[] };
    access: { manage: boolean };
  };
  expect(fullGuardian.profile.contact.email).toBe("parent@example.com");
  expect(fullGuardian.access.manage).toBe(true);
  expect(
    fullGuardian.profile.children.map((child) => child.fullName).toSorted(),
  ).toEqual(["Ali Ashoush", "Omar Ashoush"]);
  expect(
    (
      await person(request, admin, "00000000-0000-4000-8000-000000000000")
    ).status(),
  ).toBe(404);
});

test("families move between student, class and person records without losing their place", async ({
  page,
}) => {
  await login(page, "parent@example.com");
  await page.goto("/family/children");
  await page
    .getByRole("link", { name: "Ali Ashoush PreKG-A", exact: true })
    .click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: "Ali Ashoush", exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Attendance", exact: true }).click();
  await expect(page).toHaveURL(/tab=attendance/);
  await expect(
    page.getByRole("heading", { name: "Daily record", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Coursework", exact: true }).click();
  await expect(page).toHaveURL(/tab=coursework/);
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Coursework", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Family", exact: true }).click();
  await expect(page).toHaveURL(/tab=family/);
  await page.getByRole("link", { name: "Salama Ashoush", exact: true }).click();
  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: "Salama Ashoush", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Omar Ashoush", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Notification preferences" }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/tab=family/);
  await expect(
    page.getByRole("tab", { name: "Family", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  await page
    .getByRole("link", { name: "PreKG-A", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/classes\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: "Teaching team", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Norhan Elsaraf", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: "Norhan Elsaraf", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Homeroom teacher", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Notification preferences" }),
  ).toHaveCount(0);

  await page
    .getByRole("link", { name: "PreKG-A", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/classes\/[a-f0-9-]+/);
  await page.getByRole("tab", { name: "Attendance", exact: true }).click();
  await expect(page).toHaveURL(/tab=attendance/);
  await expect(
    page.getByRole("link", { name: "Ali Ashoush", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Omar Ashoush", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Assignments", exact: true }).click();
  await expect(page).toHaveURL(/tab=coursework/);
  await expect(
    page.getByRole("heading", { name: "Assignments", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Timetable", exact: true }).click();
  await expect(page).toHaveURL(/tab=timetable/);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Timetable", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  const missing = await page.goto(
    "/people/00000000-0000-4000-8000-000000000000",
  );
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found", exact: true }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goBack();
  await expect(page).toHaveURL(/tab=timetable/);
  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("menuitem", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("tab", { selected: true })).toHaveText(
    "الجدول الدراسي",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a student reaches their own record from the user menu", async ({
  page,
}) => {
  await login(page, "omar@example.com");
  await page.getByRole("button", { name: "User menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "My profile", exact: true }).click();
  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: "Omar Ashoush", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Omar Ashoush/ }).click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
  await page.getByRole("tab", { name: "Coursework", exact: true }).click();
  await expect(page).toHaveURL(/tab=coursework/);
  await page.getByRole("link", { name: "P1-B", exact: true }).first().click();
  await expect(page).toHaveURL(/\/classes\/[a-f0-9-]+/);
  await page
    .getByRole("link", { name: "Sara Mahmoud", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: "Sara Mahmoud", exact: true }),
  ).toBeVisible();
});
