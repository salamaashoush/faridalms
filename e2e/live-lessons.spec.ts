import type { LessonDocument } from "@faridalms/domain/learning";

import { plainContent } from "@faridalms/domain/content-conversion";
import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { expect, test } from "@playwright/test";

import type { Api } from "./fixtures/api";

import { signedInApi } from "./fixtures/api";
import {
  ACCOUNTS,
  PASSWORD,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seed's second teacher teaches Arabic to every grade; the seeded student
// sits in 8A. Each browser builds its own modules, so none reads another's.
const TEACHER = "teacher2.northwind@northwind.example.com";
const id = () => crypto.randomUUID();
const tag = () => crypto.randomUUID().slice(0, 6);

function written(blocks: LessonDocument["blocks"]) {
  const document = contentOfLesson({ version: 2, blocks });
  if (!document) throw new Error("the blocks could not become a document");
  return document;
}

const yesNo = (prompt: string) => {
  const right = id();
  const wrong = id();
  return {
    right,
    wrong,
    block: {
      id: id(),
      type: "choice" as const,
      prompt,
      points: 1,
      hints: [],
      explanation: "",
      tries: 1,
      options: [
        { id: right, text: "Yes", feedback: "" },
        { id: wrong, text: "No", feedback: "" },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
    },
  };
};

async function eightArabic(api: Api) {
  const found = (await api.learning.options()).classes.find(
    (row) => row.titleEn === "8A Arabic",
  );
  if (!found) throw new Error("the teacher does not teach 8A Arabic");
  return found.id;
}

/** A module for 8A Arabic holding the lessons given, open to students. */
async function openModule(
  api: Api,
  title: string,
  lessons: {
    title: string;
    content: ReturnType<typeof written>;
    young?: boolean;
    completion?: "view" | "quiz";
  }[],
) {
  const saved = await api.learning.saveModule({
    id: "",
    expectedVersion: 0,
    title,
    summary: "",
    classIds: [await eightArabic(api)],
    prerequisiteId: "",
    sequential: false,
  });
  const ids: string[] = [];
  for (const lesson of lessons)
    ids.push(
      (
        await api.learning.saveLesson({
          id: "",
          moduleId: saved.id,
          expectedVersion: 0,
          title: lesson.title,
          completion: lesson.completion ?? "view",
          passScore: null,
          young: lesson.young ?? false,
          content: lesson.content,
          publish: false,
        })
      ).id,
    );
  await api.learning.publishModule({
    id: saved.id,
    expectedVersion: saved.version,
  });
  return { id: saved.id, lessonIds: ids };
}

test("a score in one module's lesson opens a lesson of another module", async ({
  browser,
  page,
}) => {
  const { api: teacher } = await signedInApi(TEACHER);
  const checking = `Diagnostic ${tag()}`;
  const helping = `Help ${tag()}`;
  const asked = yesNo("Is a half two quarters?");
  const first = await openModule(teacher, checking, [
    {
      title: "Diagnostic",
      completion: "quiz",
      content: written([asked.block]),
    },
  ]);
  const second = await openModule(teacher, helping, [
    { title: "Warm up", content: plainContent("Fold a paper strip.") },
    { title: "Halves again", content: plainContent("Cut it in two.") },
  ]);

  // The teacher routes the second lesson by the diagnostic's score, chosen
  // under its module's name in the lesson's routing settings.
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto(
    `/lesson-editor?moduleId=${second.id}&id=${second.lessonIds[1]}`,
  );
  await untilHydrated(page);
  await page.getByRole("combobox", { name: "Show this lesson" }).click();
  await page
    .getByRole("option", { name: "By score in another lesson" })
    .click();
  await page
    .getByRole("combobox", { name: "Lesson the score is from" })
    .click();
  await page
    .getByRole("group", { name: checking })
    .getByRole("option", { name: "Diagnostic" })
    .click();
  await page.getByRole("spinbutton", { name: "Below (%)" }).fill("60");
  await expect(
    page.getByText(`Only for scores below 60% in Diagnostic in ${checking}`),
  ).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const record = await teacher.learning.record({ id: second.id });
  expect(record.lessons[1]?.condition?.lessonId).toBe(first.lessonIds[0]);

  const context = await browser.newContext();
  const learner = await context.newPage();
  const { api: student } = await signedInApi(ACCOUNTS.student.email);
  await student.learning.playLesson({ id: first.lessonIds[0] ?? "" });
  await student.learning.respond({
    lessonId: first.lessonIds[0] ?? "",
    blockId: asked.block.id,
    response: { type: "choice", optionIds: [asked.wrong] },
  });
  await signInWith(learner, ACCOUNTS.student.email, PASSWORD, "/me");
  await learner.goto(`/modules/${second.id}`);
  await untilHydrated(learner);
  await expect(
    learner.getByText(`Opened by your score in Diagnostic, ${checking}`),
  ).toBeVisible();
  await learner.goto(`/modules/${first.id}`);
  await untilHydrated(learner);
  const sent = learner.getByRole("region", { name: "Where your scores lead" });
  await expect(sent.getByRole("link", { name: "Halves again" })).toBeVisible();
  await context.close();
});

test("a student's player follows the teacher the moment they move", async ({
  page,
}) => {
  const { api: teacher } = await signedInApi(TEACHER);
  const title = `Seasons ${tag()}`;
  const module = await openModule(teacher, title, [
    {
      title: "Seasons",
      content: written([
        { id: id(), type: "content", content: plainContent("Spring comes.") },
        { id: id(), type: "gate", requires: "none" },
        { id: id(), type: "content", content: plainContent("Summer comes.") },
      ]),
    },
  ]);
  const lessonId = module.lessonIds[0] ?? "";
  await signInWith(page, ACCOUNTS.student.email, PASSWORD, "/me");
  await page.goto(`/lessons/${lessonId}`);
  await untilHydrated(page);
  await expect(page.getByText("Spring comes.")).toBeVisible();

  // Unled, the player would ask only every 15 seconds and, led, every 3;
  // the push brings each move well inside either.
  const started = await teacher.learning.startPaced({
    lessonId,
    classId: await eightArabic(teacher),
  });
  await expect(
    page.getByText("Your teacher is leading this lesson.", { exact: false }),
  ).toBeVisible({ timeout: 2500 });
  await expect(page.getByText("Summer comes.")).toBeHidden();
  await teacher.learning.pace({ id: started.id, step: 1 });
  await expect(page.getByText("Summer comes.")).toBeVisible({ timeout: 2500 });
  await teacher.learning.pace({ id: started.id, paused: true });
  await expect(
    page.getByText("Paused. Look up at your teacher.").first(),
  ).toBeVisible({
    timeout: 2500,
  });
  await teacher.learning.endPaced({ id: started.id });
  await expect(
    page.getByText("Your teacher is leading this lesson.", { exact: false }),
  ).toBeHidden({ timeout: 2500 });
});

test("a teacher leads a young lesson one screen at a time, by tapping", async ({
  browser,
  page,
}) => {
  const { api: teacher } = await signedInApi(TEACHER);
  const title = `Animals ${tag()}`;
  const cat = yesNo("Is this a cat?");
  const dog = yesNo("Is this a dog?");
  const module = await openModule(teacher, title, [
    {
      title: "Animals",
      young: true,
      content: written([
        { id: id(), type: "content", content: plainContent("A cat.") },
        cat.block,
        { id: id(), type: "content", content: plainContent("A dog.") },
        dog.block,
      ]),
    },
  ]);
  const lessonId = module.lessonIds[0] ?? "";
  const started = await teacher.learning.startPaced({
    lessonId,
    classId: await eightArabic(teacher),
  });

  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto(`/live/${started.id}`);
  await untilHydrated(page);
  await expect(page.getByText("Screen 1 of 2").first()).toBeVisible();

  const context = await browser.newContext();
  const child = await context.newPage();
  await signInWith(child, ACCOUNTS.student.email, PASSWORD, "/me");
  await child.goto(`/lessons/${lessonId}`);
  await untilHydrated(child);
  const stage = child.getByRole("dialog", { name: "Animals" });
  await expect(stage.getByText("With your teacher")).toBeVisible();
  await stage.getByRole("button", { name: "Start" }).click();
  await child.waitForTimeout(450);
  await stage.getByRole("button", { name: "Yes" }).click();
  // The child has answered, but the teacher has not moved on.
  await expect(
    stage.getByRole("button", { name: "Wait for your teacher" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Next screen" }).click();
  await expect(page.getByText("Screen 2 of 2").first()).toBeVisible();
  await expect(stage.getByText("Is this a dog?")).toBeVisible({
    timeout: 2500,
  });

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(stage.getByText("Wait for your teacher")).toBeVisible({
    timeout: 2500,
  });
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(stage.getByText("Wait for your teacher")).toBeHidden({
    timeout: 2500,
  });
  await context.close();
});
