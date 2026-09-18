import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3001";

async function signIn(
  request: APIRequestContext,
  school: string,
  email: string,
) {
  const response = await request.post(`${origin}/v1/auth/signIn`, {
    data: { school, email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
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

const paragraph = (text: string) => ({
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: null,
    children: [
      {
        type: "paragraph",
        format: "",
        indent: 0,
        version: 1,
        direction: null,
        textStyle: "",
        textFormat: 0,
        children: [
          {
            type: "text",
            text,
            format: 0,
            style: "",
            mode: "normal",
            detail: 0,
            version: 1,
          },
        ],
      },
    ],
  },
});

/** A published module with one quiz lesson, built by the P1 teacher for the run. */
async function publishModule(
  request: APIRequestContext,
  teacher: Record<string, string>,
  suffix: string,
) {
  const contextResponse = await request.post(
    `${origin}/v1/getAuthoringContext`,
    { headers: teacher, data: { classId: "" } },
  );
  expect(contextResponse.status()).toBe(200);
  const context = (await contextResponse.json()) as {
    classes: { id: string; authoringSubjects: { id: string }[] }[];
  };
  const schoolClass = context.classes[0];
  const subject = schoolClass?.authoringSubjects[0];
  if (!schoolClass || !subject) throw new Error("Missing taught subject");
  const moduleId = crypto.randomUUID();
  const created = await request.post(`${origin}/v1/saveModule`, {
    headers: teacher,
    data: {
      id: moduleId,
      expectedRevision: 0,
      classId: schoolClass.id,
      subjectId: subject.id,
      title: `Rivers ${suffix}`,
      summary: "Where water goes.",
    },
  });
  expect(created.status()).toBe(200);
  const right = crypto.randomUUID();
  const wrong = crypto.randomUUID();
  const quizId = crypto.randomUUID();
  const lessonId = crypto.randomUUID();
  const lesson = await request.post(`${origin}/v1/saveLesson`, {
    headers: teacher,
    data: {
      id: lessonId,
      moduleId,
      expectedRevision: 0,
      title: "Where rivers start",
      position: 0,
      document: {
        version: 1,
        blocks: [
          {
            id: crypto.randomUUID(),
            type: "content",
            content: paragraph("Rivers begin in hills and flow to the sea."),
          },
          {
            id: quizId,
            type: "quiz",
            question: "Where does a river usually begin?",
            options: [
              { id: right, text: "In the hills" },
              { id: wrong, text: "In the sea" },
            ],
            correctOptionIds: [right],
            explanation: "Rain falls on high ground and runs downhill.",
          },
        ],
      },
    },
  });
  expect(lesson.status()).toBe(200);
  const published = await request.post(`${origin}/v1/publishModule`, {
    headers: teacher,
    data: { id: moduleId, expectedRevision: 1 },
  });
  expect(published.status()).toBe(200);
  return {
    moduleId,
    lessonId,
    quizId,
    right,
    wrong,
    classId: schoolClass.id,
    subjectId: subject.id,
  };
}

test("modules reach only their class, hide answer keys until answered and track progress", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const teacher = await signIn(request, "northwind", "sara@example.com");
  const other = await signIn(request, "northwind", "teacher@example.com");
  const learner = await signIn(request, "northwind", "omar@example.com");
  const parent = await signIn(request, "northwind", "parent@example.com");
  const foreign = await signIn(request, "acme", "admin@example.com");

  const built = await publishModule(request, teacher, suffix);
  expect(
    (
      await request.post(`${origin}/v1/saveModule`, {
        headers: other,
        data: {
          id: crypto.randomUUID(),
          expectedRevision: 0,
          classId: built.classId,
          subjectId: built.subjectId,
          title: "Not my class",
          summary: "",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`${origin}/v1/getModuleAuthoring`, {
        headers: foreign,
        data: { id: built.moduleId },
      })
    ).status(),
  ).toBe(404);

  const listed = await request.post(`${origin}/v1/getLearnerModules`, {
    headers: learner,
    data: { studentId: "" },
  });
  expect(listed.status()).toBe(200);
  const rows = (await listed.json()) as {
    studentId: string;
    rows: { id: string; lessonsTotal: number; lessonsCompleted: number }[];
  };
  expect(rows.rows).toContainEqual(
    expect.objectContaining({
      id: built.moduleId,
      lessonsTotal: 1,
      lessonsCompleted: 0,
    }),
  );
  const asOther = await request.post(`${origin}/v1/getLearnerModules`, {
    headers: other,
    data: { studentId: rows.studentId },
  });
  expect(asOther.status()).toBe(403);

  const before = await request.post(`${origin}/v1/getLearnerLesson`, {
    headers: learner,
    data: { id: built.lessonId, studentId: "" },
  });
  expect(before.status()).toBe(200);
  const hidden = (await before.json()) as {
    canWork: boolean;
    lesson: {
      blocks: { type: string; correctOptionIds?: string[] }[];
      canComplete: boolean;
    };
  };
  expect(hidden.canWork).toBe(true);
  expect(hidden.lesson.canComplete).toBe(false);
  expect(
    hidden.lesson.blocks.find((block) => block.type === "quiz")
      ?.correctOptionIds,
  ).toEqual([]);
  expect(
    (
      await request.post(`${origin}/v1/completeLesson`, {
        headers: learner,
        data: { lessonId: built.lessonId },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(`${origin}/v1/answerQuiz`, {
        headers: parent,
        data: {
          lessonId: built.lessonId,
          blockId: built.quizId,
          optionIds: [built.right],
        },
      })
    ).status(),
  ).toBe(403);
  const wrong = await request.post(`${origin}/v1/answerQuiz`, {
    headers: learner,
    data: {
      lessonId: built.lessonId,
      blockId: built.quizId,
      optionIds: [built.wrong],
    },
  });
  expect(wrong.status()).toBe(200);
  expect(await wrong.json()).toMatchObject({
    correct: false,
    correctOptionIds: [built.right],
    canComplete: true,
  });
  const completed = await request.post(`${origin}/v1/completeLesson`, {
    headers: learner,
    data: { lessonId: built.lessonId },
  });
  expect(completed.status()).toBe(200);
  const family = await request.post(`${origin}/v1/getLearnerModule`, {
    headers: parent,
    data: { id: built.moduleId, studentId: rows.studentId },
  });
  expect(family.status()).toBe(200);
  expect(await family.json()).toMatchObject({
    module: {
      lessons: [expect.objectContaining({ correct: 0, answered: 1 })],
    },
  });
  const progress = (await (
    await request.post(`${origin}/v1/getLearnerModules`, {
      headers: learner,
      data: { studentId: "" },
    })
  ).json()) as { rows: { id: string; lessonsCompleted: number }[] };
  expect(progress.rows.find((row) => row.id === built.moduleId)).toMatchObject({
    lessonsCompleted: 1,
  });
  const unpublished = await request.post(`${origin}/v1/unpublishModule`, {
    headers: teacher,
    data: { id: built.moduleId, expectedRevision: 2 },
  });
  expect(unpublished.status()).toBe(200);
  expect(
    (
      await request.post(`${origin}/v1/getLearnerLesson`, {
        headers: learner,
        data: { id: built.lessonId, studentId: "" },
      })
    ).status(),
  ).toBe(404);
});

test("a student works through a lesson with feedback and progress", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const teacher = await signIn(request, "northwind", "sara@example.com");
  await publishModule(request, teacher, suffix);

  await login(page, "omar@example.com");
  await page.getByRole("link", { name: "Modules", exact: true }).click();
  await expect(page).toHaveURL(/\/me\/modules/);
  await page
    .getByRole("link", { name: `Rivers ${suffix}`, exact: true })
    .click();
  await expect(page).toHaveURL(/\/modules\//);
  await expect(
    page.getByRole("heading", { level: 1, name: `Rivers ${suffix}` }),
  ).toBeVisible();
  await expect(page.getByText("0 of 1 lessons completed")).toBeVisible();
  await page.getByRole("link", { name: "1. Where rivers start" }).click();
  await expect(page).toHaveURL(/\/lessons\//);
  await expect(
    page.getByText("Rivers begin in hills and flow to the sea."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark as completed", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "In the sea", exact: true }).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Not quite");
  await expect(
    page.getByRole("checkbox", { name: "In the hills", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Mark as completed", exact: true })
    .click();
  await expect(page.getByText("Lesson marked as completed")).toBeVisible();
  await page.getByRole("link", { name: "Back to module", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `Rivers ${suffix}` }),
  ).toBeVisible();
  await expect(page.getByText("1 of 1 lessons completed")).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 of 1 lessons completed")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("menuitem", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a family follows a child's progress without acting for them", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const teacher = await signIn(request, "northwind", "sara@example.com");
  const built = await publishModule(request, teacher, suffix);
  const learner = await signIn(request, "northwind", "omar@example.com");
  const { studentId } = (await (
    await request.post(`${origin}/v1/getLearnerModules`, {
      headers: learner,
      data: { studentId: "" },
    })
  ).json()) as { studentId: string };
  await request.post(`${origin}/v1/answerQuiz`, {
    headers: learner,
    data: {
      lessonId: built.lessonId,
      blockId: built.quizId,
      optionIds: [built.right],
    },
  });
  await request.post(`${origin}/v1/completeLesson`, {
    headers: learner,
    data: { lessonId: built.lessonId },
  });

  await login(page, "parent@example.com");
  await page.goto("/family/modules");
  await expect(
    page.getByRole("link", { name: `Rivers ${suffix}`, exact: true }),
  ).toHaveCount(0);
  await page.goto(`/family/modules?studentId=${studentId}`);
  await expect(
    page.getByRole("link", { name: `Rivers ${suffix}`, exact: true }),
  ).toBeVisible();
  await page.goto(`/modules/${built.moduleId}?studentId=${studentId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: `Rivers ${suffix}` }),
  ).toBeVisible();
  await expect(page.getByText("1 of 1 lessons completed")).toBeVisible();
  await page.getByRole("link", { name: "1. Where rivers start" }).click();
  await expect(page.getByText("Not answered yet.")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mark as completed" }),
  ).toHaveCount(0);
});

test("a teacher designs a module with a quiz lesson and publishes it", async ({
  page,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  await login(page, "sara@example.com");
  await page.goto("/teach/modules");
  await page.getByRole("link", { name: "New module", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Module title", exact: true })
    .fill(`Deserts ${suffix}`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/module-editor\?id=/);
  await expect(page.getByText("Add at least one lesson")).toBeVisible();
  await page.getByRole("link", { name: "Add lesson", exact: true }).click();
  await expect(page).toHaveURL(/lesson-editor/);
  await page
    .getByRole("textbox", { name: "Lesson title", exact: true })
    .fill("Sand and heat");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.getByRole("textbox", { name: "Content", exact: true }).click();
  await page.keyboard.type("Deserts get very little rain.");
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Question", exact: true })
    .fill("How much rain falls in a desert?");
  await page
    .getByRole("textbox", { name: "Option 1", exact: true })
    .fill("Very little");
  await page
    .getByRole("textbox", { name: "Option 2", exact: true })
    .fill("A lot");
  await page
    .getByRole("checkbox", { name: "Option 1 is correct", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/lesson-editor\?id=/);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(/module-editor\?id=/);
  await expect(page.getByRole("link", { name: "Sand and heat" })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Module published to the class")).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
});
