import type { Locator, Page } from "@playwright/test";

import { plainContent } from "@faridalms/domain/content-conversion";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seeded student Yasmin Sabry sits in 8A, kept by the seed's second
// teacher; her mother signs in with her number. Each browser writes its own
// words, so parallel projects never read each other's message as theirs.
const TEACHER = "teacher2.northwind@northwind.example.com";
const MOTHER = "parent1007@northwind.example.com";

/** `untilHydrated`, for a page that opens with a sheet over it, which takes the shell out of the accessibility tree. */
async function hydratedUnderSheet(page: Page) {
  await expect(
    page
      .getByRole("button", { name: "Search everything", includeHidden: true })
      .first(),
  ).toBeEnabled();
}

const tag = (browserName: string) =>
  `${browserName} ${crypto.randomUUID().slice(0, 6)}`;

/**
 * The editor's Markdown import, from its toolbar or, where the sheet is too
 * narrow for every tool, from the toolbar's overflow menu.
 */
async function replaceFromMarkdown(
  page: Page,
  within: Locator,
  markdown: string,
) {
  const button = within.getByRole("button", { name: "Markdown", exact: true });
  if (await button.isVisible()) await button.click();
  else {
    await within.getByRole("button", { name: "More tools" }).click();
    await page.getByRole("menuitem", { name: "Markdown" }).click();
  }
  const dialog = page.getByRole("dialog", { name: "Markdown" });
  await dialog.getByRole("textbox", { name: "Markdown" }).fill(markdown);
  await dialog
    .getByRole("button", { name: "Replace from Markdown", exact: true })
    .click();
  await expect(dialog).toBeHidden();
}

// The guardian's replies to Yasmin's teacher are written into one
// conversation, where a reply being written is one draft per person, so
// these tests take their turn rather than type into each other's draft.
test.describe.configure({ mode: "default" });

test("a guardian replies to the teacher's note and the teacher reads it", async ({
  browser,
  page,
  browserName,
}) => {
  const words = `Signed and returned (${tag(browserName)})`;
  await signInWith(page, MOTHER, PASSWORD, "/family");
  await page.goto("/family/messages");
  await untilHydrated(page);
  await page
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: /Yasmin Sabry/ })
    .first()
    .click();
  await expect(page.getByText("About Yasmin Sabry").last()).toBeVisible();
  await page.locator("form [contenteditable=true]").last().click();
  await page.keyboard.type(words);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("list", { name: "Messages" })).toContainText(
    words,
  );

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await signInWith(teacher, TEACHER, PASSWORD, "/today");
  await untilHydrated(teacher);
  // What waits unread is counted beside Messages, and read out as such.
  await expect(
    teacher
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: /^Messages\s*\d+ unread conversations?$/ })
      .first(),
  ).toBeVisible();
  await teacher.goto("/messages");
  await untilHydrated(teacher);
  await teacher
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: /Yasmin Sabry/ })
    .first()
    .click();
  await expect(teacher.getByRole("list", { name: "Messages" })).toContainText(
    words,
  );
  // The teacher already reaches the families of the children they teach,
  // so the guardians' names lead to them.
  await teacher
    .getByRole("button", { name: /People in this conversation/ })
    .click();
  const people = teacher.getByRole("dialog", {
    name: "People in this conversation",
  });
  await expect(people.getByRole("link").first()).toHaveAttribute(
    "href",
    /\/people\/[0-9a-f-]{36}$/,
  );
  await teacherContext.close();
});

test("a guardian's names lead nowhere they could not already open", async ({
  page,
}) => {
  await signInWith(page, MOTHER, PASSWORD, "/family");
  await page.goto("/family/messages");
  await untilHydrated(page);
  await page
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: /Yasmin Sabry/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /People in this conversation/ })
    .click();
  const people = page.getByRole("dialog", {
    name: "People in this conversation",
  });
  await expect(people.getByRole("listitem").first()).toBeVisible();
  const hrefs = await people
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) expect(href).toMatch(/^\/profiles\/[0-9a-f-]{36}$/);
});

test("a teacher writes to a child's family from a new message", async ({
  page,
  browserName,
}) => {
  const words = `Trip on Thursday (${tag(browserName)})`;
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/messages");
  await untilHydrated(page);
  await page.getByRole("button", { name: "New message" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("combobox", { name: /^Student/ }).click();
  await page.getByRole("combobox", { name: /Search/ }).fill("Yasmin");
  await page.getByRole("option", { name: "Yasmin Sabry" }).click();
  await sheet.locator("[contenteditable=true]").click();
  await page.keyboard.type(words);
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(/thread=/);
  await expect(page.getByRole("list", { name: "Messages" })).toContainText(
    words,
  );
});

test("a new message written from Markdown is kept as a draft, survives a reload, reopens from Drafts and is sent once", async ({
  page,
  browserName,
}) => {
  const words = `will finish this later (${tag(browserName)})`;
  await signInWith(page, MOTHER, PASSWORD, "/family");
  await page.goto("/family/messages");
  await untilHydrated(page);
  await page.getByRole("button", { name: "New message" }).click();
  const sheet = page.getByRole("dialog", { name: "New message" });
  await sheet.getByRole("combobox", { name: /^Person/ }).click();
  await page.getByRole("option").first().click();
  const body = sheet.locator("[contenteditable=true]");
  await body.click();
  await replaceFromMarkdown(
    page,
    sheet,
    `## Learning together\n\n**Salama** ${words}`,
  );
  await expect(
    body.getByRole("heading", { name: "Learning together" }),
  ).toBeVisible();
  await expect(sheet.getByText("Draft saved")).toBeVisible();
  await expect(page).toHaveURL(/draft=[0-9a-f-]{36}/);

  await page.reload();
  await hydratedUnderSheet(page);
  const reopened = page.getByRole("dialog", { name: "New message" });
  const kept = reopened.locator("[contenteditable=true]");
  await expect(
    kept.getByRole("heading", { name: "Learning together" }),
  ).toBeVisible();
  await expect(kept.locator("strong")).toHaveText("Salama");

  // Closing keeps it; nothing asks, because nothing is lost.
  await reopened.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Kept in Drafts.")).toBeVisible();
  await expect(reopened).toBeHidden();
  await page.getByRole("button", { name: /^Mailbox/ }).click();
  await page
    .getByRole("menuitemradio", { name: "Drafts", exact: true })
    .click();
  const drafts = page.getByRole("list", { name: "Drafts" });
  await drafts.getByRole("button").filter({ hasText: words }).click();
  const again = page.getByRole("dialog", { name: "New message" });
  await expect(
    again
      .locator("[contenteditable=true]")
      .getByRole("heading", { name: "Learning together" }),
  ).toBeVisible();
  await again.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(/thread=/);
  // The conversation with that person is the one other runs write to as
  // well, so the message is told apart by its own words.
  const sent = page
    .getByRole("list", { name: "Messages" })
    .getByRole("listitem")
    .filter({ hasText: words });
  await expect(sent).toHaveCount(1);
  await expect(
    sent.getByRole("heading", { name: "Learning together" }),
  ).toBeVisible();
  await expect(sent.locator("strong")).toHaveText("Salama");
  await expect(
    drafts.getByRole("button").filter({ hasText: words }),
  ).toHaveCount(0);
  await page.reload();
  await untilHydrated(page);
  await expect(
    page
      .getByRole("list", { name: "Drafts" })
      .getByRole("button")
      .filter({ hasText: words }),
  ).toHaveCount(0);
});

test("a reply being written keeps its formatting through a reload", async ({
  page,
  browserName,
}) => {
  const words = `Bring the reading log (${tag(browserName)})`;
  await signInWith(page, MOTHER, PASSWORD, "/family");
  await page.goto("/family/messages");
  await untilHydrated(page);
  await page
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: /Yasmin Sabry/ })
    .first()
    .click();
  const reply = page.locator("form [contenteditable=true]").last();
  await reply.click();
  await page.keyboard.type(words);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+b");
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.reload();
  await untilHydrated(page);
  await expect(reply.locator("strong")).toHaveText(words);
  await expect(
    page
      .getByRole("list", { name: "Conversations" })
      .getByRole("button", { name: /Yasmin Sabry/ })
      .first(),
  ).toContainText("Draft");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Messages" }).locator("strong").last(),
  ).toHaveText(words);
  await expect(reply).toHaveText("");
});

test("recipient search pages past its first thirty people", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/messages?compose=true");
  await hydratedUnderSheet(page);
  const sheet = page.getByRole("dialog", { name: "New message" });
  await sheet.getByRole("combobox", { name: "Write to" }).click();
  await page.getByRole("option", { name: "One person" }).click();
  await sheet.getByRole("combobox", { name: /^Person/ }).click();
  const options = page.getByRole("option");
  await expect(options).toHaveCount(30);
  await page.getByRole("button", { name: "More people" }).click();
  await expect.poll(() => options.count()).toBeGreaterThan(30);
  const chosen = (await options.nth(30).innerText()).trim();
  await options.nth(30).click();
  await expect(sheet.getByRole("combobox", { name: /^Person/ })).toContainText(
    chosen,
  );
});

test("leaving a message to several families asks before it is thrown away", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/students?q=Zaki");
  await untilHydrated(page);
  const pick = page
    .getByRole("table")
    .getByRole("checkbox", { name: /^Select .*Zaki/ });
  await pick.nth(0).check();
  await pick.nth(1).check();
  await page.getByRole("button", { name: "Message guardians" }).click();
  const sheet = page.getByRole("dialog", { name: "New message" });
  const note = "Salama's note to both families";
  await sheet.getByRole("textbox", { name: "Message" }).fill(note);
  await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
  const ask = page.getByRole("dialog", { name: "Discard this message?" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(sheet.getByRole("textbox", { name: "Message" })).toHaveText(
    note,
  );
  await page.keyboard.press("Escape");
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Discard changes" }).click();
  await expect(sheet).toBeHidden();
});

test("a long conversation reads back past its latest hundred messages", async ({
  page,
  browserName,
}) => {
  const { api } = await signedInApi(TEACHER);
  const { rows } = await api.messages.recipients({ among: "people" });
  const [first, second] = rows.filter((row) => row.kind === "staff");
  if (!first || !second) throw new Error("the seed has too few colleagues");
  const { threadId } = await api.messages.start({
    kind: "group",
    recipientIds: [first.userId, second.userId],
    subject: `Long thread (${tag(browserName)})`,
    content: plainContent("The first word"),
  });
  // One after another, so the replies keep their order.
  await Array.from({ length: 101 }, (_, index) => index + 1).reduce<
    Promise<unknown>
  >(
    (previous, index) =>
      previous.then(() =>
        api.messages.send({
          threadId,
          content: plainContent(`Reply ${index}`),
        }),
      ),
    Promise.resolve(),
  );
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto(`/messages?thread=${threadId}`);
  await untilHydrated(page);
  const messages = page.getByRole("list", { name: "Messages" });
  await expect(messages.getByText("Reply 101", { exact: true })).toBeVisible();
  await expect(messages.getByText("The first word")).toHaveCount(0);
  await messages.getByRole("button", { name: "Show earlier messages" }).click();
  await expect(messages.getByText("The first word")).toBeVisible();
  await expect(messages.getByText("Reply 1", { exact: true })).toHaveCount(1);
  await expect(
    messages.getByRole("button", { name: "Show earlier messages" }),
  ).toHaveCount(0);
});

test("a guardian attaches a doctor's note to a reply, and the teacher opens it", async ({
  browser,
  page,
  browserName,
}) => {
  const words = `The note is attached (${tag(browserName)})`;
  const name = `Doctor note ${browserName}.pdf`;
  await signInWith(page, MOTHER, PASSWORD, "/family");
  await page.goto("/family/messages");
  await untilHydrated(page);
  await page
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: /Yasmin Sabry/ })
    .first()
    .click();
  await expect(page.getByText("About Yasmin Sabry").last()).toBeVisible();
  await page.locator("form [contenteditable=true]").last().click();
  await page.keyboard.type(words);
  await page
    // The editor's media input; the others import quizzes and documents.
    .locator('form input[type=file][hidden][accept*="image/png"]')
    .setInputFiles({
      name,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nExcused from swimming this week.\n"),
    });
  await expect(page.locator("form").getByText(name).last()).toBeVisible();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const sent = page.getByRole("list", { name: "Messages" });
  await expect(sent).toContainText(words);
  await expect(sent.getByText(name).last()).toBeVisible();

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await signInWith(teacher, TEACHER, PASSWORD, "/today");
  await teacher.goto("/messages");
  await untilHydrated(teacher);
  await teacher
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: /Yasmin Sabry/ })
    .first()
    .click();
  const download = teacher
    .getByRole("list", { name: "Messages" })
    .getByRole("link", { name: new RegExp(`^Download: ${name}`) })
    .last();
  await expect(download).toBeVisible();
  const opened = await teacher.request.get(
    new URL((await download.getAttribute("href")) ?? "", teacher.url()).href,
  );
  expect(opened.status()).toBe(200);
  expect(await opened.text()).toContain("Excused from swimming this week.");
  await teacherContext.close();
});
