import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const origin = "http://127.0.0.1:3001/v1";

async function signIn(
  request: APIRequestContext,
  email: string,
  password = "northwind1234",
) {
  const response = await request.post(`${origin}/auth/signIn`, {
    data: { school: "northwind", email, password },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
}

interface Year {
  id: string;
  name: string;
  status: string;
  isCurrent: boolean;
  revision: number;
}

async function years(
  request: APIRequestContext,
  headers: Record<string, string>,
) {
  return (await (
    await request.post(`${origin}/getAcademicYears`, { headers })
  ).json()) as Year[];
}

async function yearById(
  request: APIRequestContext,
  headers: Record<string, string>,
  id: string,
) {
  const year = (await years(request, headers)).find((row) => row.id === id);
  if (!year) throw new Error(`Missing year ${id}`);
  return year;
}

const status = (
  request: APIRequestContext,
  headers: Record<string, string>,
  year: Year,
  next: string,
  reason = "",
) =>
  request.post(`${origin}/setAcademicYearStatus`, {
    headers,
    data: {
      id: year.id,
      expectedRevision: year.revision,
      status: next,
      reason,
    },
  });

async function message(response: { json: () => Promise<unknown> }) {
  return ((await response.json()) as { message?: string }).message;
}

test("a year moves through its lifecycle, a closed year refuses academic writes, and reopening needs a reason and its own capability", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  const admin = await signIn(request, "admin@example.com");
  const teacher = await signIn(request, "sara@example.com");

  const created = await request.post(`${origin}/saveAcademicYear`, {
    headers: admin,
    data: {
      name: `L${suffix}`,
      startsOn: "2044-09-01",
      endsOn: "2045-06-30",
    },
  });
  expect(created.status()).toBe(200);
  let planned = (await created.json()) as Year;
  expect(planned.status).toBe("planning");
  expect((await status(request, teacher, planned, "active")).status()).toBe(
    403,
  );
  const skipped = await status(request, admin, planned, "closed");
  expect(skipped.status()).toBe(400);
  expect(await message(skipped)).toBe("academic_year.transition");
  const notActive = await request.post(`${origin}/setDefaultAcademicYear`, {
    headers: admin,
    data: { id: planned.id, expectedRevision: planned.revision },
  });
  expect(notActive.status()).toBe(400);
  expect(await message(notActive)).toBe("academic_year.not_active");
  const activated = await status(request, admin, planned, "active");
  expect(activated.status()).toBe(200);
  expect((await status(request, admin, planned, "closed")).status()).toBe(409);
  planned = await yearById(request, admin, planned.id);
  expect(planned).toMatchObject({ status: "active", revision: 2 });

  const current = (await years(request, admin)).find((row) => row.isCurrent);
  if (!current) throw new Error("Missing default year");
  const closingDefault = await status(request, admin, current, "closed");
  expect(closingDefault.status()).toBe(400);
  expect(await message(closingDefault)).toBe("academic_year.default_closing");

  const fixture = JSON.parse(
    execFileSync("bun", ["e2e/fixtures/academic-year.ts", "--enrollment"], {
      encoding: "utf8",
    }),
  ) as {
    schoolYearId: string;
    classId: string;
    subjectId: string;
    today: string;
    enrollmentFixture: { studentId: string };
  };
  let fixtureYear = await yearById(request, admin, fixture.schoolYearId);
  expect((await status(request, admin, fixtureYear, "closed")).status()).toBe(
    200,
  );
  const attendance = {
    classId: fixture.classId,
    date: fixture.today,
    entries: [
      { studentId: fixture.enrollmentFixture.studentId, status: "present" },
    ],
  };
  const refusedAttendance = await request.post(`${origin}/saveAttendance`, {
    headers: admin,
    data: attendance,
  });
  expect(refusedAttendance.status()).toBe(409);
  expect(await message(refusedAttendance)).toBe("academic_year.closed");
  const refusedAssignment = await request.post(`${origin}/createAssignment`, {
    headers: admin,
    data: {
      classId: fixture.classId,
      subjectId: fixture.subjectId,
      title: "Salama closed year",
      description: "Written after the year closed.",
      dueDate: fixture.today,
      maxScore: 10,
    },
  });
  expect(refusedAssignment.status()).toBe(409);
  expect(await message(refusedAssignment)).toBe("academic_year.closed");
  fixtureYear = await yearById(request, admin, fixture.schoolYearId);
  const refusedEdit = await request.post(`${origin}/saveAcademicYear`, {
    headers: admin,
    data: {
      id: fixtureYear.id,
      expectedRevision: fixtureYear.revision,
      name: fixtureYear.name,
      startsOn: fixture.today,
      endsOn: fixture.today,
    },
  });
  expect(refusedEdit.status()).toBe(409);

  const registrarRole = crypto.randomUUID();
  expect(
    (
      await request.post(`${origin}/saveAccessRole`, {
        headers: admin,
        data: {
          id: registrarRole,
          expectedRevision: 0,
          name: `Registrar ${suffix}`,
          baseRole: "admin",
          permissions: ["school:manage", "users:read", "classes:read"],
        },
      })
    ).status(),
  ).toBe(200);
  const registrarAccount = await request.post(`${origin}/saveUser`, {
    headers: admin,
    data: {
      name: `Salama Registrar ${suffix}`,
      email: `registrar-${suffix}@example.com`,
      role: "admin",
      title: "",
      mobile: "",
      password: "registrar-passphrase-2026",
      isActive: true,
    },
  });
  expect(registrarAccount.status()).toBe(200);
  const { id: registrarId } = (await registrarAccount.json()) as { id: string };
  expect(
    (
      await request.post(`${origin}/assignAccessRole`, {
        headers: admin,
        data: {
          userId: registrarId,
          accessRoleId: registrarRole,
          expectedRevision: 0,
        },
      })
    ).status(),
  ).toBe(200);
  const registrar = await signIn(
    request,
    `registrar-${suffix}@example.com`,
    "registrar-passphrase-2026",
  );
  const withoutCapability = await status(
    request,
    registrar,
    fixtureYear,
    "active",
    "Correct a register",
  );
  expect(withoutCapability.status()).toBe(403);
  expect(await message(withoutCapability)).toBe(
    "academic_year.reopen_forbidden",
  );
  const withoutReason = await status(request, admin, fixtureYear, "active");
  expect(withoutReason.status()).toBe(400);
  expect(await message(withoutReason)).toBe("academic_year.reason_required");
  expect(
    (
      await status(
        request,
        admin,
        fixtureYear,
        "active",
        "Salama marked Omar absent by mistake",
      )
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post(`${origin}/saveAttendance`, {
        headers: admin,
        data: attendance,
      })
    ).status(),
  ).toBe(200);

  const events = (await (
    await request.post(`${origin}/getAcademicYearEvents`, {
      headers: admin,
      data: { id: fixture.schoolYearId },
    })
  ).json()) as { action: string; reason: string | null }[];
  expect(events.map((event) => event.action)).toEqual(["reopened", "closed"]);
  expect(events[0]?.reason).toBe("Salama marked Omar absent by mistake");
});

test("switching the default year moves the flag atomically and keeps the default open", async ({
  request,
}) => {
  const admin = await signIn(request, "admin@example.com");
  const before = (await years(request, admin)).find((row) => row.isCurrent);
  const result = JSON.parse(
    execFileSync("bun", ["e2e/fixtures/default-year.ts"], {
      encoding: "utf8",
    }),
  ) as {
    refusal: string;
    switchedIsCurrent: boolean;
    currentIds: string[];
    plannedId: string;
    previousId: string;
    formerDefault: { isCurrent: boolean; revision: number };
    previousRevision: number;
    events: string[];
    closingDefault: string;
    defaultAfterRollback: string;
  };
  expect(result.refusal).toBe("academic_year.not_active");
  expect(result.switchedIsCurrent).toBe(true);
  expect(result.currentIds).toEqual([result.plannedId]);
  expect(result.formerDefault).toEqual({
    isCurrent: false,
    revision: result.previousRevision + 1,
  });
  expect(result.events).toEqual(["made_default"]);
  expect(result.closingDefault).toContain("school_years_default_active_check");
  expect(result.defaultAfterRollback).toBe(result.previousId);
  expect(before?.id).toBe(result.previousId);
});

test("administrators start, close and reopen a year from the year directory and read its history", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  const admin = await signIn(request, "admin@example.com");
  const name = `B${suffix}`;
  const created = await request.post(`${origin}/saveAcademicYear`, {
    headers: admin,
    data: { name, startsOn: "2046-09-01", endsOn: "2047-06-30" },
  });
  expect(created.status()).toBe(200);

  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
  await page.goto("/admin/academic-years");
  const card = page.locator("article", {
    has: page.getByRole("heading", { name, exact: true }),
  });
  await expect(card.getByText("Planning", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Start teaching" }).click();
  await expect(card.getByText("Teaching", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Close year" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Close year" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.getByText("Closed", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Reopen for corrections" }).click();
  await dialog.getByRole("button", { name: "Reopen for corrections" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Say why the year is being reopened.",
  );
  await dialog
    .getByRole("textbox", { name: "Reason" })
    .fill("Salama corrects a mistyped term date");
  await dialog.getByRole("button", { name: "Reopen for corrections" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.getByText("Teaching", { exact: true })).toBeVisible();
  await card.getByRole("link", { name: `Edit ${name}` }).click();
  const history = page.getByRole("region", { name: "History" });
  await expect(history.getByText("Reopened for corrections")).toBeVisible();
  await expect(
    history.getByText("Salama corrects a mistyped term date"),
  ).toBeVisible();
  await expect(history.getByText("Started teaching")).toBeVisible();
});
