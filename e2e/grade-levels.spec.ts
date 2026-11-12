import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import {
  chooseFromMenu,
  PASSWORD,
  portal,
  untilHydrated,
} from "./fixtures/sign-in";

test("a school without grade levels is asked for no grade anywhere", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const school = await freshSchool(browser, { without: ["grade_levels"] });
  await signInTo(page, school, "admin");
  const open = async (path: string) => {
    await page.goto(`${portal(school.slug)}${path}`);
    await untilHydrated(page);
  };

  await open("/class-editor");
  await expect(
    page.getByRole("textbox", { name: "Class name in English" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Grade/ })).toHaveCount(0);

  await open("/students");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Grade", exact: true }),
  ).toHaveCount(0);
  await open("/student-editor");
  await expect(
    page.getByRole("textbox", { name: "Student reference" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Grade/ })).toHaveCount(0);

  await open("/event-editor");
  await page.getByRole("combobox", { name: "Audience 1" }).click();
  await expect(page.getByRole("option", { name: "Families" })).toBeVisible();
  await expect(page.getByRole("option", { name: "A grade" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await open("/admissions/intake-editor");
  await expect(
    page.getByRole("textbox", { name: "Name in English" }),
  ).toBeVisible();
  await expect(page.getByLabel("Learners start on")).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Grade/ })).toHaveCount(0);

  await open("/settings");
  await expect(page.getByRole("tab").first()).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Grades and levels" }),
  ).toHaveCount(0);
});

test("a school keeps its own levels in order, places a class and a student in them, and stops using one nobody holds", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const school = await freshSchool(browser, { without: ["school_years"] });
  const { api } = await signedInApi(school.admin, PASSWORD, school.slug);
  await signInTo(page, school, "admin");
  await page.goto(`${portal(school.slug)}/settings?section=grades`);
  await untilHydrated(page);
  await expect(
    page.getByRole("tab", { name: "Grades and levels", selected: true }),
  ).toBeVisible();

  const levels = page.getByRole("table", {
    name: "The school's grades and levels, in order",
  });
  const add = async (name: string, code: string) => {
    await page
      .getByRole("button", { name: "Add a grade or level" })
      .first()
      .click();
    const sheet = page.getByRole("dialog", { name: "Add a grade or level" });
    await sheet.getByRole("textbox", { name: "Name in English" }).fill(name);
    await sheet.getByRole("textbox", { name: /^Code/ }).fill(code);
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(
      levels.getByRole("row", { name: new RegExp(name) }),
    ).toBeVisible();
  };
  await add("Salama starters", "salama-starters");
  await add("Salama advanced", "salama-advanced");
  await add("Salama spare", "salama-spare");

  const names = async () =>
    (await levels.getByRole("row").allInnerTexts()).flatMap(
      (text) => text.match(/Salama \w+/)?.[0] ?? [],
    );
  await chooseFromMenu(
    levels.getByRole("button", { name: "Actions for Salama advanced" }),
    page.getByRole("menuitem", { name: "Move up" }),
  );
  await expect
    .poll(names)
    .toEqual(["Salama advanced", "Salama starters", "Salama spare"]);
  await expect(page.getByRole("menu")).toHaveCount(0);

  await chooseFromMenu(
    levels.getByRole("button", { name: "Actions for Salama starters" }),
    page.getByRole("menuitem", { name: "Rename" }),
  );
  const rename = page.getByRole("dialog", { name: "Rename" });
  await rename
    .getByRole("textbox", { name: "Name in English" })
    .fill("Salama beginners");
  await rename.getByRole("button", { name: "Save", exact: true }).click();
  await expect(rename).toBeHidden();
  await expect
    .poll(names)
    .toEqual(["Salama advanced", "Salama beginners", "Salama spare"]);

  // The class editor offers the school's levels, and the list shows the class's.
  await page.goto(`${portal(school.slug)}/class-editor`);
  await untilHydrated(page);
  await page
    .getByRole("textbox", { name: "Class name in English" })
    .fill("Python for starters");
  await page
    .getByRole("textbox", { name: "Class name in Arabic" })
    .fill("بايثون للمبتدئين");
  await page.getByRole("textbox", { name: /^Class code/ }).fill("PY-1");
  await page.getByRole("combobox", { name: /^Grade/ }).click();
  await page
    .getByRole("option", { name: "Salama beginners", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/classes(\?|$)/);
  await page.getByRole("tab", { name: "All classes" }).click();
  await expect(
    page.getByRole("table").getByRole("row", { name: /Python for starters/ }),
  ).toContainText("Salama beginners");

  // A student given a level is found by it.
  const { grades } = await api.gradeLevels.options();
  const beginners = grades.find((row) => row.labelEn === "Salama beginners");
  const advanced = grades.find((row) => row.labelEn === "Salama advanced");
  const {
    rows: [pupil],
  } = await api.people.students({ q: "Salama Pupil" });
  if (!beginners || !advanced || !pupil)
    throw new Error("the levels or the pupil are missing");
  const { today } = await api.identity.currentUser();
  await api.gradeLevels.setStudentGrade({
    studentId: pupil.id,
    gradeId: beginners.id,
    from: today,
  });
  await page.goto(`${portal(school.slug)}/students?grade=${beginners.id}`);
  await untilHydrated(page);
  await expect(
    page.getByRole("columnheader", { name: "Grade", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByRole("row", { name: /Salama Pupil/ }),
  ).toContainText("Salama beginners");
  await page.goto(`${portal(school.slug)}/students?grade=${advanced.id}`);
  await untilHydrated(page);
  await expect(
    page.getByRole("table").getByRole("row", { name: /Salama Pupil/ }),
  ).toHaveCount(0);

  // A level held is kept; one nobody holds stops being used.
  await page.goto(`${portal(school.slug)}/settings?section=grades`);
  await untilHydrated(page);
  const retire = async (name: string) => {
    await expect(page.getByRole("menu")).toHaveCount(0);
    await chooseFromMenu(
      levels.getByRole("button", { name: `Actions for ${name}` }),
      page.getByRole("menuitem", { name: "Stop using" }),
    );
    await page
      .getByRole("dialog", { name: `Stop using ${name}?` })
      .getByRole("button", { name: "Stop using" })
      .click();
  };
  await retire("Salama beginners");
  await expect(
    page.getByText(
      "Classes or students still hold this grade. Move them first.",
    ),
  ).toBeVisible();
  await expect(
    levels.getByRole("row", { name: /Salama beginners/ }),
  ).not.toContainText("No longer used");
  await retire("Salama spare");
  await expect(levels.getByRole("row", { name: /Salama spare/ })).toContainText(
    "No longer used",
  );
});
