import { expect, test } from "@playwright/test";

import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { portal, signIn, untilHydrated } from "./fixtures/sign-in";

const PEER = "Classmates review each other's work";
const WEBSITE = "Also post on the school's website";

test("a school with peer review, the website and texts offers each where it belongs", async ({
  browser,
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/announcement-editor");
  await untilHydrated(page);
  await expect(page.getByRole("checkbox", { name: WEBSITE })).toBeVisible();
  await page.goto("/notification-preferences");
  await untilHydrated(page);
  await expect(page.getByLabel("Text", { exact: true }).first()).toBeVisible();
  await page.goto("/notification-audit");
  await untilHydrated(page);
  await expect(page.getByRole("button", { name: /Channel/ })).toBeVisible();

  const learner = await browser.newContext();
  const student = await learner.newPage();
  await signIn(student, "student");
  await student.goto("/notification-preferences");
  await untilHydrated(student);
  await expect(
    student.getByText("Classmates' work to review", { exact: true }),
  ).toBeVisible();
  await learner.close();
});

test("a school without peer review, the website or texts offers none of them", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const school = await freshSchool(browser, {
    without: ["peer_review", "website", "sms"],
  });

  await signInTo(page, school, "teacher");
  await page.goto(`${portal(school.slug)}/assignment-editor`);
  await untilHydrated(page);
  await expect(
    page.getByRole("textbox", { name: "Assignment title" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: PEER })).toHaveCount(0);
  await expect(page.getByText("Peer review", { exact: true })).toHaveCount(0);

  const office = await browser.newContext();
  const admin = await office.newPage();
  await signInTo(admin, school, "admin");
  await admin.goto(`${portal(school.slug)}/announcement-editor`);
  await untilHydrated(admin);
  await expect(admin.getByRole("textbox", { name: "Title" })).toBeVisible();
  await expect(admin.getByRole("checkbox", { name: WEBSITE })).toHaveCount(0);
  await admin.goto(`${portal(school.slug)}/notification-preferences`);
  await untilHydrated(admin);
  await expect(admin.getByLabel("Email").first()).toBeVisible();
  await expect(admin.getByLabel("Text", { exact: true })).toHaveCount(0);
  await expect(admin.getByText("texts", { exact: false })).toHaveCount(0);
  await admin.goto(`${portal(school.slug)}/notification-audit`);
  await untilHydrated(admin);
  await expect(admin.getByRole("button", { name: /State/ })).toBeVisible();
  await expect(admin.getByRole("button", { name: /Channel/ })).toHaveCount(0);
  await office.close();

  const learner = await browser.newContext();
  const student = await learner.newPage();
  await signInTo(student, school, "student");
  await student.goto(`${portal(school.slug)}/notification-preferences`);
  await untilHydrated(student);
  await expect(student.getByLabel("Email").first()).toBeVisible();
  await expect(
    student.getByText("Classmates' work to review", { exact: true }),
  ).toHaveCount(0);
  await learner.close();
});
