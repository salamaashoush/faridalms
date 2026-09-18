import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3001";

async function signIn(
  request: APIRequestContext,
  school: string,
  email = "admin@example.com",
) {
  const response = await request.post(`${origin}/v1/auth/signIn`, {
    data: { school, email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
}

test("native clients authenticate without browser cookies and can revoke sessions", async ({
  request,
}) => {
  const headers = await signIn(request, "northwind");
  const profile = await request.post(`${origin}/v1/auth/currentUser`, {
    headers,
  });
  expect(profile.status()).toBe(200);
  expect(await profile.json()).toMatchObject({
    school: { slug: "northwind" },
    role: "admin",
  });
  const logout = await request.post(`${origin}/v1/auth/signOut`, { headers });
  expect(logout.status()).toBe(200);
  const revoked = await request.post(`${origin}/v1/auth/currentUser`, {
    headers,
  });
  expect(revoked.status()).toBe(401);
});

test("concurrent school sessions cannot override each other's database context", async ({
  request,
}) => {
  const [northwind, acme] = await Promise.all([
    signIn(request, "northwind"),
    signIn(request, "acme"),
  ]);
  const responses = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      request.post(`${origin}/v1/auth/currentUser`, {
        headers: {
          ...(index % 2 === 0 ? northwind : acme),
          "x-school-id": index % 2 === 0 ? "acme" : "northwind",
        },
      }),
    ),
  );
  for (const [index, response] of responses.entries()) {
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      school: { slug: index % 2 === 0 ? "northwind" : "acme" },
    });
  }
});

test("parents cannot enumerate a school directory", async ({ request }) => {
  const headers = await signIn(request, "northwind", "parent@example.com");
  const response = await request.post(`${origin}/v1/getAllStudents`, {
    headers,
    data: {},
  });
  expect(response.status()).toBe(403);
});

test("directory pages are bounded, stable and searchable", async ({
  request,
}) => {
  const headers = await signIn(request, "northwind");
  const first = await request.post(`${origin}/v1/getAllStudents`, {
    headers,
    data: { pageSize: 25, page: 1 },
  });
  expect(first.status()).toBe(200);
  const data = (await first.json()) as {
    rows: { id: string; fullName: string }[];
    total: number;
    pages: number;
  };
  expect(data.rows.length).toBeLessThanOrEqual(25);
  expect(data.total).toBeGreaterThan(0);
  const invalid = await request.post(`${origin}/v1/getAllStudents`, {
    headers,
    data: { pageSize: 100000 },
  });
  expect(invalid.status()).toBe(400);
  const search = await request.post(`${origin}/v1/getAllStudents`, {
    headers,
    data: { q: "no-such-student-7f1490" },
  });
  expect(await search.json()).toMatchObject({ rows: [], total: 0 });
});

test("an invalid attendance batch writes no records", async ({ request }) => {
  const headers = await signIn(request, "northwind", "teacher@example.com");
  const response = await request.post(`${origin}/v1/getAttendanceRegister`, {
    headers,
    data: {},
  });
  const register = (await response.json()) as {
    classId: string;
    date: string;
    marks: unknown[];
  };
  const mutation = await request.post(`${origin}/v1/saveAttendance`, {
    headers,
    data: {
      classId: register.classId,
      date: register.date,
      entries: [
        {
          studentId: "00000000-0000-4000-8000-000000000000",
          status: "present",
        },
      ],
    },
  });
  expect(mutation.status()).toBe(403);
  const after = await request.post(`${origin}/v1/getAttendanceRegister`, {
    headers,
    data: { classId: register.classId, date: register.date },
  });
  expect(((await after.json()) as { marks: unknown[] }).marks).toEqual(
    register.marks,
  );
});

test("the API exposes a machine-readable contract and request IDs", async ({
  request,
}) => {
  const response = await request.get(`${origin}/openapi.json`);
  expect(response.status()).toBe(200);
  expect(response.headers()["x-request-id"]).toBeTruthy();
  expect(await response.json()).toMatchObject({
    info: { title: "Farida LMS API" },
  });
});

test("coursework is authored, submitted with content and returned with feedback", async ({
  request,
}) => {
  const [teacher, student] = await Promise.all([
    signIn(request, "northwind", "sara@example.com"),
    signIn(request, "northwind", "omar@example.com"),
  ]);
  const overviewResponse = await request.post(
    `${origin}/v1/getStudentOverview`,
    { headers: student },
  );
  const overview = (await overviewResponse.json()) as {
    today: string;
    student: { classId: string };
  };
  const classesResponse = await request.post(`${origin}/v1/getMyClasses`, {
    headers: teacher,
  });
  const classes = (await classesResponse.json()) as {
    id: string;
    subjects: { id: string }[];
  }[];
  const taught = classes.find((row) => row.id === overview.student.classId);
  expect(taught?.subjects[0]).toBeTruthy();
  if (!taught?.subjects[0])
    throw new Error(
      "Seed must give Salama's teaching account a subject in the student's class",
    );
  const title = `Salama Ashoush coursework ${crypto.randomUUID()}`;
  const created = await request.post(`${origin}/v1/createAssignment`, {
    headers: teacher,
    data: {
      classId: taught.id,
      subjectId: taught.subjects[0].id,
      title,
      description: "Explain your reasoning.",
      dueDate: overview.today,
      maxScore: 10,
    },
  });
  expect(created.status()).toBe(200);
  const { id } = (await created.json()) as { id: string };
  const submitted = await request.post(`${origin}/v1/submitAssignment`, {
    headers: student,
    data: { assignmentId: id, content: "My reasoning is recorded here." },
  });
  expect(submitted.status()).toBe(200);
  const queueResponse = await request.post(`${origin}/v1/getGradingQueue`, {
    headers: teacher,
  });
  const queue = (await queueResponse.json()) as {
    id: string;
    content: string;
    assignment: { id: string };
  }[];
  const submission = queue.find((row) => row.assignment.id === id);
  expect(submission?.content).toBe("My reasoning is recorded here.");
  if (!submission) throw new Error("Submission must be in the grading queue");
  const excessive = await request.post(`${origin}/v1/submitGrade`, {
    headers: teacher,
    data: { submissionId: submission.id, score: 11 },
  });
  expect(excessive.status()).toBe(400);
  const graded = await request.post(`${origin}/v1/submitGrade`, {
    headers: teacher,
    data: {
      submissionId: submission.id,
      score: 9,
      feedback: "Clear reasoning.",
    },
  });
  expect(graded.status()).toBe(200);
  const detail = await request.post(`${origin}/v1/getAssignmentDetail`, {
    headers: student,
    data: { id },
  });
  expect(await detail.json()).toMatchObject({
    submissions: [
      {
        content: "My reasoning is recorded here.",
        state: "returned",
        score: 9,
        feedback: "Clear reasoning.",
      },
    ],
  });
  const overwrite = await request.post(`${origin}/v1/submitAssignment`, {
    headers: student,
    data: { assignmentId: id, content: "Attempt to overwrite graded work" },
  });
  expect(overwrite.status()).toBe(409);
  const otherSchool = await signIn(request, "acme");
  const isolated = await request.post(`${origin}/v1/getAssignmentDetail`, {
    headers: otherSchool,
    data: { id },
  });
  expect(isolated.status()).toBe(404);
});

test("administrative writes reject family accounts and cross-school references", async ({
  request,
}) => {
  const parent = await signIn(request, "northwind", "parent@example.com");
  const denied = await request.post(`${origin}/v1/saveUser`, {
    headers: parent,
    data: {
      name: "Salama Ashoush",
      email: `salama-${crypto.randomUUID()}@example.com`,
      role: "admin",
      password: "a-long-school-password",
      isActive: true,
    },
  });
  expect(denied.status()).toBe(403);
  const [northwind, acme] = await Promise.all([
    signIn(request, "northwind"),
    signIn(request, "acme"),
  ]);
  const classes = await request.post(`${origin}/v1/getManagementOptions`, {
    headers: acme,
    data: { kind: "classes", q: "" },
  });
  const rows = (await classes.json()) as { id: string }[];
  expect(rows[0]).toBeTruthy();
  const invalid = await request.post(`${origin}/v1/saveStudent`, {
    headers: northwind,
    data: {
      reference: `TEST-${crypto.randomUUID().slice(0, 8)}`,
      firstName: "Salama",
      lastName: "Ashoush",
      classId: rows[0]?.id,
    },
  });
  expect(invalid.status()).toBe(400);
});

test("teachers message linked families and replies stay private", async ({
  request,
  page,
}) => {
  const [teacher, parent, student] = await Promise.all([
    signIn(request, "northwind", "teacher@example.com"),
    signIn(request, "northwind", "parent@example.com"),
    signIn(request, "northwind", "omar@example.com"),
  ]);
  const recipientsResponse = await request.post(`${origin}/v1/getRecipients`, {
    headers: teacher,
    data: { category: "parents", q: "" },
  });
  expect(recipientsResponse.status()).toBe(200);
  const { rows: recipients } = (await recipientsResponse.json()) as {
    rows: { id: string }[];
  };
  const profile = await request.post(`${origin}/v1/auth/currentUser`, {
    headers: parent,
  });
  const parentId = ((await profile.json()) as { id: string }).id;
  expect(recipients.some((row) => row.id === parentId)).toBe(true);
  const subject = `Salama family conversation ${crypto.randomUUID()}`;
  const sent = await request.post(`${origin}/v1/sendMessage`, {
    headers: teacher,
    data: {
      category: "parents",
      recipientId: parentId,
      subject,
      body: "Let us discuss the next learning steps.",
    },
  });
  expect(sent.status()).toBe(200);
  const { id } = (await sent.json()) as { id: string };
  const reply = await request.post(`${origin}/v1/replyMessage`, {
    headers: parent,
    data: { id, body: "Thank you. I would like to arrange a meeting." },
  });
  expect(reply.status()).toBe(200);
  const thread = await request.post(`${origin}/v1/getMessage`, {
    headers: teacher,
    data: { id },
  });
  expect(await thread.json()).toMatchObject({
    subject,
    replies: [{ body: "Thank you. I would like to arrange a meeting." }],
  });
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("parent@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
  await page.goto(`/family/messages?message=${id}`);
  const composer = page.getByRole("textbox", {
    name: "Your reply",
    exact: true,
  });
  await expect(composer).toBeEditable();
  await composer.click();
  await page.keyboard.type("Salama learning plan");
  await composer.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(composer.locator("strong")).toHaveText("Salama learning plan");
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.locator("article ol strong")).toHaveText(
    "Salama learning plan",
  );
  await expect(page).toHaveURL(new RegExp(`message=${id}`));
  await expect(composer).toHaveText("");
  await page.reload();
  await expect(page.locator("article ol strong")).toHaveText(
    "Salama learning plan",
  );
  const unrelated = await request.post(`${origin}/v1/getMessage`, {
    headers: student,
    data: { id },
  });
  expect(unrelated.status()).toBe(404);
  const forbiddenReply = await request.post(`${origin}/v1/replyMessage`, {
    headers: student,
    data: { id, body: "This is not my conversation." },
  });
  expect(forbiddenReply.status()).toBe(404);
  const parentDirectory = await request.post(`${origin}/v1/getRecipients`, {
    headers: parent,
    data: { category: "parents", q: "" },
  });
  expect(parentDirectory.status()).toBe(403);
});

test("calendar revisions reject stale updates without losing the saved event", async ({
  request,
}) => {
  const headers = await signIn(request, "northwind");
  const input = {
    title: "Salama calendar revision",
    description: "Initial details",
    category: "general",
    startsOn: "2026-10-12",
    endsOn: "2026-10-12",
    provisional: false,
  };
  const created = await request.post(`${origin}/v1/saveCalendarEvent`, {
    headers,
    data: input,
  });
  expect(created.status()).toBe(200);
  const event = (await created.json()) as { id: string; revision: number };
  const saved = await request.post(`${origin}/v1/saveCalendarEvent`, {
    headers,
    data: {
      ...input,
      id: event.id,
      expectedRevision: event.revision,
      title: "Saved revision",
    },
  });
  expect(saved.status()).toBe(200);
  const stale = await request.post(`${origin}/v1/saveCalendarEvent`, {
    headers,
    data: {
      ...input,
      id: event.id,
      expectedRevision: event.revision,
      title: "Stale revision",
    },
  });
  expect(stale.status()).toBe(409);
  const calendar = await request.post(`${origin}/v1/getCalendar`, {
    headers,
    data: { month: "2026-10" },
  });
  const data = (await calendar.json()) as {
    allEvents: { id: string; title: string }[];
  };
  expect(data.allEvents.find((row) => row.id === event.id)?.title).toBe(
    "Saved revision",
  );
});

test("shared student records protect medical fields and family class rosters", async ({
  request,
}) => {
  const parent = await signIn(request, "northwind", "parent@example.com");
  const teacher = await signIn(request, "northwind", "teacher@example.com");
  const parentStudentsResponse = await request.post(
    `${origin}/v1/getVisibleStudents`,
    { headers: parent },
  );
  expect(parentStudentsResponse.status()).toBe(200);
  const parentStudents = (await parentStudentsResponse.json()) as {
    id: string;
    classId: string;
  }[];
  const child = parentStudents.find((student) => student.classId);
  expect(child).toBeDefined();
  if (!child) throw new Error("Missing seeded child");
  const familyProfile = await request.post(`${origin}/v1/getStudent`, {
    headers: parent,
    data: { studentId: child.id },
  });
  expect(familyProfile.status()).toBe(200);
  expect(await familyProfile.json()).toMatchObject({
    access: { contacts: true, medical: true, manage: false },
  });
  const familyClass = await request.post(`${origin}/v1/getClass`, {
    headers: parent,
    data: { id: child.classId },
  });
  expect(familyClass.status()).toBe(200);
  const classData = (await familyClass.json()) as {
    roster: { id: string }[];
    canManage: boolean;
  };
  expect(classData.canManage).toBe(false);
  expect(classData.roster.length).toBeGreaterThan(0);
  expect(
    classData.roster.every((student) =>
      parentStudents.some((own) => own.id === student.id),
    ),
  ).toBe(true);
  const teacherClassesResponse = await request.post(
    `${origin}/v1/getMyClasses`,
    { headers: teacher },
  );
  expect(teacherClassesResponse.status()).toBe(200);
  const teacherClasses = (await teacherClassesResponse.json()) as {
    id: string;
  }[];
  const taught = teacherClasses[0];
  if (!taught) throw new Error("Missing seeded teaching assignment");
  const rosterResponse = await request.post(`${origin}/v1/getClass`, {
    headers: teacher,
    data: { id: taught.id },
  });
  expect(rosterResponse.status()).toBe(200);
  const roster = (await rosterResponse.json()) as { roster: { id: string }[] };
  const learner = roster.roster[0];
  if (!learner) throw new Error("Missing seeded learner");
  const teacherProfile = await request.post(`${origin}/v1/getStudent`, {
    headers: teacher,
    data: { studentId: learner.id },
  });
  expect(teacherProfile.status()).toBe(200);
  expect(await teacherProfile.json()).toMatchObject({
    access: { medical: false, manage: false },
    profile: { medical: null, medicalReports: [] },
  });
});
