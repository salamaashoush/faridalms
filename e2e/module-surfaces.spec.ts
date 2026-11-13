import type { ModuleId } from "@faridalms/domain/modules";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { expect, test } from "@playwright/test";

import { freshSchool, signInTo } from "./fixtures/fresh-school";
import {
  ABSENT,
  absentWords,
  catalogue,
  shownWords,
} from "./fixtures/module-words";
import {
  chooseFromMenu,
  portal,
  signIn,
  untilHydrated,
} from "./fixtures/sign-in";

/** The modules this school has besides core. */
const KEPT = new Set<ModuleId>(["coursework", "attendance", "elearning"]);

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

/** Every module but those whose words a school of adults' courses has no use for. */
const WORDLESS: readonly ModuleId[] = [
  "school_years",
  "grade_levels",
  "homerooms",
  "families",
  "timetable",
  "badges",
  "early_years",
];

/**
 * In English a grade is also a mark, which coursework, the gradebook and
 * grading speak of throughout; the Arabic walk, where a grade level is
 * الصف and a mark is درجة, holds grade levels away from these pages.
 */
const ABSENT_BUT_MARKS = {
  en: /\b(years?|terms?|homerooms?|guardians?|parents?|famil(y|ies)|periods?)\b/gi,
  ar: ABSENT.ar,
};

/** The website's page templates written for families, as each card names itself without families and with them. */
const templateCards = (say: Record<string, string>) =>
  (
    [
      ["siteTemplateParents", "siteTemplateHintParents"],
      ["siteTemplateParentsEarlyYears", "siteTemplateHintParentsEarlyYears"],
      ["siteTemplateHomeCommunity", "siteTemplateHintHomeCommunity"],
    ] as const
  ).map(([label, hint]) => [
    `${say[`${label}Core`] ?? say[label]}: ${say[`${hint}Core`] ?? say[hint]}`,
    `${say[label]}: ${say[hint]}`,
  ]);

test("a school without years, grades, homerooms, families or a timetable words the surfaces of its other modules without them, in English and Arabic", async ({
  browser,
  page,
}) => {
  test.setTimeout(480_000);
  const school = await freshSchool(browser, { without: WORDLESS });
  const at = portal(school.slug);
  await signInTo(page, school, "admin");

  await page.goto(`${at}/students`);
  await untilHydrated(page);
  await page
    .getByRole("table")
    .getByRole("link", { name: "Salama Pupil", exact: true })
    .click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/);
  const studentPath = new URL(page.url()).pathname;

  const pages = [
    "/students",
    `${studentPath}?tab=consents`,
    `${studentPath}?tab=health`,
    "/attendance",
    "/attendance?tab=reported",
    "/settings?section=attendance",
    "/settings?section=grading",
    "/gradebook",
    "/health-changes",
    "/standards/map",
    "/modules",
    "/event-editor",
    "/school-days",
  ];
  const found: string[] = [];
  for (const language of ["en", "ar"] as const) {
    const say = catalogue(language);
    if (language === "ar")
      await page
        .context()
        .addCookies([{ name: "language-tag", value: "ar", url: at }]);
    for (const path of pages)
      found.push(
        ...(await absentWords(
          page,
          `${at}${path}`,
          language,
          ABSENT_BUT_MARKS,
        )),
      );

    // Leaving: how long the student still signs in, and where they go.
    await page.goto(`${at}${studentPath}`);
    await untilHydrated(page);
    await chooseFromMenu(
      page.getByRole("button", { name: say.docMoreActions }),
      page.getByRole("menuitem", { name: say.studentLeave }),
    );
    const leaving = page.getByRole("dialog", { name: say.studentLeave });
    await expect(leaving).toBeVisible();
    found.push(...(await shownWords(page, `${studentPath} leaving`, language)));
    await page.keyboard.press("Escape");
    await expect(leaving).toBeHidden();

    // The website's page templates are named for the students the school
    // has; what each template writes is the school's to change.
    await page.goto(`${at}/site-page-editor`);
    await expect(
      page.getByRole("heading", { level: 1, name: say.siteChooseTemplate }),
    ).toBeVisible();
    for (const [neutral] of templateCards(say))
      await expect(
        page.getByRole("button", { name: neutral, exact: true }),
      ).toBeVisible();
    for (const [, kept] of templateCards(say))
      await expect(
        page.getByRole("button", { name: kept, exact: true }),
      ).toHaveCount(0);

    // Letters greet whoever applied, by the field that names them.
    await page.goto(`${at}/admissions/letters`);
    await untilHydrated(page);
    await page
      .getByRole("table")
      .getByRole("link", {
        name: language === "en" ? "Offer of a place" : "عرض مقعد",
        exact: true,
      })
      .click();
    const letter = page.getByRole("main");
    await expect(letter).toContainText(
      language === "en" ? "Dear {applicant}," : "إلى {applicant}،",
    );
    await expect(letter).not.toContainText("{family}");
  }
  expect(found).toEqual([]);
});

test("a school with every module keeps the words of its years, families and grades on the same surfaces", async ({
  page,
}) => {
  const at = portal("northwind");
  await signIn(page, "admin");
  for (const language of ["en", "ar"] as const) {
    const say = catalogue(language);
    if (language === "ar")
      await page
        .context()
        .addCookies([{ name: "language-tag", value: "ar", url: at }]);
    const kept = [
      ["/students", "adminStudentsCaption"],
      ["/attendance", "attAdminHint"],
      ["/settings?section=attendance", "attRuleNoticeDelay"],
      ["/settings?section=grading", "gradingProgrammesHint"],
      ["/health-changes", "healthChangesHint"],
      ["/standards/map", "curriculumMapHint"],
    ] as const;
    for (const [path, key] of kept) {
      await page.goto(`${at}${path}`);
      await untilHydrated(page);
      await expect(
        page.getByText(say[key] ?? key, { exact: true }),
      ).toBeVisible();
    }
    await page.goto(`${at}/site-page-editor`);
    await expect(
      page.getByRole("heading", { level: 1, name: say.siteChooseTemplate }),
    ).toBeVisible();
    for (const [, card] of templateCards(say))
      await expect(
        page.getByRole("button", { name: card, exact: true }),
      ).toBeVisible();
    await page.goto(`${at}/admissions/letters`);
    await untilHydrated(page);
    await page
      .getByRole("table")
      .getByRole("link", {
        name: language === "en" ? "Offer of a place" : "عرض مقعد",
        exact: true,
      })
      .click();
    await expect(page.getByRole("main")).toContainText(
      language === "en" ? "Dear {family}," : "إلى {family}،",
    );
  }
});
