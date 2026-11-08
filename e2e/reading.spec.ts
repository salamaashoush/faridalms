import { plainContent } from "@faridalms/domain/content-conversion";
import { briefWithQuiz } from "@faridalms/domain/lesson-content";
import { expect, test } from "@playwright/test";

import { API_ORIGIN, signedInApi } from "./fixtures/api";
import {
  ACCOUNTS,
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seed's second teacher teaches Arabic to every grade; the seeded student
// sits in 8A.
const TEACHER = "teacher2.northwind@northwind.example.com";
const passage = "The Nile is long.\nBoats sail on it to Cairo.";

test("a reading marked in a quiz reaches the student's words to practise and the record's chart", async ({
  browser,
  page,
}) => {
  const { api: teacher } = await signedInApi(TEACHER);
  const { classes } = await teacher.coursework.options();
  const arabic = classes.find((row) => row.titleEn === "8A Arabic");
  if (!arabic) throw new Error("the seed has no 8A Arabic");
  const question = crypto.randomUUID();
  const title = `Reading check ${crypto.randomUUID().slice(0, 6)}`;
  const quiz = await teacher.coursework.save({
    classId: arabic.id,
    title,
    brief: briefWithQuiz(plainContent("Read aloud."), {
      version: 2,
      blocks: [
        {
          id: question,
          type: "written",
          prompt: "Read this passage aloud.",
          points: 2,
          hints: [],
          explanation: "",
          tries: null,
          wordLimit: null,
          recordSeconds: 180,
          passage,
        },
      ],
    }),
    audience: "class",
    latePolicy: "accept",
    submissionFormat: "quiz",
    points: null,
    rubric: null,
    quiz: { attempts: 1, keep: "highest", reveal: "returned", shuffle: false },
  });
  await teacher.coursework.publish({
    id: quiz.id,
    expectedVersion: quiz.version,
  });
  const { api: pupil, token } = await signedInApi(ACCOUNTS.student.email);
  const sound = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
  const file = await pupil.files.initiate({
    purpose: "document_media",
    name: "reading.webm",
    mediaType: "audio/webm",
    sizeBytes: sound.byteLength,
  });
  await fetch(`${API_ORIGIN}/v1/files/${file.id}/content`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "x-farida-school": "northwind",
    },
    body: sound,
  });
  await pupil.coursework.saveQuizAnswer({
    assignmentId: quiz.id,
    blockId: question,
    response: {
      type: "written",
      text: "",
      recording: { fileId: file.id, seconds: 10 },
    },
  });
  const work = await pupil.coursework.work({ id: quiz.id });
  await pupil.coursework.handIn({
    assignmentId: quiz.id,
    expectedVersion: work.submission.version,
  });

  // The teacher marks the reading word by word, with its prosody.
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto(`/assignments/${quiz.id}?tab=answers`);
  await untilHydrated(page);
  await page.getByRole("button", { name: "sail" }).click();
  await page
    .getByRole("group", { name: "Expression and volume" })
    .getByRole("button", { name: "3" })
    .click();
  await expect(
    page.getByText(/^Sounds like natural language through most/),
  ).toBeVisible();
  await page.getByRole("spinbutton", { name: /Points/ }).fill("2");
  await page.getByRole("button", { name: /^Save/ }).first().click();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInWith(
    student,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await student.goto("/me/assignments");
  await untilHydrated(student);
  const mine = student.getByRole("region", { name: "Reading aloud" });
  await expect(
    mine.getByRole("heading", { name: "Words to practise" }),
  ).toBeVisible();
  await expect(mine.getByText("sail", { exact: true })).toBeVisible();
  await expect(mine.getByText("54 words a minute")).toBeVisible();
  await studentContext.close();

  const me = await pupil.identity.currentUser();
  await page.goto(`/students/${me.id}?tab=coursework`);
  await untilHydrated(page);
  const record = page.getByRole("region", { name: "Reading aloud" });
  await expect(
    record.getByRole("img", { name: /Words correct a minute in English/ }),
  ).toBeVisible();
  await expect(record.getByRole("cell", { name: "54" })).toBeVisible();
});

test("a school writes its own Arabic reading norms in its settings", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/settings?section=reading");
  await untilHydrated(page);
  const arabic = page.getByRole("region", { name: /Reading norms in Arabic/ });
  await expect(arabic.getByText(/no published norms/)).toBeVisible();
  await arabic.locator("#norm-ar-grade").click();
  await page.getByRole("option", { name: "Grade 2", exact: true }).click();
  await arabic.getByRole("button", { name: "Add grade" }).click();
  await arabic
    .getByRole("spinbutton", { name: /Grade 2, autumn, 50th percentile/ })
    .fill("45");
  await arabic.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Reading norms saved")).toBeVisible();
  await arabic.getByRole("button", { name: "Go back to the defaults" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Go back to the defaults" })
    .click();
  await expect(page.getByText("Reading norms set back")).toBeVisible();
});
