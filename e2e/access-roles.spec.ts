import { expect, test } from "@playwright/test";

import type { Api } from "./fixtures/api";

import { apiAs, signedInApi } from "./fixtures/api";
import { names, refusal } from "./fixtures/school";
import { PASSWORD, signIn, untilHydrated } from "./fixtures/sign-in";

const ACCOUNT_PASSWORD = "clerk-passphrase-2026-salama";

/** A new teacher with a password of their own, as the office would add one. */
async function newTeacher(admin: Api, label: string) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `${label}-${suffix}@northwind.example.com`;
  const family = `Ashoush ${label} ${suffix}`;
  const { id } = await admin.people.saveStaff({
    names: names("Salama", family),
    email,
    roles: ["teacher"],
  });
  await admin.people.saveSignIn({
    userId: id,
    loginName: email,
    password: ACCOUNT_PASSWORD,
  });
  return { id, email, name: `Salama ${family}` };
}

test("school roles grant only what the actor holds, never lock out the last administrator and are audited", async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const [admin, teacher] = await Promise.all([
    apiAs("admin"),
    apiAs("teacher"),
  ]);
  expect(await refusal(teacher.access.roles())).toMatchObject({
    code: "FORBIDDEN",
  });
  const catalogue = await admin.access.roles();
  expect(catalogue.roles.map((role) => role.builtinKey)).toEqual(
    expect.arrayContaining(["principal", "teacher", "family", "student"]),
  );
  expect(catalogue.grantable).toContain("access:manage");

  const clerkRole = await admin.access.saveRole({
    nameEn: `Attendance clerk ${suffix}`,
    capabilities: [
      "classes:read",
      "roster:read",
      "attendance:read",
      "attendance:record",
      "messages:read",
      "calendar:read",
      "timetable:read",
    ],
  });
  expect(clerkRole.version).toBe(1);
  expect(
    await refusal(
      admin.access.saveRole({
        id: clerkRole.id,
        expectedVersion: 5,
        nameEn: "Renamed",
        capabilities: ["classes:read"],
      }),
    ),
  ).toMatchObject({ code: "CONFLICT" });

  const clerk = await newTeacher(admin, "clerk");
  await admin.access.assign({
    userId: clerk.id,
    accessRoleId: clerkRole.id,
    replacesBuiltin: true,
  });
  const clerkApi = (await signedInApi(clerk.email, ACCOUNT_PASSWORD)).api;
  const profile = await clerkApi.identity.currentUser();
  expect(profile.capabilities).toContain("attendance:record");
  expect(profile.capabilities).not.toContain("assignments:author");
  expect(await refusal(clerkApi.coursework.options())).toMatchObject({
    code: "FORBIDDEN",
  });
  expect((await clerkApi.classes.mine({})).rows).toBeDefined();

  const officeRole = await admin.access.saveRole({
    nameEn: `Office ${suffix}`,
    capabilities: ["access:manage", "staff:manage", "people:read"],
  });
  const limited = await newTeacher(admin, "limited");
  await admin.access.assign({
    userId: limited.id,
    accessRoleId: officeRole.id,
    replacesBuiltin: true,
  });
  const limitedApi = (await signedInApi(limited.email, ACCOUNT_PASSWORD)).api;
  expect(
    await refusal(
      limitedApi.access.saveRole({
        nameEn: `Sneaky ${suffix}`,
        capabilities: ["access:manage", "school:manage"],
      }),
    ),
  ).toMatchObject({ code: "FORBIDDEN", message: "access.not_held" });
  const modest = await limitedApi.access.saveRole({
    nameEn: `Front desk ${suffix}`,
    capabilities: ["people:read"],
  });
  expect(modest.id).toBeTruthy();

  // Acme has one administrator, so narrowing the role that makes them one
  // would leave the school with nobody to manage access.
  const acme = (
    await signedInApi("principal.acme@acme.example.com", PASSWORD, "acme")
  ).api;
  const principalRole = (await acme.access.roles()).roles.find(
    (role) => role.builtinKey === "principal",
  );
  if (!principalRole) throw new Error("the seed gives acme no principal role");
  expect(
    await refusal(
      acme.access.saveRole({
        id: principalRole.id,
        expectedVersion: principalRole.version,
        nameEn: "Principal",
        capabilities: principalRole.capabilities.filter(
          (capability) => capability !== "access:manage",
        ),
      }),
    ),
  ).toMatchObject({ code: "CONFLICT", message: "access.last_manager" });

  const log = await admin.access.changes({});
  expect(log.rows.map((row) => row.action)).toEqual(
    expect.arrayContaining(["access_role.create", "access_assignment.create"]),
  );
});

test("administrators shape a role in settings and assign it from the person's record", async ({
  page,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const admin = await apiAs("admin");
  const desk = await newTeacher(admin, "desk");
  const roleName = `Desk ${suffix}`;

  await signIn(page, "admin");
  await page.goto("/admin/settings?section=access");
  await untilHydrated(page);
  await page.getByRole("button", { name: "New role", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "New role" });
  await sheet
    .getByRole("textbox", { name: "Name in English", exact: true })
    .fill(roleName);
  await sheet
    .getByRole("checkbox", { name: "See classes", exact: true })
    .click();
  await sheet
    .getByRole("checkbox", { name: "See attendance", exact: true })
    .click();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: roleName, exact: true }).first(),
  ).toBeVisible();

  await page.goto(`/people/${desk.id}?tab=access`);
  await untilHydrated(page);
  await page.getByRole("button", { name: "Assign role", exact: true }).click();
  const assign = page.getByRole("dialog", { name: "Assign role" });
  await assign.getByRole("combobox", { name: /^Role/ }).click();
  await page.getByRole("option", { name: roleName, exact: true }).click();
  await assign
    .getByRole("checkbox", { name: "Use instead of their usual role's access" })
    .click();
  await assign.getByRole("button", { name: "Save", exact: true }).click();
  await expect(assign).toHaveCount(0);
  await expect(
    page.getByText(`Role assigned to ${desk.name}`, { exact: true }),
  ).toBeVisible();

  // The same role again for days it is already held is caught on the form.
  await page.getByRole("button", { name: "Assign role", exact: true }).click();
  await assign.getByRole("combobox", { name: /^Role/ }).click();
  await page.getByRole("option", { name: roleName, exact: true }).click();
  await assign.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    assign.getByRole("textbox", { name: "Starts on" }),
  ).toHaveAccessibleDescription(
    /already has this role for some of these dates/,
  );
  await assign.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(assign).toHaveCount(0);

  const profile = await (
    await signedInApi(desk.email, ACCOUNT_PASSWORD)
  ).api.identity.currentUser();
  expect(profile.capabilities).toEqual(
    expect.arrayContaining(["classes:read", "attendance:read"]),
  );
  expect(profile.capabilities).not.toContain("assignments:author");
});

test("an administrator cannot take away their own ability to manage roles, and is told so", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/admin/settings?section=access");
  await untilHydrated(page);
  await page
    .getByRole("link", { name: "Principal", exact: true })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Edit role" });
  const manage = sheet.getByRole("checkbox", {
    name: "Manage roles and who holds them",
    exact: true,
  });
  await expect(manage).toBeChecked();
  await manage.click();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "You cannot remove your own ability to manage roles and permissions.",
  );
  const profile = await (await apiAs("admin")).identity.currentUser();
  expect(profile.capabilities).toContain("access:manage");
});
