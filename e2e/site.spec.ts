import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

test("an administrator builds a bilingual page from sections and visitors read it in either language", async ({
  browser,
  page,
}) => {
  const tag = crypto.randomUUID().slice(0, 6);
  const title = `Clubs ${tag}`;
  await signIn(page, "admin");
  await page.goto("/admin/site");
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

test("a family sends an enquiry and the school finds it in the website's enquiries", async ({
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
  await page.goto("/admin/site?tab=enquiries");
  await untilHydrated(page);
  await expect(page.getByText(name).first()).toBeVisible();
});
