import { expect, test } from "@playwright/test";

import { OWNER, SALES, signInAs } from "../fixtures/console";

test("an owner gives a newcomer a role, which takes effect at once", async ({
  browser,
  page,
}) => {
  const salesContext = await browser.newContext();
  const sales = await salesContext.newPage();
  await signInAs(sales, SALES);
  await expect(sales).toHaveURL(/\/no-role$/);
  await expect(
    sales.getByRole("heading", { name: "No role yet" }),
  ).toBeVisible();

  await signInAs(page, OWNER);
  await page.getByRole("link", { name: "Operators" }).click();
  const card = page.getByRole("form", { name: SALES.name });
  await card.getByRole("checkbox", { name: /^Sales/ }).check();
  await card.getByLabel("Why").fill("Joined to sell to schools");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Operator saved.")).toBeVisible();

  await sales.reload();
  await expect(sales).toHaveURL(/\/$/);
  await expect(sales.getByRole("heading", { name: "Schools" })).toBeVisible();
  await expect(sales.getByRole("link", { name: "Operators" })).toHaveCount(0);
  await salesContext.close();
});

test("the console keeps an owner", async ({ page }) => {
  await signInAs(page, OWNER);
  await page.getByRole("link", { name: "Operators" }).click();
  const card = page.getByRole("form", { name: OWNER.name });
  await card.getByRole("checkbox", { name: /^Owner/ }).uncheck();
  await card.getByRole("checkbox", { name: /^Support/ }).check();
  await card.getByLabel("Why").fill("Trying to leave no owner");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("alert")).toHaveText(
    "The console needs at least one active owner. Make someone else an owner first.",
  );
});
