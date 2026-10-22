import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
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
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/module-editor");
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
  await expect(page).toHaveURL(/\/teach\/lesson-editor/);
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

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Open to students" }).click();
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
