import { expect, test } from "@playwright/test";

import { API_ORIGIN, signedInApi } from "./fixtures/api";
import {
  chooseFromMenu,
  PASSWORD,
  portal,
  signIn,
  untilHydrated,
} from "./fixtures/sign-in";

test("an administrator builds a bilingual page from sections and visitors read it in either language", async ({
  browser,
  page,
}) => {
  const tag = crypto.randomUUID().slice(0, 6);
  const title = `Clubs ${tag}`;
  await signIn(page, "admin");
  await page.goto("/website");
  await untilHydrated(page);
  await page.getByRole("link", { name: "New page" }).click();
  await page.getByRole("button", { name: /^Blank/ }).click();

  await page.getByRole("textbox", { name: "Title (English)" }).fill(title);
  await page
    .getByRole("textbox", { name: "Title (Arabic)" })
    .fill(`الأندية ${tag}`);
  await expect(page.getByRole("textbox", { name: "Address slug" })).toHaveValue(
    `clubs-${tag}`,
  );

  await page.getByRole("tab", { name: "Sections" }).click();
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Add Text: Narrow" }).click();
  const heading = page.getByRole("textbox", { name: "Heading", exact: true });
  await heading.fill("After school");
  const body = page.locator("[contenteditable=true]").first();
  await expect(body).toContainText("Write a few paragraphs");
  await body.fill("Chess and robotics run on Tuesdays.");
  await expect(
    page.getByRole("main", { name: "Page preview" }).getByText("After school"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Arabic", exact: true }).click();
  await heading.fill("بعد المدرسة");
  await expect(body).toContainText("اكتب بضع فقرات");
  await body.fill("الشطرنج والروبوتات يوم الثلاثاء.");

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Published", { exact: true }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/site-page-editor\?id=/);

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/site/northwind/pages/clubs-${tag}`);
  await expect(
    visitor.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("heading", { level: 2, name: "After school" }),
  ).toBeVisible();
  await expect(
    visitor.getByText("Chess and robotics run on Tuesdays."),
  ).toBeVisible();

  await visitor.goto(`/site/northwind/pages/clubs-${tag}?lang=ar`);
  await expect(
    visitor.getByRole("heading", { level: 2, name: "بعد المدرسة" }),
  ).toBeVisible();
  await expect(
    visitor.getByText("الشطرنج والروبوتات يوم الثلاثاء."),
  ).toBeVisible();

  await visitor.goto("/site/northwind/news");
  await expect(
    visitor.getByRole("link", { name: /Welcome back/ }),
  ).toBeVisible();
  await visitorContext.close();
});

test("a new page from a template draws in the browser as the server sent it", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (/hydrat|Minified React error #4(18|19|23|25)/i.test(message.text()))
      problems.push(message.text());
  });
  await signIn(page, "admin");
  await page.goto("/site-page-editor?template=homeClassic");
  await expect(
    page.getByRole("main", { name: "Page preview" }).getByRole("heading", {
      level: 1,
    }),
  ).toBeVisible();
  const sections = page.getByRole("tab", { name: "Sections" });
  await expect(async () => {
    await sections.click();
    await expect(sections).toHaveAttribute("aria-selected", "true", {
      timeout: 1000,
    });
  }).toPass();
  expect(problems).toEqual([]);
});

test("the home page opens with its hero and the school's actions", async ({
  page,
}) => {
  await page.goto("/site/northwind");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Site navigation" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Apply" }).first()).toBeVisible();
  await page.getByRole("link", { name: "العربية" }).first().click();
  await expect(page).toHaveURL(/lang=ar/);
  await expect(page.locator("html [dir=rtl]").first()).toBeVisible();
});

test("a stale address on a school's website shows the school's own not-found page", async ({
  page,
}) => {
  const missing = await page.goto("/site/northwind/pages/no-such-page");
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Site navigation" });
  await expect(menu.first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Apply" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Go home" }).click();
  await expect(page).toHaveURL(/\/site\/northwind$/);

  const nowhere = await page.goto("/site/northwind/no-such-place?lang=ar");
  expect(nowhere?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "الصفحة غير موجودة" }),
  ).toBeVisible();
  await expect(page.locator("html [dir=rtl]").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "الأخبار" }).first(),
  ).toBeVisible();
});

test("an administrator adds, changes and removes the website's social links one at a time", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/website?tab=settings");
  await untilHydrated(page);
  const links = page.getByRole("region", { name: "Social links" });
  await links.getByRole("button", { name: "Add link" }).click();
  const adding = page.getByRole("dialog", { name: "Add link" });
  await adding.getByRole("combobox", { name: /^Network/ }).click();
  await page.getByRole("option", { name: "Instagram", exact: true }).click();
  const address = adding.getByRole("textbox", { name: "Address" });
  await address.fill("http://instagram.com/northwind");
  await adding.getByRole("button", { name: "Add link" }).click();
  await expect(address).toHaveAccessibleDescription(/https/);
  await address.fill("https://instagram.com/northwind");
  await adding.getByRole("button", { name: "Add link" }).click();
  await expect(adding).toBeHidden();
  await expect(page.getByText("Website settings saved")).toBeVisible();

  const row = links.getByRole("row", { name: /^Instagram/ });
  await row.getByRole("button", { name: "Instagram", exact: true }).click();
  const changing = page.getByRole("dialog", {
    name: "Change the Instagram link",
  });
  await changing
    .getByRole("textbox", { name: "Address" })
    .fill("https://instagram.com/northwind.school");
  await changing.getByRole("button", { name: "Save link" }).click();
  await expect(changing).toBeHidden();
  await page.reload();
  await untilHydrated(page);
  await expect(links.getByRole("row", { name: /^Instagram/ })).toContainText(
    "https://instagram.com/northwind.school",
  );

  await chooseFromMenu(
    links.getByRole("button", { name: "Actions for Instagram" }),
    page.getByRole("menuitem", { name: "Remove" }),
  );
  await page
    .getByRole("dialog", { name: "Remove the Instagram link?" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(links.getByRole("row", { name: /^Instagram/ })).toHaveCount(0);
});

test("a family sends an enquiry and the school finds it in the enquiry inbox", async ({
  browser,
  page,
}) => {
  const name = `Family ${crypto.randomUUID().slice(0, 6)}`;
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.clock.install();
  await visitor.goto("/site/northwind/pages/admissions");
  await visitor.getByRole("textbox", { name: "Your name" }).fill(name);
  await visitor
    .getByRole("textbox", { name: "Email" })
    .fill("family@example.com");
  await visitor
    .getByRole("textbox", { name: /Message/ })
    .fill("Is there a place in grade 4 next term?");
  // A person takes a while to fill the form; faster sends are dropped as scripts.
  await visitor.clock.fastForward(5000);
  await visitor.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    visitor.getByText("Thank you. We will reply within two working days."),
  ).toBeVisible();
  await visitorContext.close();

  await signIn(page, "admin");
  await page.goto("/admissions/enquiries");
  await untilHydrated(page);
  await expect(page.getByRole("link", { name })).toBeVisible();
});

// Both change Acme's website, so they take turns.
test.describe("acme's website", () => {
  test.describe.configure({ mode: "serial" });

  test("a school whose website is not open shows its own page, which leads to its portal", async ({
    page,
  }) => {
    const { api } = await signedInApi(
      "principal.acme@acme.example.com",
      PASSWORD,
      "acme",
    );
    const live = async (open: boolean) => {
      const { settings } = await api.site.overview();
      await api.site.saveSettings({
        expectedVersion: settings.version,
        theme: settings.theme,
        chrome: settings.chrome,
        live: open,
        bilingual: settings.bilingual,
        taglineEn: settings.taglineEn,
        taglineAr: settings.taglineAr,
        socialLinks: settings.socialLinks,
        bannerEn: settings.bannerEn,
        bannerAr: settings.bannerAr,
        bannerTone: settings.bannerTone,
        bannerUntil: settings.bannerUntil ?? "",
      });
    };
    await live(false);
    try {
      const response = await page.goto("/site/acme");
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { name: "This website is not open yet" }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "Go to the school's portal" })
        .click();
      await expect(page).toHaveURL(`${portal("acme")}/sign-in`);
    } finally {
      await live(true);
    }
  });

  test("a school's logo is the icon of its website and its sign-in page", async ({
    page,
  }) => {
    const { api, token } = await signedInApi(
      "principal.acme@acme.example.com",
      PASSWORD,
      "acme",
    );
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
    ]);
    const file = await api.files.initiate({
      purpose: "document_media",
      name: "logo.png",
      mediaType: "image/png",
      sizeBytes: png.byteLength,
    });
    const put = await fetch(`${API_ORIGIN}/v1/files/${file.id}/content`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "x-farida-school": "acme" },
      body: png,
    });
    expect(put.ok).toBe(true);
    const logo = async (logoFileId: string) => {
      const profile = await api.school.profile();
      await api.school.saveProfile({
        expectedVersion: profile.version,
        nameEn: profile.nameEn ?? "",
        nameAr: profile.nameAr ?? "",
        identifier: profile.identifier ?? "",
        timeZone: profile.timeZone ?? "Africa/Cairo",
        defaultLocale: profile.defaultLocale,
        weekStart: profile.weekStart,
        weekendDays: profile.weekendDays,
        secondaryCalendar: profile.secondaryCalendar ?? "",
        phone: profile.phone ?? "",
        email: profile.email ?? "",
        logoFileId,
      });
    };
    await logo(file.id);
    try {
      const icon = page.locator('link[rel="icon"]');
      for (const url of ["/site/acme", `${portal("acme")}/sign-in`]) {
        await page.goto(url);
        await expect(icon).toHaveCount(1);
        await expect(icon).toHaveAttribute("href", /^\/public-media\/p\//);
      }
    } finally {
      await logo("");
    }
  });
});
