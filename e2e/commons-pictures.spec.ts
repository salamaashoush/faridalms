import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

test("a school turns on Wikimedia Commons for its staff's picture search, and off again", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/settings");
  await untilHydrated(page);
  const section = page
    .locator("form")
    .filter({ hasText: "Pictures from Wikimedia Commons" });
  const allow = section.getByRole("checkbox", {
    name: "Let staff search Wikimedia Commons",
  });
  await expect(allow).not.toBeChecked();
  await allow.click();
  await section.getByRole("button", { name: "Save" }).click();
  await expect(section.getByRole("status")).toContainText(
    "Staff can now search Wikimedia Commons.",
  );

  try {
    await page.goto("/media");
    await untilHydrated(page);
    await page.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: "Find a free picture" }).click();
    await expect(
      page.getByRole("button", { name: "Wikimedia Commons" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Symbols and emoji" }),
    ).toHaveAttribute("aria-pressed", "true");
  } finally {
    await page.goto("/settings");
    await untilHydrated(page);
    await allow.click();
    await section.getByRole("button", { name: "Save" }).click();
    await expect(section.getByRole("status")).toContainText(
      "Staff no longer search Wikimedia Commons.",
    );
  }
});
