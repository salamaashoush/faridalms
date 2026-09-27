import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser adds its own event on its own day, so parallel projects never
// cancel each other's.
const DAY: Record<string, string> = {
  chromium: "2026-11-10",
  firefox: "2026-11-11",
  webkit: "2026-11-12",
};

test("the office adds an event for families, who see it and then see it called off", async ({
  browser,
  page,
  browserName,
}) => {
  const title = `Book swap (${browserName} ${crypto.randomUUID().slice(0, 6)})`;
  const day = DAY[browserName] ?? "2026-11-13";
  await signIn(page, "admin");
  await page.goto("/admin/event-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("textbox", { name: "Where" }).fill("Library");
  await page.getByLabel("Starts on").fill(day);
  await page.getByLabel("Starts at").fill("13:00");
  await page.getByLabel("Ends at").fill("14:00");
  await page.getByRole("combobox", { name: "To" }).click();
  await page.getByRole("option", { name: "Families" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/calendar\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();

  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await signInWith(family, "parent1007@northwind.example.com", PASSWORD, "/family");
  await family.goto("/calendar?month=2026-11&view=agenda");
  await untilHydrated(family);
  await family.getByRole("link", { name: title }).click();
  await expect(
    family.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(family.getByText("Library")).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).last().click();
  await page.getByRole("menuitem", { name: "Cancel event" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel event" })
    .click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();

  await family.reload();
  await untilHydrated(family);
  await expect(family.getByText("Cancelled", { exact: true })).toBeVisible();
  await familyContext.close();
});
