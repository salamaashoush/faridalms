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
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("A letter opens with a greeting.");
  const addPart = async (kind: RegExp) => {
    await page.getByRole("button", { name: "Add part", exact: true }).click();
    await page.getByRole("menuitem", { name: kind }).click();
  };
  const questions = page.getByRole("textbox", {
    name: "Question",
    exact: true,
  });
  await addPart(/^Multiple choice/);
  await questions.nth(0).fill("How does a letter open?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("With a greeting");
  await page.getByRole("textbox", { name: "Option 2" }).fill("With a goodbye");
  await page.getByRole("checkbox", { name: "Option 1 is right" }).click();
  await addPart(/^Typed answer/);
  await questions.nth(1).fill("Which word often starts a letter?");
  await page.getByRole("textbox", { name: "Accepted answer 1" }).fill("Dear");
  await addPart(/^Written answer/);
  await questions.nth(2).fill("Write the first line of a letter to a friend.");
  await page.getByRole("button", { name: "More options" }).nth(2).click();
  await page.getByRole("spinbutton", { name: "Points" }).last().fill("4");
  await page.locator("#lesson-completion").click();
  await page
    .getByRole("option", { name: "Every question is answered" })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
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
