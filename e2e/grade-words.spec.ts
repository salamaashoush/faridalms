import { expect, test } from "@playwright/test";

import { apiAs, signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { PASSWORD, portal, signIn, untilHydrated } from "./fixtures/sign-in";

test("a school that calls its grades levels reads Level in English and المستوى in Arabic, while Northwind still reads Grade", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const school = await freshSchool(browser, { without: ["school_years"] });
  await signInTo(page, school, "admin");
  const open = async (path: string) => {
    await page.goto(`${portal(school.slug)}${path}`);
    await untilHydrated(page);
  };

  await open("/settings?section=grades");
  await expect(
    page.getByRole("tab", { name: "Grades and levels", selected: true }),
  ).toBeVisible();
  const word = page.getByRole("radiogroup", {
    name: "What the school calls them",
  });
  await expect(word.getByRole("radio", { name: "Grades" })).toBeChecked();
  await word.getByRole("radio", { name: "Levels" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Levels", selected: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "The school's levels, in order" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add a level" }).first(),
  ).toBeVisible();

  await open("/students");
  await expect(
    page.getByRole("columnheader", { name: "Level", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Grade", exact: true }),
  ).toHaveCount(0);
  await open("/class-editor");
  await expect(page.getByRole("combobox", { name: /^Level/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Grade/ })).toHaveCount(0);
  await open("/announcement-editor");
  await expect(
    page.getByText(
      "A class or level reaches its students, their families and its teachers.",
    ),
  ).toBeVisible();

  await page
    .context()
    .addCookies([
      { name: "language-tag", value: "ar", url: portal(school.slug) },
    ]);
  await open("/students");
  await expect(
    page.getByRole("columnheader", { name: "المستوى", exact: true }),
  ).toBeVisible();
  await open("/settings?section=grades");
  await expect(
    page.getByRole("tab", { name: "المستويات", selected: true }),
  ).toBeVisible();
  await open("/announcement-editor");
  await expect(
    page.getByText("يصل الفصل أو المستوى إلى طلابه وأسرهم ومعلميه."),
  ).toBeVisible();

  const northwind = await browser.newContext();
  try {
    const other = await northwind.newPage();
    await signIn(other, "admin");
    await other.goto(`${portal()}/students`);
    await untilHydrated(other);
    await expect(
      other.getByRole("columnheader", { name: "Grade", exact: true }),
    ).toBeVisible();
    await other.goto(`${portal()}/settings?section=grades`);
    await untilHydrated(other);
    await expect(
      other.getByRole("tab", { name: "Grades and levels", selected: true }),
    ).toBeVisible();
    await other.goto(`${portal()}/announcement-editor`);
    await untilHydrated(other);
    await expect(
      other.getByText(
        "A class or grade reaches its students, their families and its teachers.",
      ),
    ).toBeVisible();
    const {
      rows: [pupil],
    } = await (await apiAs("admin")).people.students({ pageSize: 25, page: 1 });
    if (!pupil) throw new Error("Northwind has no student");
    await other.goto(`${portal()}/students/${pupil.id}?tab=enrollment`);
    await untilHydrated(other);
    await expect(
      other.getByText(
        "The student's grade in each school year at this school.",
      ),
    ).toBeVisible();
    await other.goto(`${portal()}/settings?section=grading`);
    await untilHydrated(other);
    await expect(
      other.getByText(
        "Which grade levels grade on which scale, and how their work weighs in a term grade.",
      ),
    ).toBeVisible();
    await other.goto(`${portal()}/settings?section=reading`);
    await untilHydrated(other);
    await expect(
      other.getByRole("table", {
        name: "English norms by grade and time of year",
      }),
    ).toBeVisible();
    await other.goto(`${portal()}/admissions/intake-editor`);
    await untilHydrated(other);
    await expect(other.getByRole("combobox", { name: /^Grade/ })).toBeVisible();
  } finally {
    await northwind.close();
  }
});

test("a school with years that calls its grades levels reads Level through the rollover and a student's years", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const school = await freshSchool(browser);
  const { api } = await signedInApi(school.admin, PASSWORD, school.slug);
  await api.gradeLevels.setTerm({ term: "level", expectedVersion: 0 });
  const {
    rows: [pupil],
  } = await api.people.students({ q: "Salama Pupil" });
  if (!pupil) throw new Error("the fresh school has no student");
  await signInTo(page, school, "admin");
  const record = `${portal(school.slug)}/students/${pupil.id}?tab=enrollment`;

  await page.goto(record);
  await untilHydrated(page);
  await expect(
    page.getByText("The student's level in each school year at this school."),
  ).toBeVisible();
  await page.goto(`${portal(school.slug)}/settings?section=grading`);
  await untilHydrated(page);
  await expect(
    page.getByText(
      "Which levels grade on which scale, and how their work weighs in a term grade.",
    ),
  ).toBeVisible();
  await page.goto(`${portal(school.slug)}/settings?section=reading`);
  await untilHydrated(page);
  await expect(
    page.getByRole("table", {
      name: "English norms by level and time of year",
    }),
  ).toBeVisible();
  await page.goto(`${portal(school.slug)}/admissions/intake-editor`);
  await untilHydrated(page);
  await expect(page.getByRole("combobox", { name: /^Level/ })).toBeVisible();
  await expect(
    page.getByText("How many children the level can take."),
  ).toBeVisible();

  await page
    .context()
    .addCookies([
      { name: "language-tag", value: "ar", url: portal(school.slug) },
    ]);
  await page.goto(record);
  await untilHydrated(page);
  await expect(
    page.getByText("مستوى الطالب في كل عام دراسي في هذه المدرسة."),
  ).toBeVisible();
  await page.goto(`${portal(school.slug)}/settings?section=grading`);
  await untilHydrated(page);
  await expect(
    page.getByText(
      "أي المستويات تُقيَّم بأي سلم، وكيف تُوزن أعمالها في تقدير الفصل الدراسي.",
    ),
  ).toBeVisible();
  await page.goto(`${portal(school.slug)}/settings?section=reading`);
  await untilHydrated(page);
  await expect(
    page.getByRole("table", { name: /حسب المستوى ووقت العام$/ }).first(),
  ).toBeVisible();
  await page.goto(`${portal(school.slug)}/admissions/intake-editor`);
  await untilHydrated(page);
  await expect(page.getByRole("combobox", { name: /^المستوى/ })).toBeVisible();
});
