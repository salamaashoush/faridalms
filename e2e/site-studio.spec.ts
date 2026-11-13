import type { Locator, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { apiClient, signedInApi } from "./fixtures/api";
import {
  PASSWORD,
  portal,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

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

/** Opens the ready-made sites from a site that has pages, once their cards are drawn. */
async function openStarters(page: Page, origin: string) {
  await page.goto(`${origin}/website`);
  await untilHydrated(page);
  const open = page.getByRole("button", { name: "Ready-made sites" });
  const dialog = page.getByRole("dialog", {
    name: "Start from a ready-made site",
  });
  await expect(async () => {
    if (!(await dialog.isVisible())) await open.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expect(
    dialog.getByRole("button", { name: "Use this site" }).first(),
  ).toBeVisible();
  return dialog;
}

test("a school previews every page of a ready-made site in either language, at a desktop's or a phone's width", async ({
  page,
}) => {
  await signIn(page, "admin");
  const starters = await openStarters(page, portal());
  await starters
    .getByRole("button", { name: "Preview Established school" })
    .click();
  const preview = page.getByRole("dialog", {
    name: "Preview of Established school",
  });
  const pages = preview
    .getByRole("navigation", { name: "Pages of this site" })
    .getByRole("button");
  await expect(pages).toHaveText([
    "Home",
    "About",
    "Academics",
    "Admissions",
    "Visit",
    "Contact",
  ]);
  const site = preview.locator("[data-preview] .site-root").first();
  await expect(site.locator("h1").first()).toHaveText(/\p{L}/u);
  await expect(site).toHaveAttribute("lang", "en");

  const home = await site.locator("h1").first().textContent();
  await pages.filter({ hasText: "About" }).click();
  await expect(pages.filter({ hasText: "About" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(site.locator("h1").first()).not.toHaveText(home ?? "");

  await preview.getByRole("button", { name: "Arabic", exact: true }).click();
  await expect(site).toHaveAttribute("lang", "ar");
  await expect(site).toHaveAttribute("dir", "rtl");
  await expect(site.locator("h1").first()).toHaveText(/\p{Script=Arabic}/u);

  const width = () => site.evaluate((element) => element.style.width);
  expect(await width()).toBe("1440px");
  await preview.getByRole("button", { name: "Phone width" }).click();
  await expect.poll(width).toBe("390px");
});

// Chromium and WebKit run side by side on one database, so each replaces and
// keeps pages of Acme's the other does not touch.
const STARTER_PAGES: Record<string, { replace: string; keep: string }> = {
  chromium: { replace: "About", keep: "Visit" },
  webkit: { replace: "Academics", keep: "Contact" },
  firefox: { replace: "Admissions", keep: "Home" },
};

test("a school keeps one of its pages and replaces another with a ready-made site's, which becomes a draft", async ({
  page,
}, info) => {
  const chosen = STARTER_PAGES[info.project.name] ?? STARTER_PAGES.chromium;
  if (!chosen) throw new Error("no pages for this browser");
  const email = "principal.acme@acme.example.com";
  const { api } = await signedInApi(email, PASSWORD, "acme");
  const before = await api.site.overview();
  const row = (title: string) => {
    const found = before.pages.find(
      (entry) => entry.slug === title.toLowerCase(),
    );
    if (!found) throw new Error(`Acme has no ${title} page`);
    return found;
  };
  const replaced = row(chosen.replace);
  const kept = row(chosen.keep);
  const replacedBefore = await api.site.page({ id: replaced.id });
  const keptBefore = await api.site.page({ id: kept.id });
  const visitor = apiClient({ school: "acme" }).site;
  const served = () =>
    visitor.publicSitePage({
      school: "acme",
      locale: "en",
      slug: replaced.isHome ? "" : replaced.slug,
    });
  const servedBefore = await served();

  await signInWith(page, email, PASSWORD, "/today", "acme");
  const starters = await openStarters(page, portal("acme"));
  await starters
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", {
        name: "Established school",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Use this site" })
    .click();
  const review = page.getByRole("dialog", {
    name: "Use Established school",
  });
  await expect(
    review.getByRole("listitem").filter({ hasText: chosen.keep }),
  ).toContainText("You already have a page here");
  await expect(
    review
      .getByRole("group", {
        name: `${chosen.keep}: keep yours or replace it`,
      })
      .getByRole("button", { name: "Keep mine" }),
  ).toHaveAttribute("aria-pressed", "true");
  await review
    .getByRole("group", { name: `${chosen.replace}: keep yours or replace it` })
    .getByRole("button", { name: "Replace" })
    .click();
  await expect(review).toContainText("Version history");
  await review
    .getByRole("checkbox", { name: "Also use the starter's theme and header" })
    .click();
  await review
    .getByRole("button", { name: "Use this site and replace 1 page" })
    .click();
  await expect(review).toBeHidden();

  try {
    const after = await api.site.overview();
    expect(after.settings.theme).toEqual(before.settings.theme);
    expect(after.pages.find((entry) => entry.id === replaced.id)).toMatchObject(
      { state: "published", changed: true },
    );
    const draft = await api.site.page({ id: replaced.id });
    expect(draft.content.sections).not.toEqual(replacedBefore.content.sections);
    expect(draft.content.sections.length).toBeGreaterThan(0);
    const keptAfter = await api.site.page({ id: kept.id });
    expect(keptAfter.content).toEqual(keptBefore.content);
    expect(keptAfter.version).toBe(keptBefore.version);
    expect((await served()).sections).toEqual(servedBefore.sections);
  } finally {
    // The page's earlier words come back from its history, as a school would bring them back.
    const host = { hostType: "site_page", hostId: replaced.id };
    const { versions } = await api.documents.history(host);
    const words = async (locale: "en" | "ar") => {
      const version = versions.find(
        (entry) => entry.reason === "before_replace" && entry.locale === locale,
      );
      if (!version) throw new Error(`nothing kept in ${locale}`);
      const restored = await api.documents.restore({
        ...host,
        documentVersion: version.documentVersion,
        locale,
      });
      if (restored.kind !== "page") throw new Error("not a page");
      return restored.page;
    };
    const current = await api.site.overview();
    const now = current.pages.find((entry) => entry.id === replaced.id);
    const english = await words("en");
    expect(english.sections).toEqual(replacedBefore.content.sections);
    await api.site.savePage({
      id: replaced.id,
      expectedVersion: now?.version ?? 0,
      parentId: replaced.parentId ?? "",
      slug: replaced.slug,
      titleEn: replaced.titleEn,
      titleAr: replaced.titleAr,
      inMenu: replaced.inMenu,
      indexed: replaced.indexed,
      content: english,
      translation: await words("ar"),
    });
  }
});

test("plan cards draw each plan and mark the one most chosen in words", async ({
  page,
}) => {
  await signIn(page, "admin");
  await openStudio(page, "sections");
  await page.getByRole("button", { name: "Add section" }).click();
  const gallery = page.getByRole("dialog", { name: "Add section" });
  const fees = gallery.getByRole("listitem").filter({
    has: page.getByRole("button", { name: /^Add Fees and dates:/ }),
  });
  const plans = fees.getByRole("button", { name: "Plans", exact: true });
  await plans.focus();
  await expect(fees.locator("[inert] li[data-chosen]")).toContainText(
    "Most chosen",
  );
  await plans.click();
  const canvas = page.getByRole("main", { name: "Page preview" });
  const cards = canvas
    .locator("[data-section]")
    .filter({ has: page.locator("li[data-chosen]") })
    .locator("li.site-card");
  await expect(cards).toHaveCount(3);
  const chosen = canvas.locator("li[data-chosen]");
  await expect(chosen).toHaveCount(1);
  await expect(chosen).toContainText("Most chosen");
  await expect(chosen).toContainText("Monthly");
  await expect(cards.filter({ hasText: "Most chosen" })).toHaveCount(1);
  const items = page.getByRole("group", { name: "Items", exact: true });
  await expect(items).toContainText("3 of 4");
  await items.locator("details > summary").first().click();
  await expect(
    items.getByRole("textbox", { name: "What it includes" }).first(),
  ).toHaveValue(/\n/);

  await page.getByRole("button", { name: "Arabic", exact: true }).click();
  await expect(canvas.locator("li[data-chosen]")).toContainText(
    "الأكثر اختيارًا",
  );
});

test("the themes are grouped by character, the current theme's group open and the theme marked", async ({
  page,
}) => {
  await signIn(page, "admin");
  await openStudio(page, "styles");
  const rail = page.getByRole("tabpanel");
  const group = (name: string) =>
    rail.locator("details").filter({
      has: page.locator("summary", { hasText: name }),
    });
  await expect(rail.locator("details summary")).toContainText([
    "Classic",
    "Modern",
    "Bold",
    "Warm",
  ]);
  await expect(group("Modern")).toHaveAttribute("open", "");
  await expect(group("Classic")).not.toHaveAttribute("open", "");
  const current = group("Modern").getByRole("button", { name: "Meridian" });
  await expect(current).toHaveAttribute("aria-pressed", "true");
  await expect(current).toContainText("Current");

  await group("Bold").locator("summary").click();
  await group("Bold").getByRole("button", { name: "Reel" }).click();
  const reel = group("Bold").getByRole("button", { name: "Reel" });
  await expect(reel).toHaveAttribute("aria-pressed", "true");
  await expect(reel).toContainText("Current");
  await expect(group("Bold")).toHaveAttribute("open", "");
  await expect(group("Modern")).not.toHaveAttribute("open", "");
});
