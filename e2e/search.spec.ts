import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

test("the office finds a student from anywhere, and medical notes are never searched", async ({
  page,
}) => {
  await signIn(page, "admin");
  await untilHydrated(page);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search" });
  const box = dialog.getByRole("searchbox", { name: "Search" });
  await box.fill("Sabry");
  await expect(dialog.getByRole("heading", { name: "Students" })).toBeVisible();
  await dialog
    .getByRole("region", { name: "Students" })
    .getByRole("link", { name: /^Yasmin Sabry/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);

  await page.getByRole("button", { name: "Search everything" }).first().click();
  await expect(
    dialog.getByRole("heading", { name: "Opened recently" }),
  ).toBeVisible();
  await expect(
    dialog
      .getByRole("region", { name: "Opened recently" })
      .getByRole("link", { name: /^Yasmin Sabry/ }),
  ).toHaveCount(1);

  await box.fill("Peanuts");
  await expect(
    dialog.getByText("Nothing you can open matches “Peanuts”"),
  ).toBeVisible();
  await box.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Peanuts/);
  await expect(
    page.getByText("Nothing you can open matches “Peanuts”"),
  ).toBeVisible();
});

test("the results page groups every kind and opens one kind in full", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/search?q=museum");
  await untilHydrated(page);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "Announcements" }),
  ).toBeVisible();
  await expect(main.getByRole("heading", { name: "Events" })).toBeVisible();
  await page.getByRole("tab", { name: "Events" }).click();
  await expect(page).toHaveURL(/kind=events/);
  await main
    .getByRole("region", { name: "Events" })
    .getByRole("link", { name: /Egyptian Museum/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/calendar\?.*event=[a-f0-9-]+/);
  await expect(
    page.getByRole("dialog").getByText("Egyptian Museum"),
  ).toBeVisible();
});

test("a family on a phone searches in Arabic and finds its announcements but no students", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInWith(
    page,
    "parent1007@northwind.example.com",
    PASSWORD,
    "/family",
  );
  await context.addCookies([
    { name: "language-tag", value: "ar", url: page.url() },
  ]);
  await page.reload();
  await untilHydrated(page);
  await page.getByRole("button", { name: "ابحث في كل شيء" }).first().click();
  const dialog = page.getByRole("dialog", { name: "البحث" });
  const box = dialog.getByRole("searchbox", { name: "البحث" });
  await box.fill("صبري");
  await expect(
    dialog.getByText("لا يوجد ما يمكنك فتحه يطابق «صبري»"),
  ).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "الطلاب" })).toHaveCount(0);

  await box.fill("museum");
  await expect(dialog.getByRole("heading", { name: "الإعلانات" })).toBeVisible();
  await dialog.getByRole("button", { name: "إلغاء" }).click();
  await expect(dialog).toBeHidden();
});
