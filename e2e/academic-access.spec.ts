import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3001/v1";

test("subject responsibilities isolate authoring, submissions and grading within one class", async ({
  request,
}) => {
  const unique = crypto.randomUUID().slice(0, 8);
  const signIn = async (email: string, password: string) => {
    const response = await request.post(`${origin}/auth/signIn`, {
      data: { school: "northwind", email, password },
    });
    expect(response.status()).toBe(200);
    const { token } = (await response.json()) as { token: string };
    return { authorization: `Bearer ${token}` };
  };
  const admin = await signIn("admin@example.com", "northwind1234");
  const createAccount = async (suffix: string, role: "teacher" | "student") => {
    const email = `salama-${unique}-${suffix}@example.com`;
    const response = await request.post(`${origin}/saveUser`, {
      headers: admin,
      data: {
        name: `Salama Ashoush ${suffix}`,
        email,
        role,
        password: "school-account-2026",
        isActive: true,
      },
    });
    expect(response.status()).toBe(200);
    const { id } = (await response.json()) as { id: string };
    return { id, headers: await signIn(email, "school-account-2026") };
  };
  const first = await createAccount("first", "teacher");
  const second = await createAccount("second", "teacher");
  const learner = await createAccount("learner", "student");
  const subjectResponse = await request.post(`${origin}/getManagementOptions`, {
    headers: admin,
    data: { kind: "subjects" },
  });
  expect(subjectResponse.status()).toBe(200);
  const [firstSubject, secondSubject] = (await subjectResponse.json()) as {
    id: string;
  }[];
  if (!firstSubject || !secondSubject)
    throw new Error(
      "Two subjects are required for the teaching responsibility test",
    );
  const classInput = {
    name: `Scope ${unique}`,
    grade: "P1",
    stage: "primary",
    room: "",
    homeroomTeacherId: first.id,
    subjects: [
      { subjectId: firstSubject.id, teacherId: first.id },
      { subjectId: secondSubject.id, teacherId: second.id },
    ],
  };
  const classResponse = await request.post(`${origin}/saveClass`, {
    headers: admin,
    data: classInput,
  });
  expect(classResponse.status()).toBe(200);
  const { id: classId } = (await classResponse.json()) as { id: string };
  const studentResponse = await request.post(`${origin}/saveStudent`, {
    headers: admin,
    data: {
      firstName: "Salama",
      lastName: "Ashoush",
      reference: `S-${unique}`,
      classId,
      userId: learner.id,
      guardianIds: [],
    },
  });
  expect(studentResponse.status()).toBe(200);
  const { id: studentId } = (await studentResponse.json()) as { id: string };
  const meResponse = await request.post(`${origin}/getStudentOverview`, {
    headers: learner.headers,
  });
  expect(meResponse.status()).toBe(200);
  const { today } = (await meResponse.json()) as { today: string };

  const classesResponse = await request.post(`${origin}/getMyClasses`, {
    headers: first.headers,
  });
  expect(classesResponse.status()).toBe(200);
  const classes = (await classesResponse.json()) as {
    id: string;
    authoringSubjects: { id: string }[];
  }[];
  expect(
    classes
      .find((row) => row.id === classId)
      ?.authoringSubjects.map((subject) => subject.id),
  ).toEqual([firstSubject.id]);
  const assignment = {
    classId,
    subjectId: secondSubject.id,
    title: `Subject work ${unique}`,
    description: "Explain the solution.",
    dueDate: today,
    maxScore: 10,
  };
  const forbiddenAuthor = await request.post(`${origin}/createAssignment`, {
    headers: first.headers,
    data: assignment,
  });
  expect(forbiddenAuthor.status()).toBe(403);
  const created = await request.post(`${origin}/createAssignment`, {
    headers: second.headers,
    data: assignment,
  });
  expect(created.status()).toBe(200);
  const { id: assignmentId } = (await created.json()) as { id: string };
  const submitted = await request.post(`${origin}/submitAssignment`, {
    headers: learner.headers,
    data: { assignmentId, content: "Private student reasoning" },
  });
  expect(submitted.status()).toBe(200);
  const queueResponse = await request.post(`${origin}/getGradingQueue`, {
    headers: second.headers,
  });
  expect(queueResponse.status()).toBe(200);
  const queue = (await queueResponse.json()) as {
    id: string;
    assignment: { id: string };
  }[];
  const submission = queue.find((row) => row.assignment.id === assignmentId);
  if (!submission)
    throw new Error("The assigned teacher must receive the submission");

  const wrongQueue = await request.post(`${origin}/getGradingQueue`, {
    headers: first.headers,
  });
  expect(wrongQueue.status()).toBe(200);
  expect(await wrongQueue.json()).toEqual([]);
  const wrongDetail = await request.post(`${origin}/getAssignmentDetail`, {
    headers: first.headers,
    data: { id: assignmentId },
  });
  expect(wrongDetail.status()).toBe(200);
  expect(await wrongDetail.json()).toMatchObject({
    id: assignmentId,
    submissions: [],
  });
  const wrongList = await request.post(`${origin}/getClassAssignments`, {
    headers: first.headers,
    data: { classId },
  });
  expect(wrongList.status()).toBe(200);
  const list = (await wrongList.json()) as {
    rows: { id: string; submissions: unknown[] }[];
  };
  expect(list.rows.find((row) => row.id === assignmentId)?.submissions).toEqual(
    [],
  );
  const wrongOverview = await request.post(`${origin}/getTeachingOverview`, {
    headers: first.headers,
  });
  expect(wrongOverview.status()).toBe(200);
  expect(await wrongOverview.json()).toMatchObject({ queue: [] });
  const forbiddenGrade = await request.post(`${origin}/submitGrade`, {
    headers: first.headers,
    data: { submissionId: submission.id, score: 8 },
  });
  expect(forbiddenGrade.status()).toBe(404);

  const reassigned = await request.post(`${origin}/saveClass`, {
    headers: admin,
    data: {
      ...classInput,
      id: classId,
      subjects: classInput.subjects.map((subject) => ({
        ...subject,
        teacherId: first.id,
      })),
    },
  });
  expect(reassigned.status()).toBe(200);
  const revoked = await request.post(`${origin}/submitGrade`, {
    headers: second.headers,
    data: { submissionId: submission.id, score: 8 },
  });
  expect(revoked.status()).toBe(404);
  const graded = await request.post(`${origin}/submitGrade`, {
    headers: first.headers,
    data: {
      submissionId: submission.id,
      score: 9,
      feedback: "Clear reasoning",
    },
  });
  expect(graded.status()).toBe(200);
  const result = await request.post(`${origin}/getAssignmentDetail`, {
    headers: learner.headers,
    data: { id: assignmentId },
  });
  expect(await result.json()).toMatchObject({
    submissions: [{ score: 9, gradedById: first.id, state: "returned" }],
  });

  const nextClass = await request.post(`${origin}/saveClass`, {
    headers: admin,
    data: {
      name: `Next ${unique}`,
      grade: "P1",
      stage: "primary",
      homeroomTeacherId: second.id,
      subjects: [],
    },
  });
  expect(nextClass.status()).toBe(200);
  const { id: nextClassId } = (await nextClass.json()) as { id: string };
  const transferred = await request.post(`${origin}/saveStudent`, {
    headers: admin,
    data: {
      id: studentId,
      firstName: "Salama",
      lastName: "Ashoush",
      reference: `S-${unique}`,
      classId: nextClassId,
      userId: learner.id,
      guardianIds: [],
    },
  });
  expect(transferred.status()).toBe(200);
  const oldTeacherProfile = await request.post(`${origin}/getStudent`, {
    headers: first.headers,
    data: { studentId },
  });
  expect(oldTeacherProfile.status()).toBe(403);
  const nextTeacherProfile = await request.post(`${origin}/getStudent`, {
    headers: second.headers,
    data: { studentId },
  });
  expect(nextTeacherProfile.status()).toBe(200);
  const currentWork = await request.post(`${origin}/getAssignments`, {
    headers: learner.headers,
    data: { studentId },
  });
  expect(currentWork.status()).toBe(200);
  expect(await currentWork.json()).toMatchObject({ rows: [] });
  const history = await request.post(`${origin}/getAssignmentDetail`, {
    headers: learner.headers,
    data: { id: assignmentId },
  });
  expect(history.status()).toBe(200);
  expect(await history.json()).toMatchObject({
    submissions: [{ score: 9, content: "Private student reasoning" }],
  });
});
