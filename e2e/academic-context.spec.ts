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

test("a notification about an assignment still opens it after the student moves to another class", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  const admin = await signIn(request, "admin@example.com");
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

  const createClass = async (name: string) => {
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
  };
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
