import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { PASSWORD, portal, untilHydrated } from "./fixtures/sign-in";

test("a school without homerooms makes a class of its own, enrols a student, and shows no homeroom anywhere", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const school = await freshSchool(browser, { without: ["homerooms"] });
  const { api } = await signedInApi(school.admin, PASSWORD, school.slug);
  const { today } = await api.identity.currentUser();
  const year = await api.years.save({
    titleEn: "Salama's first year",
    titleAr: "",
    startsOn: addDays(today, -20),
    endsOn: addDays(today, 200),
    terms: [],
  });

  await signInTo(page, school, "admin");
  await page.goto(`${portal(school.slug)}/classes`);
  await untilHydrated(page);
  await expect(page.getByRole("tab", { name: "Homerooms" })).toHaveCount(0);
  await page.getByRole("link", { name: "Add class", exact: true }).click();
  await expect(page).toHaveURL(/\/class-editor/);
  await page
    .getByRole("textbox", { name: "Class name in English" })
    .fill("Python from scratch");
  await page
    .getByRole("textbox", { name: "Class name in Arabic" })
    .fill("بايثون من البداية");
  await page.getByRole("textbox", { name: /^Class code/ }).fill("PY-101");
  await page.getByRole("button", { name: "Add teacher", exact: true }).click();
  await expect(page.getByRole("combobox", { name: /^Teacher/ })).toContainText(
    "Salama Teacher",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/classes(\?|$)/);

  await page
    .getByRole("table")
    .getByRole("link", { name: "Python from scratch", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Python from scratch",
      exact: true,
    }),
  ).toBeVisible();
  const teachers = page.getByRole("region", { name: "Teachers" });
  await expect(teachers.getByText("Salama Teacher")).toBeVisible();
  await expect(teachers.getByText("Teacher", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Students", exact: true }).click();
  const roster = page.getByRole("region", { name: "Students" });
  await roster
    .getByRole("button", { name: "Add student", exact: true })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("combobox", { name: /^Student/ }).click();
  await page.getByRole("combobox", { name: /^Search/ }).fill("Salama Pupil");
  await page.getByRole("option", { name: "Salama Pupil", exact: true }).click();
  await sheet.getByRole("button", { name: "Add student", exact: true }).click();
  await expect(
    page.getByText("Salama Pupil joined Python from scratch", { exact: true }),
  ).toBeVisible();
  await expect(
    roster.getByRole("link", { name: "Salama Pupil", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/homeroom/i)).toHaveCount(0);

  await roster.getByRole("link", { name: "Salama Pupil", exact: true }).click();
  await page.getByRole("tab", { name: "Enrollment", exact: true }).click();
  const classes = page.getByRole("region", { name: "Classes" });
  await expect(
    classes.getByRole("link", { name: "Python from scratch", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Homeroom" })).toHaveCount(0);
  await expect(page.getByText(/homeroom/i)).toHaveCount(0);

  await page.goto(`${portal(school.slug)}/homeroom-editor?year=${year.id}`);
  await expect(
    page.getByRole("heading", { name: "Page not found", exact: true }),
  ).toBeVisible();

  const teacher = await browser.newPage();
  await signInTo(teacher, school, "teacher");
  await teacher.goto(`${portal(school.slug)}/classes`);
  await untilHydrated(teacher);
  const mine = teacher
    .getByRole("table")
    .getByRole("row")
    .filter({ hasText: "Python from scratch" });
  await expect(mine).toContainText("Teacher");
  await teacher.close();
});

test("a school without homerooms carries its classes, with their students, into the next year", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const school = await freshSchool(browser, { without: ["homerooms"] });
  const { api } = await signedInApi(school.admin, PASSWORD, school.slug);
  const { today } = await api.identity.currentUser();
  const days = { startsOn: addDays(today, -20), endsOn: addDays(today, 200) };
  const next = { startsOn: addDays(today, 260), endsOn: addDays(today, 560) };
  const [source, target] = await Promise.all([
    api.years.save({
      titleEn: "Salama's first year",
      titleAr: "",
      ...days,
      terms: [],
    }),
    api.years.save({
      titleEn: "Salama's next year",
      titleAr: "",
      ...next,
      terms: [],
    }),
  ]);
  const klass = await api.classes.save({
    code: "PY-101",
    titleEn: "Python from scratch",
    titleAr: "",
    teacherIds: [],
    ...days,
    parts: { year: { yearId: source.id } },
  });
  const {
    rows: [pupil],
  } = await api.people.students({ q: "Salama Pupil" });
  if (!pupil) throw new Error("the school has no pupil");
  await api.classes.enrol({ studentId: pupil.id, classId: klass.id });

  await signInTo(page, school, "admin");
  await page.goto(
    `${portal(school.slug)}/rollover?source=${source.id}&target=${target.id}`,
  );
  await untilHydrated(page);
  const row = page.getByRole("group", { name: "Python from scratch" });
  await expect(
    row.getByRole("checkbox", { name: "Continue Python from scratch" }),
  ).toBeChecked();
  await expect(
    row.getByRole("checkbox", { name: "Its 1 staying student joins it." }),
  ).toBeChecked();
  await expect(page.getByText(/homeroom/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Review and apply" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply rollover" })
    .click();
  await expect(
    page.getByText("The new year's classes and placements are ready."),
  ).toBeVisible();

  const carried = await api.classes.directory({
    q: "Python from scratch",
    views: { year: target.id },
  });
  const [made] = carried.rows;
  if (!made) throw new Error("the rollover made no class");
  expect(made.id).not.toBe(klass.id);
  const record = await api.classes.record({ id: made.id, on: next.startsOn });
  expect(record.runs).toEqual({
    from: next.startsOn,
    to: addDays(next.endsOn, 1),
  });
  expect(record.roster.map((student) => student.userId)).toEqual([pupil.id]);
});
