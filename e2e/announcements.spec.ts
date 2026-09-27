import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser sends its own announcement, so parallel projects never
// acknowledge each other's.
test("the office asks families to acknowledge a notice and sees who did", async ({
  browser,
  page,
  browserName,
}) => {
  const title = `Sports day kit (${browserName} ${crypto.randomUUID().slice(0, 6)})`;
  await signIn(page, "admin");
  await page.goto("/admin/announcement-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Please bring trainers and a water bottle.");
  await page.getByRole("checkbox", { name: "Ask for acknowledgement" }).click();
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(page).toHaveURL(/\/announcements\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  const announcementUrl = page.url();

  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await signInWith(family, "parent1007@northwind.example.com", PASSWORD, "/family");
  await family.goto("/announcements");
  await untilHydrated(family);
  await family.getByRole("link", { name: title }).click();
  await untilHydrated(family);
  await family.getByRole("button", { name: "Acknowledge" }).click();
  await expect(family.getByText(/You acknowledged this/)).toBeVisible();
  await familyContext.close();

  await page.goto(announcementUrl);
  await untilHydrated(page);
  await expect(
    page
      .getByRole("table", { name: "Who it reached" })
      .getByRole("row", { name: /Sara Sabry/ }),
  ).not.toContainText("Not acknowledged");
});
