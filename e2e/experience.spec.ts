import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

const LAUNCHER = { en: "Search everything", ar: "ابحث في كل شيء" } as const;

for (const locale of ["en", "ar"] as const) {
  test(`a parent can use the mobile workspace in ${locale}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "parent");
    await untilHydrated(page);
    if (locale === "ar") {
      await page
        .getByRole("button", { name: "Open menu", exact: true })
        .click();
      await page.getByRole("button", { name: "Account", exact: true }).click();
      await page.getByRole("menuitem", { name: "Language" }).click();
      await page.getByRole("menuitem", { name: "العربية" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(`parent-mobile-${locale}.png`),
      fullPage: true,
    });
    await expect(
      page.getByRole("button", { name: LAUNCHER[locale], exact: true }).first(),
    ).toBeEnabled();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("the desktop workspace shows the platform and school as separate identities", async ({
  page,
}, testInfo) => {
  await signIn(page, "admin");
  await untilHydrated(page);
  const sidebar = page.locator('[data-slot="sidebar"]');
  await expect(sidebar.getByText("Farida LMS", { exact: true })).toBeVisible();
  await expect(
    sidebar.getByText("Northwind International College", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
});
