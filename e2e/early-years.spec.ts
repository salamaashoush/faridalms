import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import {
  PASSWORD,
  portal,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

test("a school with the early years and no grades marks a class young, and its child signs in with a badge to the young home", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const school = await freshSchool(browser, { without: ["grade_levels"] });
  const { api } = await signedInApi(school.admin, PASSWORD, school.slug);
  const { today } = await api.identity.currentUser();
  await api.years.save({
    titleEn: "Salama's first year",
    titleAr: "",
    startsOn: addDays(today, -20),
    endsOn: addDays(today, 200),
    terms: [],
  });

  await signInTo(page, school, "admin");
  await page.goto(`${portal(school.slug)}/classes`);
  await untilHydrated(page);
  await page.getByRole("tab", { name: "All classes", exact: true }).click();
  await page.getByRole("link", { name: "Add class", exact: true }).click();
  await expect(page).toHaveURL(/\/class-editor/);
  await page
    .getByRole("textbox", { name: "Class name in English" })
    .fill("Little explorers");
  await page
    .getByRole("textbox", { name: "Class name in Arabic" })
    .fill("المستكشفون الصغار");
  await page.getByRole("textbox", { name: /^Class code/ }).fill("EY-1");
  await page.getByRole("button", { name: "Add teacher", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "For young children", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/classes(\?|$)/);

  const {
    rows: [klass],
  } = await api.classes.directory({ q: "Little explorers" });
  const {
    rows: [pupil],
  } = await api.people.students({ q: "Salama Pupil" });
  if (!klass || !pupil) throw new Error("the class or the pupil is missing");
  await api.classes.enrol({ studentId: pupil.id, classId: klass.id });

  await page.goto(`${portal(school.slug)}/classes/${klass.id}`);
  await untilHydrated(page);
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Sign-in badges" }),
  ).toBeVisible();

  const teacher = await signedInApi(school.teacher, PASSWORD, school.slug);
  const { badges } = await teacher.api.badges.issueBadges({
    classId: klass.id,
    studentIds: [pupil.id],
  });
  const secret = badges[0]?.secret;
  if (!secret) throw new Error("no badge was issued");

  const child = await browser.newPage();
  await child.goto(`${portal(school.slug)}/badge#${secret}`);
  await expect(child).toHaveURL(/\/me$/);
  await expect(child.getByRole("heading", { level: 1 })).toHaveText(/^Hello, /);
  await expect(
    child.getByRole("button", { name: "Search everything" }),
  ).toHaveCount(0);
  await child.close();
});

test("a young grade still makes Northwind East's children young", async ({
  page,
}) => {
  await signInWith(
    page,
    "teacher1.northwind-east@northwind.example.com",
    PASSWORD,
    "/today",
    "northwind-east",
  );
  await page.goto(`${portal("northwind-east")}/classes`);
  await untilHydrated(page);
  await page.getByRole("link", { name: "KG2A" }).first().click();
  await page.getByRole("tab", { name: "Students" }).click();
  await expect(
    page.getByRole("link", { name: "Sign-in badges" }),
  ).toBeVisible();
});
