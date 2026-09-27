import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser sends its own notice, so parallel projects never read each
// other's.
test("an urgent notice reaches a family's notifications and opens the announcement", async ({
  browser,
  page,
  browserName,
}) => {
  const title = `Early closing ${browserName} ${crypto.randomUUID().slice(0, 6)}`;
  await signIn(page, "admin");
  await page.goto("/admin/announcement-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("School closes at noon today.");
  await page.getByRole("combobox", { name: "Urgency" }).click();
  await page.getByRole("option", { name: "Urgent" }).click();
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(page).toHaveURL(/\/announcements\/[a-f0-9-]+/);

  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await signInWith(family, "parent1007@northwind.example.com", PASSWORD, "/family");
  await family.goto("/notifications");
  await untilHydrated(family);
  const notice = family.getByRole("link", { name: new RegExp(title) });
  await expect(notice).toContainText("Urgent announcement");
  await notice.click();
  await expect(
    family.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();

  await family.goto("/notifications");
  await untilHydrated(family);
  await expect(
    family.getByRole("link", { name: new RegExp(title) }),
  ).not.toContainText("Unread");
  await familyContext.close();
});

// Each browser changes a different family's settings.
const FAMILY: Record<string, string> = {
  chromium: "parent1001@northwind.example.com",
  firefox: "parent1002@northwind.example.com",
  webkit: "parent1003@northwind.example.com",
};

test("a family's choices are kept", async ({ page, browserName }) => {
  await signInWith(
    page,
    FAMILY[browserName] ?? "parent1004@northwind.example.com",
    PASSWORD,
    "/family",
  );
  await page.goto("/notification-preferences");
  await untilHydrated(page);
  await page.getByRole("combobox", { name: "Email" }).first().click();
  await page.getByRole("option", { name: "Off" }).click();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await page.reload();
  await untilHydrated(page);
  await expect(
    page.getByRole("combobox", { name: "Email" }).first(),
  ).toHaveText(/Off/);
});
