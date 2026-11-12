import type { ModuleId } from "@faridalms/domain/modules";
import type { Page } from "@playwright/test";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { portal, untilHydrated } from "./fixtures/sign-in";

/** The modules this school has besides core. */
const KEPT = new Set<ModuleId>(["coursework", "attendance", "elearning"]);

/**
 * Words of the modules this school does not have: school years and terms,
 * grade levels, homerooms, families and guardians, the timetable's periods.
 */
const ABSENT = {
  en: /\b(years?|terms?|grades?|homerooms?|guardians?|parents?|famil(y|ies)|periods?)\b/gi,
  ar: /(^|[^\p{L}])(العام|عام|السنة|سنة|أعوام|الفصل الدراسي|الفصول الدراسية|الصف|صفوف|فصل التسجيل|فصول التسجيل|ولي الأمر|أولياء|الوالدين|والد|الأسرة|أسرة|الأسر|العائلة|عائلة|الحصة|حصة|الحصص)(?=$|[^\p{L}])/gu,
};

/**
 * The page's words: its navigation, header and main column. The plan's
 * catalogue of modules names every module the product has, on or off, so
 * a school knows what exists; it is left out. An age in years is no school
 * year.
 */
const wordsOf = (page: Page) =>
  page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    for (const each of body.querySelectorAll("[data-module-catalogue]"))
      each.remove();
    document.body.append(body);
    body.style.position = "absolute";
    const text = body.innerText;
    body.remove();
    return text;
  });

const AGE = /^\d+ (years|سنة|سنوات)$/;

/**
 * Coursework's grade scale is a scale of marks, not a grade level: its
 * label, exactly as the catalogues word it, is no word of grade levels.
 */
const catalogue = (language: "en" | "ar") =>
  JSON.parse(
    readFileSync(
      new URL(`../messages/${language}.json`, import.meta.url),
      "utf8",
    ),
  ) as Record<string, string>;
const MARKS = new Set(
  (["en", "ar"] as const).map((language) => catalogue(language).gradingScale),
);

/** The words of those modules a page shows, each in the line it stands in. */
async function absentWords(page: Page, path: string, language: "en" | "ar") {
  await page.goto(path);
  await untilHydrated(page);
  await expect(page.locator("main")).toBeVisible();
  // Sections that read their data after the page has drawn are part of it.
  await page.waitForLoadState("networkidle");
  return (await wordsOf(page))
    .split("\n")
    .filter(
      (line) =>
        !AGE.test(line.trim()) &&
        !MARKS.has(line.trim()) &&
        line.match(ABSENT[language]),
    )
    .map((line) => `${path}: ${line.trim()}`);
}

test("a school of core, coursework, attendance and e-learning names no year, grade, homeroom, family or period on its main pages, in English or Arabic", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const school = await freshSchool(browser, {
    without: MODULE_IDS.filter((id) => !KEPT.has(id)),
  });
  const at = portal(school.slug);
  await signInTo(page, school, "admin");

  await page.goto(`${at}/classes`);
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add class", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Class name in English" })
    .fill("Robotics club");
  await page
    .getByRole("textbox", { name: "Class name in Arabic" })
    .fill("نادي الروبوتات");
  await page.getByRole("textbox", { name: /^Class code/ }).fill("ROBO-1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/classes(\?|$)/);
  await page
    .getByRole("table")
    .getByRole("link", { name: "Robotics club", exact: true })
    .click();
  await expect(page).toHaveURL(/\/classes\/[0-9a-f-]{36}/);
  const classPath = new URL(page.url()).pathname;

  await page.goto(`${at}/students`);
  await untilHydrated(page);
  await page
    .getByRole("table")
    .getByRole("link", { name: "Salama Pupil", exact: true })
    .click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/);
  const studentPath = new URL(page.url()).pathname;

  const pages = [
    "/today",
    "/settings",
    "/search?q=Salama",
    classPath,
    `${classPath}?tab=students`,
    studentPath,
    `${studentPath}?tab=enrollment`,
  ];
  const found: string[] = [];
  for (const path of pages)
    found.push(...(await absentWords(page, `${at}${path}`, "en")));

  // The settings' tabs are the school's own and its modules'.
  await page.goto(`${at}/settings`);
  await untilHydrated(page);
  await expect(page.getByRole("tab")).toHaveText([
    "School",
    "Subject catalogue",
    "Attendance",
    "Grading",
    "Roles and permissions",
    "Language model",
  ]);

  // Badges and families each give a way to a first sign-in; without them, slips.
  await page.goto(`${at}/students`);
  await untilHydrated(page);
  await page
    .getByRole("table")
    .getByRole("checkbox", { name: "Select Salama Pupil", exact: true })
    .check();
  await page
    .getByRole("group", { name: "Actions for the selected rows" })
    .getByRole("button", { name: "Create sign-ins" })
    .click();
  const ways = page.getByRole("dialog", { name: "Create sign-ins" });
  await expect(ways.getByRole("radio")).toHaveCount(1);
  await expect(
    ways.getByRole("radio", { name: "Printed slips" }),
  ).toBeChecked();

  await page
    .context()
    .addCookies([{ name: "language-tag", value: "ar", url: at }]);
  for (const path of pages)
    found.push(...(await absentWords(page, `${at}${path}`, "ar")));
  expect(found).toEqual([]);
});
