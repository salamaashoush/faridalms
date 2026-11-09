import { expect, test } from "@playwright/test";

import { openAsStudent, startLesson } from "./fixtures/lessons";
import {
  ACCOUNTS,
  chooseFromMenu,
  PASSWORD,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seed's second teacher teaches Arabic to every grade; the seeded student
// sits in 8A. Each browser builds its own module, so none reads another's.
const TEACHER = "teacher2.northwind@northwind.example.com";

test("a teacher builds a module, a student answers its lesson, and the teacher marks it and sees it done", async ({
  browser,
  page,
}) => {
  const title = `Letters ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/module-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Module title" }).fill(title);
  await page.getByRole("combobox", { name: "Classes" }).click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/modules\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  const recordUrl = page.url().split("?")[0] ?? "";

  await page.getByRole("link", { name: "Add lesson" }).click();
  await expect(page).toHaveURL(/\/lesson-editor/);
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Lesson title" }).fill("Greetings");
  // The lesson is one document: questions are blocks written in its text.
  await page.locator("#lesson-body").click();
  await page.keyboard.type("A letter opens with a greeting.");
  const ask = async (keyword: string) => {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`/${keyword}`);
    await page.keyboard.press("Enter");
  };
  const leaveQuestion = async () => {
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
  };
  await ask("choice");
  await page.keyboard.type("How does a letter open?");
  await page.keyboard.press("Enter");
  await page.keyboard.type("With a greeting");
  await page.keyboard.press("Enter");
  await page.keyboard.type("With a goodbye");
  // An option is marked right by its circle, as a checklist item is ticked.
  await page
    .locator("[data-question-option]")
    .first()
    .click({ position: { x: 12, y: 14 } });
  await expect(page.locator("[data-question-option]").first()).toHaveAttribute(
    "data-correct",
    "true",
  );
  await page.locator("[data-question-option]").nth(1).click();
  await page.keyboard.press("End");
  await leaveQuestion();
  await page.keyboard.type("/typed");
  await page.keyboard.press("Enter");
  // Committed whole, as dictation or an input method does, straight after
  // Enter: the words stay where the caret is.
  await page.keyboard.insertText("Which word often starts a letter?");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Dear");
  await leaveQuestion();
  await page.keyboard.type("/written");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Write the first line of a letter to a friend.");
  await expect(page.locator("[data-question]")).toHaveCount(3);
  await page.getByRole("button", { name: "2 points" }).click();
  await page.getByRole("menuitem", { name: "4 points" }).click();
  await page.locator("#lesson-completion").click();
  await page
    .getByRole("option", { name: "Every question is answered" })
    .click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(recordUrl);
  await expect(page.getByRole("link", { name: "Greetings" })).toBeVisible();

  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Open to students" }),
  );
  await expect(page.getByText("Module open to students")).toBeVisible();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInWith(
    student,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await student.goto("/me/modules");
  await untilHydrated(student);
  await student.getByRole("link", { name: title }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await student.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: "Greetings" }),
  ).toBeVisible();
  await expect(
    student.getByText("A letter opens with a greeting."),
  ).toBeVisible();
  await student.getByRole("radio", { name: "With a goodbye" }).click();
  await student.getByRole("button", { name: "Check answer" }).first().click();
  // Each question reports its verdict in its own status output.
  const verdicts = student.locator("output");
  await expect(verdicts.getByText("Not quite")).toBeVisible();
  await student.getByRole("button", { name: "Try again" }).click();
  await student.getByRole("radio", { name: "With a greeting" }).click();
  await student.getByRole("button", { name: "Check answer" }).first().click();
  await expect(verdicts.getByText("Right", { exact: true })).toBeVisible();
  const typed = student.getByRole("textbox", { name: "Your answer" }).first();
  await typed.fill("dear");
  await typed.press("Enter");
  await expect(verdicts.getByText("Right", { exact: true })).toHaveCount(2);
  await expect(student.getByText("Lesson done", { exact: true })).toBeVisible();
  await student
    .getByRole("textbox", { name: "Your answer" })
    .last()
    .fill("Dear Salama, I hope you are well.");
  await student.getByRole("button", { name: "Save answer" }).click();
  await expect(
    student.getByText("Sent. Your teacher will mark it."),
  ).toBeVisible();
  await studentContext.close();

  await page.goto(`${recordUrl}?tab=answers`);
  await untilHydrated(page);
  await expect(
    page.getByText("Dear Salama, I hope you are well."),
  ).toBeVisible();
  await page.getByRole("spinbutton", { name: "Points out of 4" }).fill("3");
  await page.getByRole("button", { name: "Save mark" }).click();
  await expect(page.getByText("Marked: 3 of 4 points")).toBeVisible();

  await page.goto(`${recordUrl}?tab=progress`);
  await untilHydrated(page);
  // The seeded student is Yasmin Sabry.
  const row = page
    .getByRole("tabpanel")
    .getByRole("row", { name: /Yasmin Sabry/ });
  await expect(row.getByText("1 of 1 done")).toBeVisible();
});

test("a student reviews a module's finished lessons together and reads the message for how it went", async ({
  browser,
  page,
}) => {
  // Two lessons written, a module set up and a review taken run past the
  // default budget.
  test.slow();
  const title = `Colours ${crypto.randomUUID().slice(0, 6)}`;
  const recordUrl = await startLesson(page, title, "Reds");
  /** A question with its right answer first, and the caret left below it. */
  const choice = async (prompt: string, right: string, wrong: string) => {
    const before = await page.locator("[data-question-option]").count();
    await page.keyboard.type("/choice");
    await page.keyboard.press("Enter");
    await page.keyboard.type(prompt);
    await page.keyboard.press("Enter");
    await page.keyboard.type(right);
    await page.keyboard.press("Enter");
    await page.keyboard.type(wrong);
    await page
      .locator("[data-question-option]")
      .nth(before)
      .click({ position: { x: 12, y: 14 } });
    await page
      .locator("[data-question-option]")
      .nth(before + 1)
      .click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
  };
  await choice("Which is red?", "A tomato", "The sky");
  await choice("Which is red too?", "A cherry", "Grass");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(recordUrl);
  await page.getByRole("link", { name: "Add lesson" }).click();
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Lesson title" }).fill("Blues");
  await page.locator("#lesson-body").click();
  await choice("Which is blue?", "The sea", "A lemon");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(recordUrl);

  // What a student reads after a mixed review is set on the module.
  await page.getByRole("button", { name: "Edit module" }).click();
  await untilHydrated(page);
  // Each message is added in its own sheet, starting at the first score
  // not yet taken (80, then 0); the grid of inputs it replaced was found
  // by its cells' names.
  const review = page.getByRole("region", { name: "Message by score" });
  const addMessage = async (text: string) => {
    await review.getByRole("button", { name: "Add a message" }).click();
    const sheet = page.getByRole("dialog", { name: "Add a message" });
    await sheet.getByRole("textbox", { name: "Message" }).fill(text);
    await sheet.getByRole("button", { name: "Add a message" }).click();
    await expect(sheet).toBeHidden();
  };
  await addMessage("You know your colours.");
  await addMessage("Look at the colours again.");
  await expect(
    review.getByRole("row", { name: /^80% and above/ }),
  ).toContainText("You know your colours.");
  await expect(
    review.getByRole("row", { name: /^0 to under 80%/ }),
  ).toContainText("Look at the colours again.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(recordUrl);
  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Open to students" }),
  );
  await expect(page.getByText("Module open to students")).toBeVisible();

  // Opening each lesson finishes it, and two finished open the review.
  const context = await browser.newContext();
  const student = await context.newPage();
  await openAsStudent(student, title, "Reds");
  await student.getByRole("link", { name: "Next lesson" }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: "Blues" }),
  ).toBeVisible();
  await student.goto("/me/modules");
  await untilHydrated(student);
  await student.getByRole("link", { name: title }).click();
  await student.getByRole("link", { name: "Start a review" }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: "Mixed review" }),
  ).toBeVisible();
  for (const [prompt, right] of [
    ["Which is red?", "A tomato"],
    ["Which is red too?", "A cherry"],
    ["Which is blue?", "The sea"],
  ] as const) {
    const asked = student.locator("form").filter({
      has: student.getByRole("group", { name: prompt, exact: true }),
    });
    await asked.getByRole("radio", { name: right }).click();
    await asked.getByRole("button", { name: "Check answer" }).click();
    await expect(asked.locator("output").first()).toContainText("Right");
  }
  await expect(student.getByText("Right the first time: 3 of 3")).toBeVisible();
  await expect(student.getByText("You know your colours.")).toBeVisible();
  await context.close();
});
