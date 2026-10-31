import { expect, test } from "@playwright/test";

for (const locale of ["en", "ar"] as const) {
  test(`a parent can use the mobile workspace in ${locale}`, async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await context.addCookies([
      { name: "language-tag", value: "en", domain: "127.0.0.1", path: "/" },
    ]);
    await page.goto("/sign-in");
    await page
      .getByRole("textbox", { name: "Email or sign-in name" })
      .fill("parent@example.com");
    await page
      .getByRole("textbox", { name: "Password", exact: true })
      .fill("northwind1234");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL("**/family");
    await expect(page.locator("main#main")).toBeVisible();
    if (locale === "ar") {
      await page.getByRole("button", { name: "Change language" }).click();
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
      page.getByRole("button", {
        name: locale === "ar" ? "ابحث عن صفحة…" : "Find a page…",
        exact: true,
      }),
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
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "Email or sign-in name" })
    .fill("admin@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/admin");
  await expect(page.locator("main#main")).toBeVisible();
  await expect(
    page.getByRole("complementary").getByText("Farida LMS", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Northwind International College", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-desktop.png"),
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Find a page…", exact: true }),
  ).toBeEnabled();
  const sidebar = page.locator('[data-slot="sidebar"]');
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await expect(
    page.getByRole("button", { name: "Find a page…", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
});
