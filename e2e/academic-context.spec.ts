import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "@playwright/test";

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

async function classes(
  request: APIRequestContext,
  admin: { authorization: string },
) {
  const sara = (await (
    await request.post(`${origin}/getAllUsers`, {
      headers: admin,
      data: { role: "teacher", q: "sara@example.com" },
    })
  ).json()) as { rows: { id: string }[] };
  const subjects = (await (
    await request.post(`${origin}/getSubjects`, { headers: admin })
  ).json()) as { id: string }[];
  const teacherId = sara.rows[0]?.id;
  const subjectId = subjects[0]?.id;
  if (!teacherId || !subjectId)
    throw new Error("Missing seeded teacher or subject");

  return {
    subjectId,
    create: async (name: string) => {
      const response = await request.post(`${origin}/saveClass`, {
        headers: admin,
        data: {
          name,
          grade: "P3",
          stage: "primary",
          room: "",
          homeroomTeacherId: "",
          subjects: [{ subjectId, teacherId }],
        },
      });
      expect(response.status()).toBe(200);
      return ((await response.json()) as { id: string }).id;
    },
  };
}

test("a notification about an assignment still opens it after the student moves to another class", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  const admin = await signIn(request, "admin@example.com");
  const { subjectId, create: createClass } = await classes(request, admin);
  const first = await createClass(`Salama first ${suffix}`);
  const second = await createClass(`Salama second ${suffix}`);

  const account = await request.post(`${origin}/saveUser`, {
    headers: admin,
    data: {
      name: `Salama Pupil ${suffix}`,
      email: `pupil-${suffix}@example.com`,
      role: "student",
      title: "",
      mobile: "",
      password: "pupil-passphrase-2026",
      isActive: true,
    },
  });
  expect(account.status()).toBe(200);
  const { id: userId } = (await account.json()) as { id: string };
  const student = {
    reference: `PU-${suffix}`,
    firstName: "Salama",
    lastName: `Pupil ${suffix}`,
    classId: first,
    userId,
  };
  const placed = await request.post(`${origin}/saveStudent`, {
    headers: admin,
    data: student,
  });
  expect(placed.status()).toBe(200);
  const { id: studentId } = (await placed.json()) as { id: string };

  const { today } = (await (
    await request.post(`${origin}/getAdminOverview`, { headers: admin })
  ).json()) as { today: string };
  const assignment = await request.post(`${origin}/createAssignment`, {
    headers: admin,
    data: {
      classId: first,
      subjectId,
      title: `Salama pupil task ${suffix}`,
      description: "Read the first chapter.",
      dueDate: today,
      maxScore: 10,
    },
  });
  expect(assignment.status()).toBe(200);
  const { id: assignmentId } = (await assignment.json()) as { id: string };

  const moved = await request.post(`${origin}/saveStudent`, {
    headers: admin,
    data: { ...student, id: studentId, classId: second },
  });
  expect(moved.status()).toBe(200);

  const pupil = await signIn(
    request,
    `pupil-${suffix}@example.com`,
    "pupil-passphrase-2026",
  );
  const notifications = (await (
    await request.post(`${origin}/getNotifications`, {
      headers: pupil,
      data: { page: 1 },
    })
  ).json()) as { rows: { path: string | null }[] };
  expect(
    notifications.rows.some((row) => row.path?.includes(assignmentId)),
  ).toBe(true);
  const opened = await request.post(`${origin}/getLearnerAssignment`, {
    headers: pupil,
    data: { id: assignmentId },
  });
  expect(opened.status()).toBe(200);
  expect(await opened.json()).toMatchObject({
    class: { id: first },
    title: `Salama pupil task ${suffix}`,
  });
});

test("a backdated move cannot reach over a register already taken", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  const admin = await signIn(request, "admin@example.com");
  const { create: createClass } = await classes(request, admin);
  const first = await createClass(`Salama registered ${suffix}`);
  const second = await createClass(`Salama moved ${suffix}`);
  const { today } = (await (
    await request.post(`${origin}/getAdminOverview`, { headers: admin })
  ).json()) as { today: string };
  const daysAgo = (days: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };

  const student = {
    reference: `RG-${suffix}`,
    firstName: "Salama",
    lastName: `Register ${suffix}`,
    classId: first,
    effectiveOn: daysAgo(3),
  };
  const placed = await request.post(`${origin}/saveStudent`, {
    headers: admin,
    data: student,
  });
  expect(placed.status()).toBe(200);
  const { id: studentId } = (await placed.json()) as { id: string };
  const taken = await request.post(`${origin}/saveAttendance`, {
    headers: admin,
    data: {
      classId: first,
      date: daysAgo(2),
      entries: [{ studentId, status: "present" }],
    },
  });
  expect(taken.status()).toBe(200);

  const register = async (classId: string, date: string) => {
    const response = await request.post(`${origin}/getAttendanceRegister`, {
      headers: admin,
      data: { classId, date },
    });
    expect(response.status()).toBe(200);
    return (await response.json()) as {
      roster: { id: string }[];
      marks: { studentId: string; classId: string }[];
    };
  };

  const refusals = await Promise.all(
    [daysAgo(3), daysAgo(2)].map(async (effectiveOn) => {
      const response = await request.post(`${origin}/saveStudent`, {
        headers: admin,
        data: { ...student, id: studentId, classId: second, effectiveOn },
      });
      return {
        status: response.status(),
        message: ((await response.json()) as { message: string }).message,
      };
    }),
  );
  const refusal = {
    status: 409,
    message: `management.move_date_registers:${daysAgo(2)}`,
  };
  expect(refusals).toEqual([refusal, refusal]);
  const unchanged = await register(first, daysAgo(2));
  expect(unchanged.roster.map((row) => row.id)).toContain(studentId);
  expect(unchanged.marks).toContainEqual(
    expect.objectContaining({ studentId, classId: first }),
  );

  const moved = await request.post(`${origin}/saveStudent`, {
    headers: admin,
    data: {
      ...student,
      id: studentId,
      classId: second,
      effectiveOn: daysAgo(1),
    },
  });
  expect(moved.status()).toBe(200);
  expect(
    (await register(first, daysAgo(2))).roster.map((row) => row.id),
  ).toContain(studentId);
  expect(
    (await register(second, daysAgo(2))).roster.map((row) => row.id),
  ).not.toContain(studentId);
  expect(
    (await register(second, daysAgo(1))).roster.map((row) => row.id),
  ).toContain(studentId);
});
