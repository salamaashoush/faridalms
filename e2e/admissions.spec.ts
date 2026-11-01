import type { Locator, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { openWith, signIn, untilHydrated } from "./fixtures/sign-in";

const tag = () => crypto.randomUUID().slice(0, 6);

/** Opens one repeating item in the builder's inspector, if it is not open yet. */
async function openItem(item: Locator) {
  const details = item.locator("details").first();
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
}

/** A family sends the admissions page's form, taking the time a person would. */
async function enquire(visitor: Page, name: string, heard?: string) {
  await visitor.clock.install();
  await visitor.goto("/site/northwind/pages/admissions");
  await visitor.getByRole("textbox", { name: "Your name" }).fill(name);
  await visitor
    .getByRole("textbox", { name: "Email" })
    .fill("salama.family@example.com");
  if (heard)
    await visitor
      .getByRole("combobox", { name: /How did you hear about us/ })
      .selectOption(heard);
  await visitor
    .getByRole("textbox", { name: /Message/ })
    .fill("Is there a place in grade 4 next term?");
  // A person takes a while to fill the form; faster sends are dropped as scripts.
  await visitor.clock.fastForward(5000);
  await visitor.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    visitor.getByText("Thank you. We will reply within two working days."),
  ).toBeVisible();
}

test("an enquiry from the website is answered, followed up and closed from the inbox", async ({
  browser,
  page,
}) => {
  const name = `Salama Ashoush ${tag()}`;
  const visitorContext = await browser.newContext();
  await enquire(await visitorContext.newPage(), name, "Social media");
  await visitorContext.close();

  await signIn(page, "admin");
  await page.getByRole("link", { name: "Enquiries" }).first().click();
  await expect(page.getByRole("heading", { name: "Enquiries" })).toBeVisible();
  await untilHydrated(page);
  await page.getByRole("searchbox", { name: "Search enquiries" }).fill(name);
  await page.getByRole("link", { name }).click();

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Open", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("How did you hear about us?")).toBeVisible();
  await expect(page.getByText("Social media", { exact: true })).toBeVisible();

  await page
    .getByRole("textbox", { name: "Note for colleagues" })
    .fill("Their older child is with us already.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(
    page.getByText("Their older child is with us already."),
  ).toBeVisible();

  const contact = page.getByRole("dialog", { name: "Log a contact" });
  await openWith(
    page.getByRole("button", { name: "Log a contact" }).first(),
    contact,
  );
  await contact
    .getByRole("textbox", { name: "What was said" })
    .fill("Called back; they will visit on Tuesday.");
  await contact.getByRole("button", { name: "Save" }).click();
  await expect(contact).toBeHidden();
  await expect(
    page.getByText("In progress after the first contact"),
  ).toBeVisible();
  await expect(
    page.getByText("In progress", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Close…" }).click();
  const closing = page.getByRole("dialog", { name: "Close the enquiry" });
  await closing.getByRole("combobox", { name: "Reason" }).click();
  await page.getByRole("option", { name: "Chose another school" }).click();
  await closing.getByRole("button", { name: "Close enquiry" }).click();
  await expect(closing).toBeHidden();
  await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Moved to Closed: Chose another school"),
  ).toBeVisible();

  await page.goto(
    `/admissions/enquiries?state=closed&q=${encodeURIComponent(name)}`,
  );
  await expect(page.getByRole("link", { name })).toBeVisible();
});

test("the office logs an enquiry taken by phone", async ({ page }) => {
  const name = `Salama Ashoush ${tag()}`;
  await signIn(page, "admin");
  await page.goto("/admissions/enquiries");
  await untilHydrated(page);
  const sheet = page.getByRole("dialog", { name: "Log an enquiry" });
  await openWith(page.getByRole("button", { name: "Log enquiry" }), sheet);
  await sheet.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await sheet.getByRole("button", { name: "Save enquiry" }).click();
  await expect(
    sheet.getByText("Give an email or a phone number.").first(),
  ).toBeVisible();
  await sheet.getByRole("textbox", { name: "Phone" }).fill("+20 100 555 0123");
  await sheet.getByRole("button", { name: "Save enquiry" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Phone", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "+20 100 555 0123" }),
  ).toBeVisible();
});

test("a school adds its own question to the form, and families answer it", async ({
  browser,
  page,
}) => {
  const question = `Preferred start ${tag()}`;
  await signIn(page, "admin");
  await page.goto("/admin/site");
  await untilHydrated(page);
  await page
    .getByRole("link", { name: "Admissions", exact: true })
    .first()
    .click();
  await page.getByRole("tab", { name: "Sections" }).click();
  await page
    .getByRole("tabpanel", { name: "Sections" })
    .getByRole("button", { name: /Enquiry form/ })
    .click();
  const questions = page.getByRole("group", { name: "Your questions" });
  await questions.getByRole("button", { name: "Add item" }).click();
  const added = questions.getByRole("listitem").last();
  await openItem(added);
  await added.getByRole("textbox", { name: "Label" }).fill(question);
  await added.getByRole("combobox", { name: "Answer type" }).click();
  await page.getByRole("option", { name: "Date" }).click();
  await expect(
    page.getByRole("main", { name: "Page preview" }).getByText(question),
  ).toBeVisible();

  await page.getByRole("button", { name: "Arabic", exact: true }).click();
  await openItem(added);
  await added
    .getByRole("textbox", { name: "Label" })
    .fill("تاريخ البدء المفضل");
  await page.getByRole("button", { name: "Publish changes" }).click();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  const field = visitor.getByLabel(question);
  // The page already reads as published, so the visitor's copy is what
  // shows the new question has gone out.
  await expect(async () => {
    await visitor.goto("/site/northwind/pages/admissions");
    await expect(field).toBeVisible({ timeout: 2000 });
  }).toPass();
  await expect(field).toHaveAttribute("type", "date");
  await visitor.goto("/site/northwind/pages/admissions?lang=ar");
  await expect(visitor.getByLabel("تاريخ البدء المفضل")).toBeVisible();
  await visitorContext.close();
});
