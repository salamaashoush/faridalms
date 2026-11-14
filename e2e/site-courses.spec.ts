import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import type { Api } from "./fixtures/api";

import { apiAs } from "./fixtures/api";
import { workingYear } from "./fixtures/school";
import {
  PASSWORD,
  portal,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Classes of the test's own, since other specs add to the school's list
// while this one runs and a place in it names a different class each time.
async function ownClass(api: Api, title: string) {
  const year = await workingYear(api);
  const saved = await api.classes.save({
    code: `SC-${crypto.randomUUID().slice(0, 6)}`,
    titleEn: title,
    titleAr: "",
    teacherIds: [],
    startsOn: year.startsOn,
    endsOn: addDays(year.endsBefore, -1),
    parts: { year: { yearId: year.id } },
  });
  return saved.id;
}

test("a school shows a class on its website and a visitor reads it in a courses section, in both languages and at phone width", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const tag = crypto.randomUUID().slice(0, 6);
  const publicTitle = `Robotics evenings ${tag}`;
  const arabicTitle = `أمسيات الروبوتات ${tag}`;
  const admin = await apiAs("admin");
  const shownTitle = `Salama robotics ${tag}`;
  const hiddenTitle = `Salama chess ${tag}`;
  const shownId = await ownClass(admin, shownTitle);
  await ownClass(admin, hiddenTitle);
  await signIn(page, "admin");
  await page.goto(`/classes/${shownId}`);
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: shownTitle }),
  ).toBeVisible();

  const onWebsite = page.getByRole("region", { name: "On the website" });
  await onWebsite
    .getByRole("checkbox", { name: "Show this class on the website" })
    .check();
  await onWebsite
    .getByRole("textbox", { name: "Public title in English" })
    .fill(publicTitle);
  await onWebsite
    .getByRole("textbox", { name: "Public title in Arabic" })
    .fill(arabicTitle);
  await onWebsite
    .getByRole("textbox", { name: "Description in English" })
    .fill(`Build and program a small robot, one evening a week (${tag}).`);
  await onWebsite
    .getByRole("textbox", { name: "Description in Arabic" })
    .fill(`ابنِ روبوتًا صغيرًا وبرمجه، أمسية كل أسبوع (${tag}).`);
  await onWebsite.getByRole("button", { name: "Save website details" }).click();
  await expect(page.getByText("Website details saved.")).toBeVisible();

  await page.goto("/website");
  await untilHydrated(page);
  await page.getByRole("link", { name: "New page" }).click();
  await page.getByRole("button", { name: /^Blank/ }).click();
  await page
    .getByRole("textbox", { name: "Title (English)" })
    .fill(`Courses ${tag}`);
  await page
    .getByRole("textbox", { name: "Title (Arabic)" })
    .fill(`الدورات ${tag}`);
  await page.getByRole("tab", { name: "Sections" }).click();
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Add Courses: Cards" }).click();
  const preview = page.getByRole("main", { name: "Page preview" });
  await expect(
    preview.getByRole("heading", { level: 3, name: publicTitle }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Published", { exact: true }).first(),
  ).toBeVisible();

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const visitor = await context.newPage();
    await visitor.goto(`/site/northwind/pages/courses-${tag}`);
    await expect(
      visitor.getByRole("heading", { level: 3, name: publicTitle }),
    ).toBeVisible();
    await expect(
      visitor.getByText(
        `Build and program a small robot, one evening a week (${tag}).`,
      ),
    ).toBeVisible();
    await expect(visitor.getByText(hiddenTitle, { exact: true })).toHaveCount(
      0,
    );

    await visitor.goto(`/site/northwind/pages/courses-${tag}?lang=ar`);
    await expect(visitor.locator("html [dir=rtl]").first()).toBeVisible();
    await expect(
      visitor.getByRole("heading", { level: 3, name: arabicTitle }),
    ).toBeVisible();
    await expect(
      visitor.getByText(`ابنِ روبوتًا صغيرًا وبرمجه، أمسية كل أسبوع (${tag}).`),
    ).toBeVisible();
    const width = await visitor.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(width).toBeLessThanOrEqual(viewport.width);
    await context.close();
  }
});

test("a school without the website keeps its classes to itself: the record has no website part", async ({
  page,
}) => {
  const at = portal("lanternfield");
  await signInWith(
    page,
    "admin.lanternfield@lanternfield.example.com",
    PASSWORD,
    "/today",
    "lanternfield",
  );
  await page.goto(`${at}/classes`);
  await untilHydrated(page);
  await page.getByRole("table").locator(`a[href*="/classes/"]`).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "On the website" }),
  ).toHaveCount(0);
  await expect(page.getByText("Show this class on the website")).toHaveCount(0);
});
