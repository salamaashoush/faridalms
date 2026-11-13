import { expect, test } from "@playwright/test";

import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { portal, signIn, untilHydrated } from "./fixtures/sign-in";

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
  } finally {
    await northwind.close();
  }
});
