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
  endsOn: string;
  classA: { id: string; name: string };
  classB: { id: string; name: string };
  teacherId: string;
  homeroomId: string;
  students: Record<
    "promoted" | "repeating" | "leaving",
    { id: string; name: string }
  >;
}

interface Plan {
  classes: {
    key: string;
    sourceClassId: string;
    include: boolean;
    name: string;
    grade: string;
    stage: string;
    room: string;
    homeroomTeacherId: string;
    subjects: { subjectId: string; teacherId: string }[];
  }[];
  students: {
    studentId: string;
    sourceClassId: string;
    decision: string;
    targetKey: string;
  }[];
}

function source(): Source {
  return JSON.parse(
    execFileSync("bun", ["e2e/fixtures/rollover-source.ts"], {
      encoding: "utf8",
    }),
  ) as Source;
}

async function targetYear(
  request: APIRequestContext,
  admin: Record<string, string>,
  startsOn: string,
  endsOn: string,
) {
  const response = await request.post(`${origin}/saveAcademicYear`, {
    headers: admin,
    data: {
      name: `T${crypto.randomUUID().slice(0, 8)}`,
      startsOn,
      endsOn,
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { id: string; name: string };
}

async function history(
  request: APIRequestContext,
  admin: Record<string, string>,
  studentId: string,
) {
  const response = await request.post(`${origin}/getStudent`, {
    headers: admin,
    data: { studentId },
  });
  expect(response.status()).toBe(200);
  return (
    (await response.json()) as {
      profile: {
        enrollmentHistory: {
          classId: string;
          since: string;
          until: string | null;
        }[];
      };
    }
  ).profile.enrollmentHistory;
}

test("a reviewed rollover creates the next year's classes and placements once and moves nothing already recorded", async ({
  request,
}) => {
  const admin = await signIn(request, "admin@example.com");
  const teacher = await signIn(request, "sara@example.com");
  const from = source();
  const target = await targetYear(request, admin, "2051-09-01", "2052-06-30");
  const query = { sourceYearId: from.yearId, targetYearId: target.id };

  expect(
    (
      await request.post(`${origin}/getRollover`, {
        headers: teacher,
        data: query,
      })
    ).status(),
  ).toBe(403);
  const preview = await request.post(`${origin}/getRollover`, {
    headers: admin,
    data: query,
  });
  expect(preview.status()).toBe(200);
  const proposed = (await preview.json()) as {
    status: string;
    revision: number;
    issue: string | null;
    plan: Plan;
  };
  expect(proposed).toMatchObject({ status: "new", revision: 0, issue: null });
  const rowA = proposed.plan.classes.find(
    (row) => row.sourceClassId === from.classA.id,
  );
  const rowB = proposed.plan.classes.find(
    (row) => row.sourceClassId === from.classB.id,
  );
  if (!rowA || !rowB) throw new Error("The proposal lost a class");
  expect(rowA).toMatchObject({
    include: true,
    name: from.classA.name,
    homeroomTeacherId: from.homeroomId,
  });
  expect(rowA.subjects).toHaveLength(2);
  expect(proposed.plan.students).toHaveLength(3);
  expect(
    proposed.plan.students.every(
      (row) =>
        row.decision === "promote" &&
        row.targetKey ===
          (row.sourceClassId === from.classA.id ? rowA.key : rowB.key),
    ),
  ).toBe(true);

  const plan: Plan = {
    classes: [
      { ...rowA, name: `P2-A ${from.yearName}` },
      { ...rowB, name: `P2-B ${from.yearName}` },
    ],
    students: proposed.plan.students.map((row) =>
      row.studentId === from.students.repeating.id
        ? { ...row, decision: "repeat", targetKey: rowB.key }
        : row.studentId === from.students.leaving.id
          ? { ...row, decision: "withdraw", targetKey: "" }
          : row,
    ),
  };
  const duplicate = await request.post(`${origin}/saveRollover`, {
    headers: admin,
    data: {
      ...query,
      expectedRevision: 0,
      plan: {
        ...plan,
        classes: plan.classes.map((row) => ({ ...row, name: "P2" })),
      },
    },
  });
  expect(duplicate.status()).toBe(400);
  expect(((await duplicate.json()) as { message: string }).message).toBe(
    "rollover.duplicate_name",
  );
  const assignment = await request.post(`${origin}/createAssignment`, {
    headers: admin,
    data: {
      classId: from.classA.id,
      subjectId: rowA.subjects[0]?.subjectId,
      title: "Salama end of year reading",
      description: "Stays with the class it was set for.",
      dueDate: from.endsOn,
      maxScore: 10,
    },
  });
  expect(assignment.status()).toBe(200);
  const { id: assignmentId } = (await assignment.json()) as { id: string };
  const saved = await request.post(`${origin}/saveRollover`, {
    headers: admin,
    data: { ...query, expectedRevision: 0, plan },
  });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toEqual({ revision: 1 });
  expect(
    (
      await request.post(`${origin}/saveRollover`, {
        headers: admin,
        data: { ...query, expectedRevision: 0, plan },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post(`${origin}/applyRollover`, {
        headers: admin,
        data: { ...query, expectedRevision: 5 },
      })
    ).status(),
  ).toBe(409);

  const [first, again] = await Promise.all([
    request.post(`${origin}/applyRollover`, {
      headers: admin,
      data: { ...query, expectedRevision: 1 },
    }),
    request.post(`${origin}/applyRollover`, {
      headers: admin,
      data: { ...query, expectedRevision: 1 },
    }),
  ]);
  expect([first.status(), again.status()]).toEqual([200, 200]);
  const result = (await first.json()) as {
    classes: { key: string; classId: string; name: string }[];
    enrolled: number;
    withdrawn: number;
  };
  expect(await again.json()).toEqual(result);
  expect(result).toMatchObject({ enrolled: 2, withdrawn: 1 });
  expect(result.classes.map((row) => row.name).toSorted()).toEqual(
    [`P2-A ${from.yearName}`, `P2-B ${from.yearName}`].toSorted(),
  );
  const newA = result.classes.find((row) => row.key === rowA.key)?.classId;
  const newB = result.classes.find((row) => row.key === rowB.key)?.classId;
  if (!newA || !newB) throw new Error("Missing created classes");

  const createdA = (await (
    await request.post(`${origin}/getClass`, {
      headers: admin,
      data: { id: newA },
    })
  ).json()) as {
    homeroomTeacher: { id: string } | null;
    subjects: { teacher: { id: string } | null }[];
    schoolYear: string | null;
  };
  expect(createdA.homeroomTeacher?.id).toBe(from.homeroomId);
  expect(createdA.subjects).toHaveLength(2);
  expect(createdA.schoolYear).toBe(target.name);
  const recorded = await request.post(`${origin}/getAssignmentDetail`, {
    headers: admin,
    data: { id: assignmentId },
  });
  expect(recorded.status()).toBe(200);
  expect(await recorded.json()).toMatchObject({
    class: { id: from.classA.id },
  });

  const dayAfter = new Date(`${from.endsOn}T00:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  const ended = dayAfter.toISOString().slice(0, 10);
  const promoted = await history(request, admin, from.students.promoted.id);
  expect(promoted).toContainEqual(
    expect.objectContaining({ classId: from.classA.id, until: ended }),
  );
  expect(promoted).toContainEqual(
    expect.objectContaining({
      classId: newA,
      since: "2051-09-01",
      until: null,
    }),
  );
  const repeating = await history(request, admin, from.students.repeating.id);
  expect(repeating).toContainEqual(
    expect.objectContaining({ classId: newB, since: "2051-09-01" }),
  );
  const leaving = await history(request, admin, from.students.leaving.id);
  expect(leaving).toHaveLength(1);
  expect(leaving[0]).toMatchObject({ classId: from.classB.id, until: ended });

  const reread = (await (
    await request.post(`${origin}/getRollover`, { headers: admin, data: query })
  ).json()) as { status: string; result: unknown };
  expect(reread).toMatchObject({ status: "applied", result });
  const afterApply = await request.post(`${origin}/saveRollover`, {
    headers: admin,
    data: { ...query, expectedRevision: 1, plan },
  });
  expect(afterApply.status()).toBe(409);
  expect(((await afterApply.json()) as { message: string }).message).toBe(
    "rollover.applied",
  );

  const overlapping = await targetYear(
    request,
    admin,
    from.endsOn,
    "2053-06-30",
  );
  const blocked = (await (
    await request.post(`${origin}/getRollover`, {
      headers: admin,
      data: { sourceYearId: from.yearId, targetYearId: overlapping.id },
    })
  ).json()) as { issue: string | null };
  expect(blocked.issue).toBe("rollover.overlap");
});

test("administrators review and apply a rollover from the year directory", async ({
  page,
  request,
}, testInfo) => {
  const admin = await signIn(request, "admin@example.com");
  const from = source();
  const target = await targetYear(request, admin, "2054-09-01", "2055-06-30");

  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
  await page.goto(`/admin/rollover?source=${from.yearId}&target=${target.id}`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Roll over into ${target.name}`,
    }),
  ).toBeVisible();
  const classA = page.getByRole("group", {
    name: `Continue ${from.classA.name}`,
  });
  await classA.getByLabel("Class name").fill(`P2-A ${from.yearName}`);
  await page
    .getByRole("combobox", {
      name: `Decision for ${from.students.leaving.name}`,
    })
    .click();
  await page.getByRole("option", { name: "Withdraw", exact: true }).click();
  await expect(page.getByText("Leaves at the end of this year.")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("rollover-plan.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByText("Changes saved").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Apply rollover", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Apply rollover", exact: true })
    .click();
  await expect(
    page.getByText(
      `Applied from ${from.yearName}: 2 classes, 2 students placed, 1 withdrawn.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `P2-A ${from.yearName}` }),
  ).toBeVisible();
});
