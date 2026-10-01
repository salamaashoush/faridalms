import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

test("an administrator sets how long leavers' records are kept", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/privacy");
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { name: "Data protection", level: 1 }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Retention" }).click();
  await expect(page).toHaveURL(/tab=retention/);
  await page.getByRole("button", { name: /Change/ }).click();
  const sheet = page.getByRole("dialog", { name: "How long records are kept" });
  await sheet.getByRole("combobox", { name: /^Students/ }).click();
  await page.getByRole("option", { name: "Until an age" }).click();
  await sheet.getByRole("spinbutton", { name: "Age" }).fill("16");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Enter an age from 18 to 100.")).toBeVisible();
  await sheet.getByRole("spinbutton", { name: "Age" }).fill("25");
  await sheet
    .getByRole("spinbutton", { name: /Staff, years after leaving/ })
    .fill("6");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Until age 25")).toBeVisible();
  await expect(page.getByText("6 years after leaving")).toBeVisible();

  await page.getByRole("tab", { name: "Review" }).click();
  await expect(page.getByText(/nothing comes up for review/)).toBeHidden();
});
