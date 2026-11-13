import { expect, test } from "@playwright/test";

import { portal, signIn, untilHydrated } from "./fixtures/sign-in";

test("a teacher makes a group of a class's students, renames it, changes who is in it and removes it, in English and Arabic", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const name = `Readers ${crypto.randomUUID().slice(0, 6)}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "teacher");
  await page.goto("/classes");
  await untilHydrated(page);
  await page.getByRole("link", { name: "7A", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "7A", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Groups", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Groups" });
  await panel
    .getByRole("button", { name: "Add a group", exact: true })
    .first()
    .click();

  const sheet = page.getByRole("dialog", { name: "Add a group" });
  await sheet.getByRole("button", { name: "Add a group", exact: true }).click();
  await expect(
    sheet.getByText("Name the group in either language."),
  ).toBeVisible();
  await expect(sheet.getByText("Choose at least one student.")).toBeVisible();
  await sheet.getByRole("textbox", { name: "Name in English" }).fill(name);
  await sheet.getByRole("textbox", { name: "Name in Arabic" }).fill("القرّاء");
  const students = sheet.getByRole("checkbox");
  await expect(students).toHaveCount(6);
  await students.nth(0).check();
  await students.nth(1).check();
  await sheet.getByRole("button", { name: "Add a group", exact: true }).click();
  await expect(sheet).toBeHidden();
  const row = panel.getByRole("button", { name, exact: true });
  await expect(row).toBeVisible();

  await row.click();
  const change = page.getByRole("dialog", { name: `Change ${name}` });
  await change
    .getByRole("textbox", { name: "Name in English" })
    .fill(`${name} plus`);
  await change.getByRole("checkbox").nth(2).check();
  await change.getByRole("button", { name: "Save group", exact: true }).click();
  await expect(change).toBeHidden();
  await expect(
    panel.getByRole("button", { name: `${name} plus`, exact: true }),
  ).toBeVisible();

  await page
    .context()
    .addCookies([{ name: "language-tag", value: "ar", url: portal() }]);
  await page.reload();
  await untilHydrated(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const arabic = page.getByRole("tabpanel", { name: "المجموعات" });
  await expect(
    arabic.getByRole("button", { name: "القرّاء", exact: true }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await arabic
    .getByRole("button", { name: "إجراءات القرّاء", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "حذف المجموعة" }).click();
  const confirm = page.getByRole("dialog", { name: "حذف القرّاء؟" });
  await expect(
    confirm.getByText("يبقى ما سبق تحديده لهذه المجموعة مع طلابها.", {
      exact: false,
    }),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "حذف المجموعة" }).click();
  await expect(confirm).toBeHidden();
  await expect(
    arabic.getByRole("button", { name: "القرّاء", exact: true }),
  ).toHaveCount(0);
});
