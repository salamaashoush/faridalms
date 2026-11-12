import { plainContent } from "@faridalms/domain/content-conversion";
import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { names } from "./fixtures/school";
import { PASSWORD, portal, untilHydrated } from "./fixtures/sign-in";

const GUARDIAN_WORDS = /guardian|parent|famil/i;

test("in a school without families an adult learner signs a consent, sees their work and is messaged, and nothing speaks of guardians", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const school = await freshSchool(browser, { without: ["families"] });
  expect(school.guardian).toBeNull();
  const { api: office } = await signedInApi(
    school.admin,
    PASSWORD,
    school.slug,
  );
  const { today } = await office.identity.currentUser();
  const {
    rows: [pupil],
  } = await office.people.students({ q: "Salama Pupil" });
  if (!pupil) throw new Error("the school has no pupil");

  // A learner of thirty, well past the age the school lets learners decide from.
  const record = await office.people.student({ id: pupil.id });
  await office.people.saveStudent({
    id: pupil.id,
    expectedVersion: record.version,
    names: names("Salama", "Pupil"),
    reference: record.reference ?? "",
    birthDate: `${Number(today.slice(0, 4)) - 30}${today.slice(4)}`,
  });

  const { api: teacher } = await signedInApi(
    school.teacher,
    PASSWORD,
    school.slug,
  );
  const { id: teacherId } = await teacher.identity.currentUser();
  const klass = await office.classes.save({
    code: "PY-101",
    titleEn: "Python from scratch",
    titleAr: "",
    teacherIds: [teacherId],
    startsOn: addDays(today, -7),
    endsOn: addDays(today, 90),
  });
  await office.classes.enrol({ studentId: pupil.id, classId: klass.id });
  const title = "Hello, world";
  const work = await teacher.coursework.save({
    classId: klass.id,
    title,
    brief: plainContent("Write a program that greets the class."),
    audience: "class",
    latePolicy: "accept",
    submissionFormat: "online",
    points: 10,
    rubric: null,
  });
  await teacher.coursework.publish({
    id: work.id,
    expectedVersion: work.version,
  });

  const { purposes } = await office.consents.forms();
  const news = purposes.find((row) => row.code === "photo_school_news");
  if (!news) throw new Error("the school has no photo consent");
  const form = await office.consents.saveForm({
    id: "",
    expectedVersion: 0,
    purposeId: news.id,
    primaryLocale: "en",
    body: plainContent("May photos of you appear in the academy's news?"),
    translation: null,
  });
  await office.consents.publishForm({
    id: form.id,
    expectedVersion: form.version,
  });
  await teacher.messages.start({
    kind: "direct",
    recipientIds: [pupil.id],
    content: plainContent("Welcome to Python from scratch."),
  });

  await signInTo(page, school, "student");
  await expect(page.locator("body")).not.toContainText(GUARDIAN_WORDS);

  // The learner signs the consent for themself.
  await page.getByRole("link", { name: "Permissions" }).first().click();
  await expect(page).toHaveURL(`${portal(school.slug)}/me/consents`);
  await untilHydrated(page);
  await expect(page.locator("main")).not.toContainText(GUARDIAN_WORDS);
  await page.getByRole("button", { name: "I agree", exact: true }).click();
  await expect(page.getByText(/^You answered on/)).toBeVisible();
  const answered = await office.consents.student({ id: pupil.id });
  expect(
    answered.purposes.find((row) => row.id === news.id)?.current,
  ).toMatchObject({ decision: "granted", capacity: "self" });

  // They see their work.
  await page.goto(`${portal(school.slug)}/me/assignments`);
  await untilHydrated(page);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // They are messaged.
  await page.goto(`${portal(school.slug)}/me/messages`);
  await untilHydrated(page);
  await expect(page.getByText("Welcome to Python from scratch.")).toBeVisible();

  // Their own details and medical summary, without a guardian anywhere.
  await page.goto(`${portal(school.slug)}/me/details`);
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Your details" }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(GUARDIAN_WORDS);

  // The office's record of the learner has no family tab or guardian flag.
  const desk = await (await browser.newContext()).newPage();
  await signInTo(desk, school, "admin");
  await desk.goto(`${portal(school.slug)}/students/${pupil.id}`);
  await untilHydrated(desk);
  await expect(desk.getByRole("tab", { name: "Family" })).toHaveCount(0);
  await expect(desk.locator("main")).not.toContainText(GUARDIAN_WORDS);
});
