import { expect, test } from "@playwright/test";

import { PASSWORD, signInWith, untilHydrated } from "./fixtures/sign-in";

// The seed's second teacher teaches Arabic to every grade. Each browser sets
// its own assignment, so no two runs edit the same brief.
const TEACHER = "teacher2.northwind@northwind.example.com";

test("two open editors of one brief see each other's writing", async ({
  browser,
  page,
}) => {
  const title = `Shared plan ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/assignment-editor");
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Read the poem.");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.locator("#work-due").fill(`${tomorrow}T14:00`);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  const id = /\/assignments\/([a-f0-9-]+)/.exec(page.url())?.[1] ?? "";

  await page.goto(`/assignment-editor?id=${id}`);
  await untilHydrated(page);
  const mine = page.locator("[contenteditable=true]").first();
  await expect(mine).toContainText("Read the poem.");

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signInWith(other, TEACHER, PASSWORD, "/today");
  await other.goto(`/assignment-editor?id=${id}`);
  await untilHydrated(other);
  const theirs = other.locator("[contenteditable=true]").first();
  await expect(theirs).toContainText("Read the poem.");

  await mine.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Then learn it by heart.");
  await expect(theirs).toContainText("Then learn it by heart.");
  await otherContext.close();
});
