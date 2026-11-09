import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

test("a section kept as a shared section shows on another page, and a change saved there reaches the published page", async ({
  browser,
  page,
}) => {
  const tag = crypto.randomUUID().slice(0, 6);
  const band = `Open mornings ${tag}`;
  await signIn(page, "admin");

  // The first page keeps its section as a shared one and is published.
  await page.goto("/website");
  await untilHydrated(page);
  await page.getByRole("link", { name: "New page" }).click();
  await page.getByRole("button", { name: /^Blank/ }).click();
  await page
    .getByRole("textbox", { name: "Title (English)" })
    .fill(`Visits ${tag}`);
  await page
    .getByRole("textbox", { name: "Title (Arabic)" })
    .fill(`الزيارات ${tag}`);
  await page.getByRole("tab", { name: "Sections" }).click();
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Add Text: Narrow" }).click();
  const heading = page.getByRole("textbox", { name: "Heading", exact: true });
  await heading.fill(band);
  await page
    .locator("[contenteditable=true]")
    .first()
    .fill("Every Tuesday at nine.");
  await page.getByRole("button", { name: "Arabic", exact: true }).click();
  await heading.fill(`صباحات مفتوحة ${tag}`);
  await page
    .locator("[contenteditable=true]")
    .first()
    .fill("كل ثلاثاء في التاسعة.");
  await page.getByRole("button", { name: "English", exact: true }).click();

  await page.getByRole("button", { name: "Save section" }).click();
  const keep = page.getByRole("dialog", { name: "Save section" });
  await keep.getByRole("textbox", { name: "Name" }).fill(band);
  await expect(
    keep.getByRole("radio", { name: /A shared section/ }),
  ).toBeChecked();
  await keep.getByRole("button", { name: "Keep" }).click();
  await expect(page.getByText(`Shared section: ${band}`)).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Published", { exact: true }).first(),
  ).toBeVisible();

  // A second page shows it from the gallery's saved sections.
  await page.goto("/website");
  await untilHydrated(page);
  await page.getByRole("link", { name: "New page" }).click();
  await page.getByRole("button", { name: /^Blank/ }).click();
  await page
    .getByRole("textbox", { name: "Title (English)" })
    .fill(`Admissions ${tag}`);
  await page
    .getByRole("textbox", { name: "Title (Arabic)" })
    .fill(`القبول ${tag}`);
  await page.getByRole("tab", { name: "Sections" }).click();
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await page.getByRole("button", { name: `Add ${band}` }).click();
  await expect(page.getByText(`Shared section: ${band}`)).toBeVisible();

  // Changed there and saved to every page, the published first page shows it.
  await heading.fill(`${band}, now Thursdays`);
  await page.getByRole("button", { name: "Save to every page" }).click();
  await expect(
    page.getByText("Shared section saved. Every page shows the change."),
  ).toBeVisible();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/site/northwind/pages/visits-${tag}`);
  await expect(
    visitor.getByRole("heading", {
      level: 2,
      name: `${band}, now Thursdays`,
    }),
  ).toBeVisible();
  await visitorContext.close();
});

test("a section kept as a template starts a copy on another page", async ({
  page,
}) => {
  const tag = crypto.randomUUID().slice(0, 6);
  const name = `Our values ${tag}`;
  await signIn(page, "admin");
  await page.goto("/website");
  await untilHydrated(page);
  await page.getByRole("link", { name: "New page" }).click();
  await page.getByRole("button", { name: /^Blank/ }).click();
  await page
    .getByRole("textbox", { name: "Title (English)" })
    .fill(`About ${tag}`);
  await page.getByRole("tab", { name: "Sections" }).click();
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Add Text: Narrow" }).click();
  await page
    .getByRole("textbox", { name: "Heading", exact: true })
    .fill("Kindness and curiosity");
  await page.getByRole("button", { name: "Save section" }).click();
  const keep = page.getByRole("dialog", { name: "Save section" });
  await keep.getByRole("textbox", { name: "Name" }).fill(name);
  await keep.getByRole("radio", { name: /^A template/ }).click();
  await keep.getByRole("button", { name: "Keep" }).click();

  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await page.getByRole("button", { name: `Add ${name}` }).click();
  await expect(page.getByText(/^Shared section:/)).toHaveCount(0);
  await expect(
    page
      .getByRole("main", { name: "Page preview" })
      .getByText("Kindness and curiosity"),
  ).toHaveCount(2);

  await page.goto("/templates");
  await untilHydrated(page);
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
});
