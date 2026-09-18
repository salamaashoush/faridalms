import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001";
const origin = `${api}/v1`;

async function signIn(request: APIRequestContext, email: string) {
  const response = await request.post(`${origin}/auth/signIn`, {
    data: { school: "northwind", email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const { token } = (await response.json()) as { token: string };
  return { authorization: `Bearer ${token}` };
}

function paragraph(text: string) {
  return {
    root: {
      type: "root",
      version: 1,
      format: "",
      indent: 0,
      direction: null,
      children: [
        {
          type: "paragraph",
          version: 1,
          format: "",
          indent: 0,
          direction: null,
          textFormat: 0,
          textStyle: "",
          children: [
            {
              type: "text",
              version: 1,
              format: 0,
              detail: 0,
              mode: "normal",
              style: "",
              text,
            },
          ],
        },
      ],
    },
  };
}

async function upload(
  request: APIRequestContext,
  headers: Record<string, string>,
  purpose: "assignment_resource" | "submission_attachment",
  name: string,
  body: string,
) {
  const initiated = await request.post(`${origin}/initiateUpload`, {
    headers,
    data: {
      purpose,
      name,
      mediaType: "application/pdf",
      sizeBytes: Buffer.byteLength(body),
    },
  });
  expect(initiated.status()).toBe(200);
  const { id, uploadPath } = (await initiated.json()) as {
    id: string;
    uploadPath: string;
  };
  const stored = await request.put(`${api}${uploadPath}`, {
    headers: { ...headers, "content-type": "application/pdf" },
    data: body,
  });
  expect(stored.status()).toBe(200);
  return id;
}

test("assignments move from draft to a released result with private files and scoped access", async ({
  request,
}) => {
  const [sara, norhan, omar, parent, acme] = await Promise.all([
    signIn(request, "sara@example.com"),
    signIn(request, "teacher@example.com"),
    signIn(request, "omar@example.com"),
    signIn(request, "parent@example.com"),
    (async () => {
      const response = await request.post(`${origin}/auth/signIn`, {
        data: {
          school: "acme",
          email: "admin@example.com",
          password: "northwind1234",
        },
      });
      const { token } = (await response.json()) as { token: string };
      return { authorization: `Bearer ${token}` };
    })(),
  ]);
  const contextResponse = await request.post(`${origin}/getAuthoringContext`, {
    headers: sara,
    data: {},
  });
  expect(contextResponse.status()).toBe(200);
  const context = (await contextResponse.json()) as {
    classId: string;
    classes: { id: string; authoringSubjects: { id: string }[] }[];
    roster: { id: string }[];
  };
  const subjectId = context.classes[0]?.authoringSubjects[0]?.id;
  if (!subjectId) throw new Error("Seed must give Sara a subject to author");
  const resourceId = await upload(
    request,
    sara,
    "assignment_resource",
    "worksheet.pdf",
    "%PDF-1.4 worksheet",
  );
  const rejected = await request.post(`${origin}/initiateUpload`, {
    headers: sara,
    data: {
      purpose: "assignment_resource",
      name: "run.exe",
      mediaType: "application/octet-stream",
      sizeBytes: 10,
    },
  });
  expect(rejected.status()).toBe(400);
  const id = crypto.randomUUID();
  const reasoning = crypto.randomUUID();
  const presentation = crypto.randomUUID();
  const draft = {
    id,
    expectedRevision: 0,
    classId: context.classId,
    subjectId,
    type: "project",
    title: `Salama lifecycle ${id.slice(0, 8)}`,
    instructions: paragraph("Explain fractions with a drawing."),
    resourceFileIds: [resourceId],
    recipients: { mode: "class", groupIds: [], studentIds: [] },
    availableFrom: "",
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    closesAt: new Date(Date.now() + 7_200_000).toISOString(),
    latePolicy: "accepted_with_deduction",
    lateDeductionPercent: 20,
    submissionFormat: "written_and_files",
    maxAttachments: 2,
    maxAttachmentBytes: 1024 * 1024,
    resubmission: "until_close",
    maxScore: 10,
    rubric: [
      { id: reasoning, title: "Reasoning", description: "", maxPoints: 6 },
      {
        id: presentation,
        title: "Presentation",
        description: "",
        maxPoints: 4,
      },
    ],
  };
  const saved = await request.post(`${origin}/saveAssignment`, {
    headers: sara,
    data: draft,
  });
  expect(saved.status()).toBe(200);
  const { revision } = (await saved.json()) as { revision: number };
  const forbidden = await request.post(`${origin}/saveAssignment`, {
    headers: norhan,
    data: { ...draft, id: crypto.randomUUID() },
  });
  expect(forbidden.status()).toBe(403);
  const hidden = await request.post(`${origin}/getLearnerAssignment`, {
    headers: omar,
    data: { id },
  });
  expect(hidden.status()).toBe(404);
  const foreign = await request.post(`${origin}/getAssignmentWorkspace`, {
    headers: acme,
    data: { id },
  });
  expect(foreign.status()).toBe(404);
  const published = await request.post(`${origin}/publishAssignment`, {
    headers: sara,
    data: { id, expectedRevision: revision },
  });
  expect(published.status()).toBe(200);
  const stale = await request.post(`${origin}/saveAssignment`, {
    headers: sara,
    data: { ...draft, expectedRevision: revision },
  });
  expect(stale.status()).toBe(409);

  const learner = await request.post(`${origin}/getLearnerAssignment`, {
    headers: omar,
    data: { id },
  });
  expect(learner.status()).toBe(200);
  expect(await learner.json()).toMatchObject({
    state: "not_started",
    canEdit: true,
    resources: [{ name: "worksheet.pdf" }],
  });
  const attachmentId = await upload(
    request,
    omar,
    "submission_attachment",
    "واجب.pdf",
    "%PDF-1.4 attempt",
  );
  const mismatch = await request.post(`${origin}/initiateUpload`, {
    headers: omar,
    data: {
      purpose: "submission_attachment",
      name: "short.pdf",
      mediaType: "application/pdf",
      sizeBytes: 5,
    },
  });
  const { uploadPath } = (await mismatch.json()) as { uploadPath: string };
  const wrongSize = await request.put(`${api}${uploadPath}`, {
    headers: { ...omar, "content-type": "application/pdf" },
    data: "123456789",
  });
  expect(wrongSize.status()).toBe(400);
  const filesOnly = await request.post(`${origin}/saveSubmissionDraft`, {
    headers: omar,
    data: {
      assignmentId: id,
      expectedRevision: 0,
      content: null,
      fileIds: [attachmentId],
    },
  });
  expect(filesOnly.status()).toBe(200);
  const { revision: draftRevision } = (await filesOnly.json()) as {
    revision: number;
  };
  const incomplete = await request.post(`${origin}/submitAttempt`, {
    headers: omar,
    data: { assignmentId: id, expectedRevision: draftRevision },
  });
  expect(incomplete.status()).toBe(400);
  const completed = await request.post(`${origin}/saveSubmissionDraft`, {
    headers: omar,
    data: {
      assignmentId: id,
      expectedRevision: draftRevision,
      content: paragraph("Half of a pizza is one of two equal pieces."),
      fileIds: [attachmentId],
    },
  });
  expect(completed.status()).toBe(200);
  const { revision: readyRevision } = (await completed.json()) as {
    revision: number;
  };
  const submitted = await request.post(`${origin}/submitAttempt`, {
    headers: omar,
    data: { assignmentId: id, expectedRevision: readyRevision },
  });
  expect(submitted.status()).toBe(200);
  const attempt = (await submitted.json()) as {
    attemptId: string;
    number: number;
  };
  expect(attempt.number).toBe(1);
  const retried = await request.post(`${origin}/submitAttempt`, {
    headers: omar,
    data: { assignmentId: id, expectedRevision: readyRevision },
  });
  expect(retried.status()).toBe(200);
  expect(((await retried.json()) as { attemptId: string }).attemptId).toBe(
    attempt.attemptId,
  );

  const wrongReview = await request.post(`${origin}/getAttemptForReview`, {
    headers: norhan,
    data: { attemptId: attempt.attemptId },
  });
  expect(wrongReview.status()).toBe(404);
  const mismatchedRubric = await request.post(`${origin}/assessAttempt`, {
    headers: sara,
    data: {
      attemptId: attempt.attemptId,
      score: 9,
      rubricScores: [
        { criterionId: reasoning, points: 6 },
        { criterionId: presentation, points: 4 },
      ],
      feedback: null,
      release: true,
    },
  });
  expect(mismatchedRubric.status()).toBe(400);
  const privateAssessment = await request.post(`${origin}/assessAttempt`, {
    headers: sara,
    data: {
      attemptId: attempt.attemptId,
      score: 9,
      rubricScores: [
        { criterionId: reasoning, points: 5, comment: "Good" },
        { criterionId: presentation, points: 4 },
      ],
      feedback: paragraph("Clear reasoning."),
      release: false,
    },
  });
  expect(privateAssessment.status()).toBe(200);
  const unreleased = await request.post(`${origin}/getLearnerAssignment`, {
    headers: omar,
    data: { id },
  });
  expect(await unreleased.json()).toMatchObject({
    state: "submitted",
    submission: { attempts: [{ assessment: null }] },
  });
  const released = await request.post(`${origin}/assessAttempt`, {
    headers: sara,
    data: {
      attemptId: attempt.attemptId,
      score: 9,
      rubricScores: [
        { criterionId: reasoning, points: 5, comment: "Good" },
        { criterionId: presentation, points: 4 },
      ],
      feedback: paragraph("Clear reasoning."),
      release: true,
    },
  });
  expect(released.status()).toBe(200);
  const returned = await request.post(`${origin}/getLearnerAssignment`, {
    headers: omar,
    data: { id },
  });
  const result = (await returned.json()) as {
    state: string;
    studentId: string;
    submission: {
      attempts: { assessment: { effectiveScore: number } | null }[];
    };
  };
  expect(result.state).toBe("returned");
  expect(result.submission.attempts[0]?.assessment?.effectiveScore).toBe(9);
  const family = await request.post(`${origin}/getLearnerAssignment`, {
    headers: parent,
    data: { id, studentId: result.studentId },
  });
  expect(family.status()).toBe(200);
  expect(await family.json()).toMatchObject({
    state: "returned",
    canEdit: false,
  });

  const resource = await request.get(`${api}/v1/files/${resourceId}/content`, {
    headers: parent,
  });
  expect(resource.status()).toBe(200);
  expect(resource.headers()["content-disposition"]).toContain("worksheet.pdf");
  expect(await resource.text()).toBe("%PDF-1.4 worksheet");
  const attachment = await request.get(
    `${api}/v1/files/${attachmentId}/content`,
    {
      headers: parent,
    },
  );
  expect(attachment.status()).toBe(200);
  expect(attachment.headers()["content-disposition"]).toContain(
    "%D9%88%D8%A7%D8%AC%D8%A8.pdf",
  );
  const strangerDownload = await request.get(
    `${api}/v1/files/${attachmentId}/content`,
    {
      headers: norhan,
    },
  );
  expect(strangerDownload.status()).toBe(404);
  const anonymous = await request.get(`${api}/v1/files/${resourceId}/content`);
  expect(anonymous.status()).toBe(401);

  const archived = await request.post(`${origin}/archiveAssignment`, {
    headers: sara,
    data: {
      id,
      expectedRevision: ((await published.json()) as { revision: number })
        .revision,
    },
  });
  expect(archived.status()).toBe(200);
  const readOnly = await request.post(`${origin}/getLearnerAssignment`, {
    headers: omar,
    data: { id },
  });
  expect(await readOnly.json()).toMatchObject({
    canEdit: false,
    window: "closed",
  });
});

async function login(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
}

test("a teacher designs and publishes, a student hands in, a teacher releases and a parent reads", async ({
  page,
  browser,
  request,
}) => {
  const teacher = await signIn(request, "sara@example.com");
  const overview = await request.post(`${origin}/getTeachingOverview`, {
    headers: teacher,
  });
  const { today } = (await overview.json()) as { today: string };
  await login(page, "sara@example.com");
  await page.goto("/teach/assignments");
  await page
    .getByRole("link", { name: "Design an assignment", exact: true })
    .click();
  await expect(page).toHaveURL(/assignment-editor/);
  const title = `Salama browser design ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Assignment title", { exact: true }).fill(title);
  const instructions = page.getByRole("textbox", {
    name: "Instructions",
    exact: true,
  });
  await instructions.click();
  await page.keyboard.type("Describe what you learned this week.");
  await page.getByLabel("Due", { exact: true }).fill(`${today}T23:00`);
  await page.setInputFiles('input[type="file"]', {
    name: "worksheet.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 salama worksheet"),
  });
  await expect(
    page.getByRole("link", { name: "worksheet.pdf", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const assignmentId = /assignments\/([a-f0-9-]+)/.exec(page.url())?.[1] ?? "";

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await login(student, "omar@example.com");
  await student.goto(`/assignments/${assignmentId}?tab=work`);
  await expect(
    student.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const response = student.getByRole("textbox", {
    name: "Your response",
    exact: true,
  });
  await response.click();
  await student.keyboard.type("I learned about fractions.");
  await student
    .getByRole("button", { name: "Submit work", exact: true })
    .click();
  await student
    .getByRole("dialog")
    .getByRole("button", { name: "Submit work", exact: true })
    .click();
  await expect(
    student.getByText("Handed in and awaiting review."),
  ).toBeVisible();
  await student.reload();
  await expect(student.getByText("I learned about fractions.")).toBeVisible();
  await expect(
    student.getByText("Awaiting review.", { exact: true }),
  ).toBeVisible();

  await page.goto(`/assignments/${assignmentId}?tab=learners`);
  await page
    .getByRole("button", { name: "Review work by Omar Ashoush", exact: true })
    .click();
  await expect(page).toHaveURL(/tab=review/);
  await expect(page.getByText("I learned about fractions.")).toBeVisible();
  await page.getByRole("spinbutton", { name: "Score", exact: true }).fill("9");
  const feedback = page.getByRole("textbox", { name: "Feedback", exact: true });
  await feedback.click();
  await page.keyboard.type("Clear reasoning.");
  await page
    .getByRole("button", { name: "Release to learner", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Update released result", exact: true }),
  ).toBeVisible();

  await student.reload();
  await expect(student.getByText("9 / 10", { exact: true })).toBeVisible();
  await expect(student.getByText("Clear reasoning.")).toBeVisible();
  await expect(
    student.getByRole("button", { name: "Hand in again", exact: true }),
  ).toHaveCount(0);
  await studentContext.close();

  const parentContext = await browser.newContext();
  const parent = await parentContext.newPage();
  await login(parent, "parent@example.com");
  await parent.goto("/family/assignments");
  await parent
    .locator("label", { has: parent.getByRole("radio", { name: /Omar/ }) })
    .click();
  await expect(parent.getByRole("radio", { name: /Omar/ })).toBeChecked();
  await parent.getByRole("searchbox", { name: "Search records…" }).fill(title);
  await parent
    .getByRole("link", { name: `Open ${title}`, exact: true })
    .click();
  await expect(parent).toHaveURL(/tab=work/);
  await expect(parent.getByText("9 / 10", { exact: true })).toBeVisible();
  await expect(parent.getByText("Clear reasoning.")).toBeVisible();
  await expect(
    parent.getByRole("button", { name: "Submit work", exact: true }),
  ).toHaveCount(0);
  await parent.getByRole("tab", { name: "Brief", exact: true }).click();
  const download = parent.getByRole("link", {
    name: "worksheet.pdf",
    exact: true,
  });
  await expect(download).toBeVisible();
  const href = await download.getAttribute("href");
  const fetched = await parent.request.get(`http://127.0.0.1:3000${href}`);
  expect(fetched.status()).toBe(200);
  expect(fetched.headers()["content-disposition"]).toContain("attachment");
  expect(await fetched.text()).toBe("%PDF-1.4 salama worksheet");

  await parent.setViewportSize({ width: 390, height: 844 });
  await parent.getByRole("button", { name: "Change language" }).click();
  await parent.getByRole("menuitem", { name: "العربية" }).click();
  await expect(parent.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    parent.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  expect(
    await parent.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await parentContext.close();
});
