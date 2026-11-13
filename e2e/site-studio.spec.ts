import type { Locator, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { portal, signIn } from "./fixtures/sign-in";

/** Opens the builder on a new page from a template, once its sections are drawn, in either language. */
async function openStudio(page: Page, panel: string) {
  await page.goto(`/site-page-editor?template=homeClassic&panel=${panel}`);
  await expect(page.locator("main .site-root h1").first()).toBeVisible();
}

async function within(inner: Locator, outer: Locator) {
  await expect
    .poll(async () => {
      const a = await inner.boundingBox();
      const b = await outer.boundingBox();
      if (!a || !b || a.width === 0) return false;
      return (
        a.x >= b.x - 1 &&
        a.y >= b.y - 1 &&
        a.x + a.width <= b.x + b.width + 1 &&
        a.y + a.height <= b.y + b.height + 1
      );
    })
    .toBe(true);
}

test("the add-section gallery draws each section whole within its card", async ({
  page,
}) => {
  await signIn(page, "admin");
  await openStudio(page, "sections");
  await page.getByRole("button", { name: "Add section" }).click();
  const dialog = page.getByRole("dialog", { name: "Add section" });
  const card = dialog.getByRole("listitem").filter({
    has: page.getByRole("button", { name: /^Add Hero:/ }),
  });
  const preview = card.locator("[inert]");
  const heading = preview.locator(".site-root h1, .site-root h2").first();
  await expect(heading).toHaveText(/\p{L}/u);
  await within(heading, preview);

  const split = card.getByRole("button", { name: "Split", exact: true });
  await split.focus();
  await expect(split).toHaveAttribute("aria-pressed", "true");
  await within(heading, preview);
});

test("the builder's left panels fit their width in English and Arabic", async ({
  page,
}) => {
  await signIn(page, "admin");
  for (const language of ["en", "ar"]) {
    await page
      .context()
      .addCookies([{ name: "language-tag", value: language, url: portal() }]);
    for (const panel of ["sections", "page", "styles", "frame"]) {
      await openStudio(page, panel);
      const rail = page.getByRole("tabpanel");
      if (panel === "frame")
        await within(rail.locator('a[href^="/settings"]'), rail);
      const fits = await rail.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      );
      expect(fits, `${panel} in ${language}`).toBe(true);
    }
  }
});

test("a school emphasises a heading's words from the button and the keyboard", async ({
  page,
}) => {
  await signIn(page, "admin");
  await openStudio(page, "sections");
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Add Text: Narrow" }).click();
  const heading = page.getByRole("textbox", { name: "Heading", exact: true });
  await heading.fill("Learn by doing");
  await heading.evaluate((element: HTMLInputElement) => {
    element.focus();
    element.setSelectionRange(9, 14);
  });
  await page.getByRole("button", { name: "Emphasise" }).click();
  await expect(heading).toHaveValue("Learn by *doing*");
  const canvas = page.getByRole("main", { name: "Page preview" });
  await expect(
    canvas.locator(".site-em", { hasText: /^doing$/ }).first(),
  ).toBeVisible();
  await expect(heading).toHaveAccessibleDescription(/doing/);
  await expect(page.getByRole("button", { name: "Emphasise" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await heading.press("Control+i");
  await expect(heading).toHaveValue("Learn by doing");
  await expect(canvas.locator(".site-em", { hasText: /^doing$/ })).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Arabic", exact: true }).click();
  await heading.fill("تعلّم بالتجربة");
  await heading.evaluate((element: HTMLInputElement) => {
    element.focus();
    element.setSelectionRange(6, 14, "backward");
  });
  await heading.press("Control+i");
  await expect(heading).toHaveValue("تعلّم *بالتجربة*");
  await expect(
    canvas.locator(".site-em", { hasText: "بالتجربة" }).first(),
  ).toBeVisible();
});

test("each item of a list is titled by what it holds", async ({ page }) => {
  await signIn(page, "admin");
  await openStudio(page, "sections");
  await page.getByRole("button", { name: "Add section" }).click();
  await page
    .getByRole("button", { name: /^Add Steps:/ })
    .first()
    .click();
  const steps = page.getByRole("group", { name: "Items", exact: true });
  const first = steps.locator("details > summary").first();
  await expect(first).not.toHaveText(/^Item \d/);
  await first.click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .first()
    .fill("Visit the school");
  await expect(first).toHaveText("Visit the school");
  await expect(
    steps.getByRole("button", { name: "Remove Visit the school" }),
  ).toBeVisible();
});
