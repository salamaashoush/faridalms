import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser sends its own post, so parallel projects never read each
// other's.
test("the office sends school news in two languages and a family reads it in Arabic", async ({
  browser,
  page,
  browserName,
}) => {
  const title = `Book week (${browserName} ${crypto.randomUUID().slice(0, 6)})`;
  await signIn(page, "admin");
  await page.goto("/news-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.locator("#news-body").click();
  await page.keyboard.type("## Every class visits the library");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bring a book to swap on Thursday.");
  await page.getByRole("checkbox", { name: "Also write it in Arabic" }).click();
  await page.getByRole("tab", { name: "العربية" }).click();
  await page.locator("#news-translation").click();
  await page.keyboard.type("## ");
  await page.keyboard.insertText("أسبوع الكتاب");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("أحضروا كتابًا للتبادل يوم الخميس.");
  await page
    .getByRole("checkbox", { name: "Checked against the original" })
    .click();
  await expect(
    page.getByText(/^Checked against the original by/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(page).toHaveURL(/\/news\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  const postUrl = page.url();

  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await signInWith(
    family,
    "parent1007@northwind.example.com",
    PASSWORD,
    "/family",
  );
  await family.goto("/news");
  await untilHydrated(family);
  await family.getByRole("link", { name: title }).click();
  await untilHydrated(family);
  await expect(
    family.getByRole("heading", { name: "Every class visits the library" }),
  ).toBeVisible();
  await family.getByRole("tab", { name: "العربية" }).click();
  await expect(
    family
      .getByRole("tabpanel", { name: "العربية" })
      .getByRole("heading", { name: "أسبوع الكتاب" }),
  ).toBeVisible();
  // Opening it marks it read in the background; the list stops calling it
  // unread once that has landed.
  await expect(async () => {
    await family.goto("/news");
    await expect(
      family.getByRole("link", { name: title, exact: true }),
    ).toBeVisible({ timeout: 2000 });
  }).toPass();
  await familyContext.close();

  await page.goto(postUrl);
  await untilHydrated(page);
  await page.getByRole("button", { name: /of \d+ read/ }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("table", { name: "Who it reached" })
      .getByRole("row", { name: /Sara Sabry/ }),
  ).not.toContainText("Not read");
});
