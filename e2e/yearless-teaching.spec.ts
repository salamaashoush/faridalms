import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import {
  chooseFromMenu,
  PASSWORD,
  portal,
  untilHydrated,
} from "./fixtures/sign-in";

test("a school without school years sets, marks and returns work, and opens a lesson, in a class of its own", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const school = await freshSchool(browser, { without: ["school_years"] });
  const { api } = await signedInApi(school.admin, PASSWORD, school.slug);
  const { today } = await api.identity.currentUser();
  const teacherApi = (await signedInApi(school.teacher, PASSWORD, school.slug))
    .api;
  const { id: teacherId } = await teacherApi.identity.currentUser();
  const klass = await api.classes.save({
    code: "PY-101",
    titleEn: "Python from scratch",
    titleAr: "",
    teacherIds: [teacherId],
    startsOn: addDays(today, -7),
    endsOn: addDays(today, 90),
  });
  const {
    rows: [pupil],
  } = await api.people.students({ q: "Salama Pupil" });
  if (!pupil) throw new Error("the school has no pupil");
  await api.classes.enrol({ studentId: pupil.id, classId: klass.id });

  // The teacher sets work for the class; with no year there is no term.
  const title = "Hello, world";
  await signInTo(page, school, "teacher");
  await page.goto(`${portal(school.slug)}/assignment-editor`);
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page
    .getByRole("option", { name: /Python from scratch/ })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Write a program that greets the class.");
  await expect(page.locator("#work-term")).toHaveCount(0);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  const recordUrl = page.url().split("?")[0] ?? "";

  // The student hands it in.
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInTo(student, school, "student");
  await student.goto(`${portal(school.slug)}/me/assignments`);
  await untilHydrated(student);
  await student.getByRole("link", { name: title }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await student.locator("[contenteditable=true]").first().click();
  await student.keyboard.type('print("Hello, class")');
  await student.getByRole("button", { name: "Hand in", exact: true }).click();
  await student
    .getByRole("dialog")
    .getByRole("button", { name: "Hand in", exact: true })
    .click();
  await expect(
    student.getByRole("region", { name: "Handed in" }).getByText("Attempt 1"),
  ).toBeVisible();

  // The teacher marks and returns it.
  await page.goto(`${recordUrl}?tab=work`);
  await untilHydrated(page);
  const row = page
    .getByRole("tabpanel")
    .getByRole("row", { name: /Salama Pupil/ });
  await expect(row.getByText("Handed in", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Grade", exact: true }).click();
  await expect(page).toHaveURL(/\/grading/);
  await untilHydrated(page);
  // The grade sheet opens once the page answers its button.
  await expect(async () => {
    await page.getByRole("button", { name: "Grade", exact: true }).click();
    await expect(page.locator("#grade-score")).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await page.locator("#grade-score").fill("8");
  await page.locator("#grade-feedback").fill("It greets everyone.");
  await page.getByRole("button", { name: "Return and next" }).click();
  await expect(page).toHaveURL(/tab=work/);
  await expect(
    page
      .getByRole("tabpanel")
      .getByRole("row", { name: /Salama Pupil/ })
      .getByText("Returned", { exact: true }),
  ).toBeVisible();

  await student.reload();
  await untilHydrated(student);
  await expect(student.getByText("It greets everyone.")).toBeVisible();
  await expect(student.getByText("8 / 10")).toBeVisible();

  // The gradebook keeps a running grade, with no term to choose or release.
  await page.goto(`${portal(school.slug)}/gradebook?classId=${klass.id}`);
  await untilHydrated(page);
  await expect(
    page.getByRole("columnheader", { name: "Running grade" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Term grade" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("table").getByText("80%", { exact: true }),
  ).toBeVisible();

  // A module of lessons, set for the class and opened to its students.
  const module = `Strings ${crypto.randomUUID().slice(0, 6)}`;
  await page.goto(`${portal(school.slug)}/module-editor`);
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Module title" }).fill(module);
  await page.getByRole("combobox", { name: "Classes" }).click();
  await page
    .getByRole("option", { name: /Python from scratch/ })
    .first()
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/modules\/[a-f0-9-]+/);
  await page.getByRole("link", { name: "Add lesson" }).click();
  await expect(page).toHaveURL(/\/lesson-editor/);
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Lesson title" }).fill("Quotes");
  await page.locator("#lesson-body").click();
  await page.keyboard.type("A string sits between quotes.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("link", { name: "Quotes" })).toBeVisible();
  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Open to students" }),
  );
  await expect(page.getByText("Module open to students")).toBeVisible();

  // With no year, the modules page offers no year map.
  await page.goto(`${portal(school.slug)}/modules`);
  await untilHydrated(page);
  await expect(page.getByRole("link", { name: module })).toBeVisible();
  const more = page.getByRole("button", { name: "More actions" });
  if ((await more.count()) > 0) {
    await more.click();
    await expect(page.getByRole("menuitem", { name: "Year map" })).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
  }
  await page.goto(`${portal(school.slug)}/year-map`);
  await expect(
    page.getByRole("heading", { name: "Page not found", exact: true }),
  ).toBeVisible();

  await student.goto(`${portal(school.slug)}/me/modules`);
  await untilHydrated(student);
  await student.getByRole("link", { name: module }).click();
  await student.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: "Quotes" }),
  ).toBeVisible();
  await expect(
    student.getByText("A string sits between quotes."),
  ).toBeVisible();
  await studentContext.close();
});
