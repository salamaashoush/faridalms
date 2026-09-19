import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const origin = "http://127.0.0.1:3001/v1";

async function signIn(request: APIRequestContext, email: string) {
  const response = await request.post(`${origin}/auth/signIn`, {
    data: { school: "northwind", email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
}

interface Source {
  yearId: string;
  yearName: string;
  classA: { id: string; name: string };
  classB: { id: string; name: string };
  students: Record<
    "promoted" | "repeating" | "leaving",
    { id: string; name: string }
  >;
}

function source(): Source {
  return JSON.parse(
    execFileSync("bun", ["e2e/fixtures/rollover-source.ts"], {
      encoding: "utf8",
    }),
  ) as Source;
}

async function classes(
  request: APIRequestContext,
  headers: Record<string, string>,
  year: string,
  q = "",
) {
  return request.post(`${origin}/getAllClasses`, {
    headers,
    data: { year, q, pageSize: 48 },
  });
}

async function placement(
  request: APIRequestContext,
  headers: Record<string, string>,
  year: string,
  studentName: string,
) {
  const response = await request.post(`${origin}/getAllStudents`, {
    headers,
    data: { year, q: studentName },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    rows: { fullName: string; className: string | null }[];
    year: { id: string };
  };
  return {
    year: body.year.id,
    classes: body.rows
      .filter((row) => row.fullName === studentName)
      .map((row) => row.className),
  };
}

test("directories answer for the requested year, refuse an unknown one and read placements on that year's dates", async ({
  request,
}) => {
  const admin = await signIn(request, "admin@example.com");
  const from = source();

  const own = await classes(request, admin, from.yearId);
  expect(own.status()).toBe(200);
  const ownBody = (await own.json()) as {
    rows: { id: string }[];
    year: { id: string; isCurrent: boolean };
  };
  expect(ownBody.year).toMatchObject({ id: from.yearId, isCurrent: false });
  expect(ownBody.rows.map((row) => row.id).toSorted()).toEqual(
    [from.classA.id, from.classB.id].toSorted(),
  );
  const current = (await (
    await classes(request, admin, "", from.classA.name)
  ).json()) as { rows: { id: string }[]; year: { isCurrent: boolean } };
  expect(current.year.isCurrent).toBe(true);
  expect(current.rows).toEqual([]);
  expect((await classes(request, admin, crypto.randomUUID())).status()).toBe(
    404,
  );

  const target = await request.post(`${origin}/saveAcademicYear`, {
    headers: admin,
    data: {
      name: `W${crypto.randomUUID().slice(0, 8)}`,
      startsOn: "2057-09-01",
      endsOn: "2058-06-30",
    },
  });
  const { id: targetId } = (await target.json()) as { id: string };
  const query = { sourceYearId: from.yearId, targetYearId: targetId };
  const preview = (await (
    await request.post(`${origin}/getRollover`, { headers: admin, data: query })
  ).json()) as { plan: unknown };
  expect(
    (
      await request.post(`${origin}/saveRollover`, {
        headers: admin,
        data: { ...query, expectedRevision: 0, plan: preview.plan },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post(`${origin}/applyRollover`, {
        headers: admin,
        data: { ...query, expectedRevision: 1 },
      })
    ).status(),
  ).toBe(200);

  const name = from.students.promoted.name;
  expect(await placement(request, admin, from.yearId, name)).toEqual({
    year: from.yearId,
    classes: [from.classA.name],
  });
  expect(await placement(request, admin, targetId, name)).toEqual({
    year: targetId,
    classes: [from.classA.name],
  });
  expect((await placement(request, admin, "", name)).classes).toEqual([null]);

  await request.post(`${origin}/setAcademicYearStatus`, {
    headers: admin,
    data: {
      id: from.yearId,
      expectedRevision: 1,
      status: "closed",
      reason: "",
    },
  });
  const closedClass = (await (
    await request.post(`${origin}/getClass`, {
      headers: admin,
      data: { id: from.classA.id },
    })
  ).json()) as {
    schoolYearStatus: string;
    schoolYearIsCurrent: boolean;
    canManage: boolean;
    canRecordAttendance: boolean;
  };
  expect(closedClass).toMatchObject({
    schoolYearStatus: "closed",
    schoolYearIsCurrent: false,
    canManage: false,
    canRecordAttendance: false,
  });
});

test("administrators switch the working year in the class directory and keep it in the address", async ({
  page,
  request,
}) => {
  const admin = await signIn(request, "admin@example.com");
  const from = source();
  const years = (await (
    await request.post(`${origin}/getAcademicYears`, { headers: admin })
  ).json()) as { id: string; revision: number }[];
  const revision = years.find((year) => year.id === from.yearId)?.revision;
  expect(
    (
      await request.post(`${origin}/setAcademicYearStatus`, {
        headers: admin,
        data: {
          id: from.yearId,
          expectedRevision: revision,
          status: "closed",
          reason: "",
        },
      })
    ).status(),
  ).toBe(200);

  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
  await page.goto("/admin/classes");
  await expect(
    page.getByRole("heading", { level: 1, name: "Classes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create class", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "School year" }).click();
  await page
    .getByRole("option", { name: `${from.yearName} · Closed`, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`year=${from.yearId}`));
  await expect(page.getByText(from.classA.name, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create class", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Edit ${from.classA.name}` }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(from.classA.name, { exact: true })).toBeVisible();

  await page.goto(`/classes/${from.classA.id}`);
  await expect(
    page.getByText(`${from.yearName} · Closed · not the default year`),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit class" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Record attendance" }),
  ).toHaveCount(0);

  await page.goto(`/admin/classes?year=${crypto.randomUUID()}`);
  await expect(page.getByText("Page not found")).toBeVisible();
});
