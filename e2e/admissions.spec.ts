import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { openWith, signIn, untilHydrated } from "./fixtures/sign-in";

const tag = () => crypto.randomUUID().slice(0, 6);

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
  await expect(
    page.getByText("How did you hear about us?", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Social media", { exact: true })).toBeVisible();

  // The conversation is the enquiry's one timeline: a note for colleagues,
  // then a call logged, each written in its composer.
  const conversation = page.getByRole("region", { name });
  await expect(
    conversation.getByText("Is there a place in grade 4 next term?"),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Write as" })
    .getByRole("button", { name: "Note", exact: true })
    .click();
  await page.locator("form [contenteditable=true]").last().click();
  await page.keyboard.type("Their older child is with us already.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page
      .getByRole("list", { name: "Messages" })
      .getByText("Their older child is with us already."),
  ).toBeVisible();

  await page
    .getByRole("group", { name: "Write as" })
    .getByRole("button", { name: "Log a contact", exact: true })
    .click();
  await page.locator("form [contenteditable=true]").last().click();
  await page.keyboard.type("Called back; they will visit on Tuesday.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page
      .getByRole("list", { name: "Messages" })
      .getByText("Called back; they will visit on Tuesday."),
  ).toBeVisible();
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
  const run = tag();
  const question = `Preferred start ${run}`;
  // Every browser adds a question to the one form, so each names its own.
  const arabic = `تاريخ البدء المفضل ${run}`;
  await signIn(page, "admin");
  await page.goto("/website");
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
  // The school's questions are question blocks, written in the editor.
  const questions = page.getByRole("textbox", { name: "Your questions" });
  await questions.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  // "date" also finds a timeline, which lists dates, so the block is picked by name.
  await page.keyboard.type("/date");
  await page.getByRole("option", { name: /^Date/ }).click();
  await page.keyboard.type(question);
  await expect(questions.locator("[data-question]").last()).toHaveAttribute(
    "data-kind",
    "text",
  );
  await expect(
    page.getByRole("main", { name: "Page preview" }).getByText(question),
  ).toBeVisible();

  // The translation rewrites the question's words; what it asks stays.
  // The words are picked with a triple click: on a Mac, Home and End
  // scroll the document rather than move the caret, and Shift+Home
  // selects back to the document's first block.
  await page.getByRole("button", { name: "Arabic", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your questions" })
    .getByText(question)
    .click({ clickCount: 3 });
  await page.keyboard.insertText(arabic);
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
  await expect(visitor.getByLabel(arabic)).toBeVisible();
  await visitorContext.close();
});
