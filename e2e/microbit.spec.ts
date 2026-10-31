import type { Locator, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { openAsStudent, openToStudents, startLesson } from "./fixtures/lessons";
import {
  ACCOUNTS,
  PASSWORD,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

const editorIn = (studio: Locator) =>
  studio.frameLocator('iframe[title="micro:bit code editor"]');

/** Writes a project's program as JavaScript, which its blocks follow. */
async function write(page: Page, studio: Locator, program: string) {
  const editor = editorIn(studio);
  await expect(editor.locator("#mainmenu")).toBeVisible({ timeout: 90_000 });
  await editor
    .getByRole("button", { name: "Convert code to JavaScript" })
    .first()
    .click();
  const lines = editor.locator(".monaco-editor .view-lines");
  // The JavaScript view is ready once it shows the program it starts from;
  // keys pressed before it has focus go astray.
  await expect(lines).not.toBeEmpty();
  await lines.click();
  await expect(editor.locator(".monaco-editor textarea")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(program);
  await expect(lines).toContainText(program);
}

test("a teacher sets a micro:bit project, and a student builds it in the board's editor, takes the program for a board and hands it in", async ({
  browser,
  page,
}) => {
  const title = `Boards ${crypto.randomUUID().slice(0, 6)}`;
  const recordUrl = await startLesson(page, title, "Show a number");
  await page.keyboard.type("/microbit");
  await page.getByRole("option", { name: /micro:bit project/ }).click();
  await page.keyboard.type("Show your lucky number on the micro:bit.");
  const question = page.locator("[data-question]");
  await expect(question).toHaveAttribute("data-kind", "project");
  await expect(question).toHaveAttribute("data-label", /^micro:bit project/);
  await openToStudents(page, recordUrl);

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await openAsStudent(student, title, "Show a number");
  await expect(student.getByText("Nothing is built yet.")).toBeVisible();
  const steps = await student.evaluate(() => history.length);
  await student.getByRole("button", { name: "Open the project" }).click();
  const studio = student.getByRole("dialog", { name: "micro:bit project" });
  const editor = editorIn(studio);
  // The editor is the board's own, with nobody's name on it but the board's.
  await expect(editor.locator("#mainmenu")).toBeVisible({ timeout: 90_000 });
  await expect(editor.locator("#mainmenu")).toContainText("micro:bit");
  await expect(editor.locator("#mainmenu")).not.toContainText("Microsoft");

  await write(student, studio, "basic.showNumber(7)");
  await expect(studio.getByText("Saved", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // The compiled program is handed to the page, which saves it for the board.
  const download = student.waitForEvent("download");
  await editor
    .getByRole("button", { name: /^Download/ })
    .first()
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.hex$/);
  await studio.getByRole("button", { name: "Done", exact: true }).click();
  await expect(studio).toBeHidden();
  await expect(student.getByText("basic.showNumber(7)")).toBeVisible();
  // The editor added no step to the page's history, so Back still leaves it.
  expect(await student.evaluate(() => history.length)).toBe(steps);

  await student
    .getByRole("button", { name: "Hand in to your teacher" })
    .click();
  await expect(
    student.getByText("Sent. Your teacher will mark it."),
  ).toBeVisible();
  await studentContext.close();

  // The teacher reads the program, and opens the project where nothing changes.
  await page.goto(`${recordUrl}?tab=answers`);
  await untilHydrated(page);
  await expect(page.getByText("basic.showNumber(7)")).toBeVisible();
  await page.getByRole("button", { name: "Open the project" }).click();
  const reading = page.getByRole("dialog", { name: "micro:bit project" });
  await expect(
    reading.getByText("Open to look at and run, not to change"),
  ).toBeVisible();
  await expect(editorIn(reading).locator("#mainmenu")).toBeVisible({
    timeout: 90_000,
  });
  await reading.getByRole("button", { name: "Done", exact: true }).click();
  await expect(reading).toBeHidden();
});

test("a class starts from the teacher's micro:bit project, and a student builds on one a classmate shows", async ({
  browser,
  page,
}) => {
  const title = `Shared boards ${crypto.randomUUID().slice(0, 6)}`;
  const recordUrl = await startLesson(page, title, "Our boards");
  await page.keyboard.type("/microbit");
  await page.getByRole("option", { name: /micro:bit project/ }).click();
  await page.keyboard.type("Make the board say something.");
  const galleryOn = page.getByRole("button", { name: /^Class gallery/ });
  await galleryOn.click();
  await expect(galleryOn).toHaveAttribute("aria-pressed", "true");

  // The teacher builds what every student starts from in the same editor.
  await page.getByRole("button", { name: "Build the starter project" }).click();
  const starter = page.getByRole("dialog", { name: "micro:bit project" });
  await write(page, starter, 'basic.showString("Hi")');
  // The editor tells of a change a moment after it; Done asks for it as it stands.
  await starter.getByRole("button", { name: "Done", exact: true }).click();
  await expect(starter).toBeHidden();
  await expect(page.locator("[data-question]")).toHaveAttribute(
    "data-label",
    /starts from your project/,
  );
  // The way back out of the lesson is still the page's own.
  await openToStudents(page, recordUrl);

  /** Signs a student in, opens the lesson, changes the program and hands it in. */
  const build = async (email: string, program: string) => {
    const context = await browser.newContext();
    const student = await context.newPage();
    await signInWith(student, email, PASSWORD, ACCOUNTS.student.home);
    await student.goto("/me/modules");
    await untilHydrated(student);
    await student.getByRole("link", { name: title }).click();
    await student.getByRole("button", { name: "Start", exact: true }).click();
    await expect(
      student.getByRole("heading", { level: 1, name: "Our boards" }),
    ).toBeVisible();
    await expect(student.getByText('basic.showString("Hi")')).toBeVisible();
    await student.getByRole("button", { name: "Open the project" }).click();
    const studio = student.getByRole("dialog", { name: "micro:bit project" });
    await write(student, studio, program);
    await expect(studio.getByText("Saved", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await studio.getByRole("button", { name: "Done", exact: true }).click();
    await expect(studio).toBeHidden();
    await student
      .getByRole("button", { name: "Hand in to your teacher" })
      .click();
    await expect(
      student.getByText("Sent. Your teacher will mark it."),
    ).toBeVisible();
    return { context, student };
  };

  const first = await build(ACCOUNTS.student.email, "basic.showNumber(1)");
  await first.student
    .getByRole("button", { name: "Show mine to the class" })
    .click();
  await expect(
    first.student.getByText(
      "Your project is waiting for your teacher to show it.",
    ),
  ).toBeVisible();
  await first.context.close();
  const second = await build(
    "student1008@northwind.example.com",
    "basic.showNumber(2)",
  );

  // The teacher sees what is being built, then shows the first to the class.
  await page.goto(`${recordUrl}?tab=live`);
  await untilHydrated(page);
  await expect(page.getByText("Projects being built")).toBeVisible();
  await expect(page.getByText("basic.showNumber(2)")).toBeVisible();
  await page.goto(`${recordUrl}?tab=answers`);
  await untilHydrated(page);
  await page.getByRole("button", { name: "Show to the class" }).click();
  await expect(page.getByText("In the class gallery")).toBeVisible();

  await second.student.reload();
  await untilHydrated(second.student);
  await second.student
    .getByRole("button", { name: "Yasmin Sabry's project" })
    .click();
  const shown = second.student.getByRole("dialog", {
    name: "micro:bit project",
  });
  await expect(editorIn(shown).locator("#mainmenu")).toBeVisible({
    timeout: 90_000,
  });
  await shown.getByRole("button", { name: "Build on this project" }).click();
  await second.student
    .getByRole("dialog", { name: "Build on Yasmin Sabry's project?" })
    .getByRole("button", { name: "Build on this project" })
    .click();
  await expect(
    second.student.getByText("You are now building on Yasmin Sabry's project."),
  ).toBeVisible();
  await expect(second.student.getByText("basic.showNumber(1)")).toBeVisible();
  await second.context.close();
});

test("a teacher holds a micro:bit question to Python, and its students are given no other language", async ({
  browser,
  page,
}) => {
  const title = `Boards in Python ${crypto.randomUUID().slice(0, 6)}`;
  const recordUrl = await startLesson(page, title, "In Python");
  await page.keyboard.type("/microbit");
  await page.getByRole("option", { name: /micro:bit project/ }).click();
  await page.keyboard.type("Show a number, in Python.");
  await page.getByRole("button", { name: "What students build with" }).click();
  await page.getByRole("menuitem", { name: "Python only" }).click();
  await expect(page.locator("[data-question]")).toHaveAttribute(
    "data-label",
    /^micro:bit project · Python only/,
  );
  await openToStudents(page, recordUrl);

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await openAsStudent(student, title, "In Python");
  await student.getByRole("button", { name: "Open the project" }).click();
  const studio = student.getByRole("dialog", { name: "micro:bit project" });
  const editor = editorIn(studio);
  // The editor's own header names the one language, with nothing to switch to.
  await expect(editor.locator("#mainmenu")).toContainText("Python", {
    timeout: 90_000,
  });
  await expect(editor.locator("#mainmenu")).not.toContainText("Blocks");
  await expect(editor.locator("#mainmenu")).not.toContainText("JavaScript");
  await editor.locator(".monaco-editor .view-lines").click();
  await student.keyboard.press("ControlOrMeta+a");
  await student.keyboard.type("basic.show_number(3)");
  await expect(studio.getByText("Saved", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await studio.getByRole("button", { name: "Done", exact: true }).click();
  await expect(studio).toBeHidden();
  // The program read back is the Python the student wrote.
  await expect(student.getByText("basic.show_number(3)")).toBeVisible();
  await studentContext.close();
});
