import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3001";

async function signIn(
  request: APIRequestContext,
  email: string,
  password = "northwind1234",
) {
  const response = await request.post(`${origin}/v1/auth/signIn`, {
    data: { school: "northwind", email, password },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
}

async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email or sign-in name" })
    .fill(email);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
}

const PASSWORD = "clerk-passphrase-2026";

async function createAccount(
  request: APIRequestContext,
  admin: Record<string, string>,
  input: { name: string; email: string; role: "admin" | "teacher" },
) {
  const response = await request.post(`${origin}/v1/saveUser`, {
    headers: admin,
    data: {
      ...input,
      title: "",
      mobile: "",
      password: PASSWORD,
      isActive: true,
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { id: string };
}

test("school roles grant only what the actor holds, never lock out the last administrator and are audited", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = await signIn(request, "admin@example.com");
  const teacher = await signIn(request, "sara@example.com");
  expect(
    (
      await request.post(`${origin}/v1/getAccessRoles`, { headers: teacher })
    ).status(),
  ).toBe(403);
  const catalogue = await request.post(`${origin}/v1/getAccessRoles`, {
    headers: admin,
  });
  expect(catalogue.status()).toBe(200);
  const roles = (await catalogue.json()) as {
    builtins: { baseRole: string; permissions: string[] }[];
    grantable: string[];
  };
  expect(roles.builtins.map((row) => row.baseRole)).toEqual([
    "admin",
    "teacher",
    "parent",
    "student",
  ]);
  expect(roles.grantable).toContain("access:manage");

  const clerkRoleId = crypto.randomUUID();
  const clerk = await request.post(`${origin}/v1/saveAccessRole`, {
    headers: admin,
    data: {
      id: clerkRoleId,
      expectedRevision: 0,
      name: `Attendance clerk ${suffix}`,
      baseRole: "teacher",
      permissions: [
        "classes:read",
        "roster:read",
        "attendance:read",
        "attendance:record",
        "messages:read",
        "calendar:read",
        "student-profile:read",
        "timetable:read",
      ],
    },
  });
  expect(clerk.status()).toBe(200);
  expect(await clerk.json()).toMatchObject({ id: clerkRoleId, revision: 1 });
  const stale = await request.post(`${origin}/v1/saveAccessRole`, {
    headers: admin,
    data: {
      id: clerkRoleId,
      expectedRevision: 5,
      name: "Renamed",
      baseRole: "teacher",
      permissions: ["classes:read"],
    },
  });
  expect(stale.status()).toBe(409);

  const teacherAccount = await createAccount(request, admin, {
    name: `Clerk Teacher ${suffix}`,
    email: `clerk-${suffix}@example.com`,
    role: "teacher",
  });
  const parentRole = await request.post(`${origin}/v1/assignAccessRole`, {
    headers: admin,
    data: {
      userId: teacherAccount.id,
      accessRoleId: clerkRoleId,
      expectedRevision: 0,
    },
  });
  expect(parentRole.status()).toBe(200);
  const clerkSession = await signIn(
    request,
    `clerk-${suffix}@example.com`,
    PASSWORD,
  );
  const me = await request.post(`${origin}/v1/auth/currentUser`, {
    headers: clerkSession,
  });
  const profile = (await me.json()) as { permissions: string[] };
  expect(profile.permissions).toContain("attendance:record");
  expect(profile.permissions).not.toContain("assignments:author");
  expect(
    (
      await request.post(`${origin}/v1/getAuthoringContext`, {
        headers: clerkSession,
        data: { classId: "" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`${origin}/v1/getMyClasses`, { headers: clerkSession })
    ).status(),
  ).toBe(200);

  const studentsResponse = await request.post(`${origin}/v1/getAllUsers`, {
    headers: admin,
    data: { role: "parent" },
  });
  const parents = (await studentsResponse.json()) as { rows: { id: string }[] };
  const parent = parents.rows[0];
  if (!parent) throw new Error("Missing seeded parent");
  expect(
    (
      await request.post(`${origin}/v1/assignAccessRole`, {
        headers: admin,
        data: {
          userId: parent.id,
          accessRoleId: clerkRoleId,
          expectedRevision: 0,
        },
      })
    ).status(),
  ).toBe(400);

  const officeRoleId = crypto.randomUUID();
  const office = await request.post(`${origin}/v1/saveAccessRole`, {
    headers: admin,
    data: {
      id: officeRoleId,
      expectedRevision: 0,
      name: `Office ${suffix}`,
      baseRole: "admin",
      permissions: [
        "access:manage",
        "users:read",
        "users:manage",
        "classes:read",
      ],
    },
  });
  expect(office.status()).toBe(200);
  const limitedAccount = await createAccount(request, admin, {
    name: `Limited Admin ${suffix}`,
    email: `limited-${suffix}@example.com`,
    role: "admin",
  });
  expect(
    (
      await request.post(`${origin}/v1/assignAccessRole`, {
        headers: admin,
        data: {
          userId: limitedAccount.id,
          accessRoleId: officeRoleId,
          expectedRevision: 0,
        },
      })
    ).status(),
  ).toBe(200);
  const limited = await signIn(
    request,
    `limited-${suffix}@example.com`,
    PASSWORD,
  );
  const escalation = await request.post(`${origin}/v1/saveAccessRole`, {
    headers: limited,
    data: {
      id: crypto.randomUUID(),
      expectedRevision: 0,
      name: `Sneaky ${suffix}`,
      baseRole: "admin",
      permissions: ["access:manage", "school:manage"],
    },
  });
  expect(escalation.status()).toBe(403);
  const modest = await request.post(`${origin}/v1/saveAccessRole`, {
    headers: limited,
    data: {
      id: crypto.randomUUID(),
      expectedRevision: 0,
      name: `Front desk ${suffix}`,
      baseRole: "admin",
      permissions: ["users:read", "classes:read"],
    },
  });
  expect(modest.status()).toBe(200);
  const meResponse = await request.post(`${origin}/v1/auth/currentUser`, {
    headers: limited,
  });
  const limitedProfile = (await meResponse.json()) as { id: string };
  const lockout = await request.post(`${origin}/v1/assignAccessRole`, {
    headers: limited,
    data: {
      userId: limitedProfile.id,
      accessRoleId: null,
      expectedRevision: 1,
    },
  });
  expect(lockout.status()).toBe(200);
  const selfLock = await request.post(`${origin}/v1/assignAccessRole`, {
    headers: limited,
    data: {
      userId: limitedProfile.id,
      accessRoleId: (await modest.json()).id as string,
      expectedRevision: 0,
    },
  });
  expect(selfLock.status()).toBe(400);

  const audit = await request.post(`${origin}/v1/getAccessChanges`, {
    headers: admin,
    data: { page: 1 },
  });
  expect(audit.status()).toBe(200);
  const changes = (await audit.json()) as {
    rows: { action: string; targetId: string; after: { name?: string } }[];
  };
  expect(changes.rows).toContainEqual(
    expect.objectContaining({
      action: "role.created",
      targetId: clerkRoleId,
    }),
  );
  expect(changes.rows).toContainEqual(
    expect.objectContaining({
      action: "assignment.changed",
      targetId: teacherAccount.id,
    }),
  );
});

test("administrators shape a role in settings and assign it from the staff directory", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = await signIn(request, "admin@example.com");
  const account = await createAccount(request, admin, {
    name: `Desk Teacher ${suffix}`,
    email: `desk-${suffix}@example.com`,
    role: "teacher",
  });

  await login(page, "admin@example.com");
  await page.goto("/admin/settings?section=access");
  await page.getByRole("button", { name: "New role", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Role name", exact: true })
    .fill(`Desk ${suffix}`);
  await dialog
    .getByRole("checkbox", { name: "View classes", exact: true })
    .click();
  await dialog
    .getByRole("checkbox", { name: "View attendance", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: `Desk ${suffix}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Role created", { exact: true }).first(),
  ).toBeVisible();

  await page.goto("/admin/staff");
  await page
    .getByRole("searchbox", { name: "Search records…" })
    .fill(`Desk Teacher ${suffix}`);
  await page
    .getByRole("button", { name: `Edit Desk Teacher ${suffix}`, exact: true })
    .click();
  await dialog.getByRole("combobox", { name: "Access role" }).click();
  await page
    .getByRole("option", { name: `Desk ${suffix}`, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);

  const session = await signIn(request, `desk-${suffix}@example.com`, PASSWORD);
  const me = await request.post(`${origin}/v1/auth/currentUser`, {
    headers: session,
  });
  expect(await me.json()).toMatchObject({
    permissions: expect.arrayContaining(["classes:read", "attendance:read"]),
    accessRoleId: expect.any(String),
  });
  const profile = (await me.json()) as { permissions: string[] };
  expect(profile.permissions).not.toContain("assignments:author");
  expect(account.id).toBeTruthy();
});
