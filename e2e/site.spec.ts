import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

test("an administrator publishes a bilingual page and visitors read it in either language", async ({
  browser,
  page,
}) => {
  const tag = crypto.randomUUID().slice(0, 6);
  const title = `Clubs ${tag}`;
  await signIn(page, "admin");
  await page.goto("/admin/site-page-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Title (English)" }).fill(title);
  await page
    .getByRole("textbox", { name: "Title (Arabic)" })
    .fill(`الأندية ${tag}`);
  await expect(page.getByRole("textbox", { name: "Address slug" })).toHaveValue(
    `clubs-${tag}`,
  );
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("menuitem", { name: "Words", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Heading, English" })
    .fill("After school");
  await page
    .getByRole("textbox", { name: "Heading, Arabic" })
    .fill("بعد المدرسة");
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Chess and robotics run on Tuesdays.");
  await page.locator("[contenteditable=true]").nth(1).click();
  await page.keyboard.type("الشطرنج والروبوتات يوم الثلاثاء.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/site$/);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/site/northwind/pages/clubs-${tag}`);
  await expect(
    visitor.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("heading", { level: 2, name: "After school" }),
  ).toBeVisible();
  await expect(
    visitor.getByText("Chess and robotics run on Tuesdays."),
  ).toBeVisible();

  await visitor.goto(`/site/northwind/pages/clubs-${tag}?lang=ar`);
  await expect(
    visitor.getByRole("heading", { level: 2, name: "بعد المدرسة" }),
  ).toBeVisible();
  await expect(
    visitor.getByText("الشطرنج والروبوتات يوم الثلاثاء."),
  ).toBeVisible();

  await visitor.goto("/site/northwind/news");
  await expect(
    visitor.getByRole("link", { name: /Welcome back/ }),
  ).toBeVisible();
  await visitorContext.close();
});
