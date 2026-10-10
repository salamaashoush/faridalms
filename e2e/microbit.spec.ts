import { expect, test } from "@playwright/test";

import { openAsStudent, openToStudents, startLesson } from "./fixtures/lessons";
import { untilHydrated } from "./fixtures/sign-in";

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
  await student.getByRole("button", { name: "Open the project" }).click();
  const studio = student.getByRole("dialog", { name: "micro:bit project" });
  const editor = studio.frameLocator('iframe[title="micro:bit code editor"]');
  // The editor is the board's own, with nobody's name on it but the board's.
  await expect(editor.locator("#mainmenu")).toBeVisible({ timeout: 90_000 });
  await expect(editor.locator("#mainmenu")).toContainText("micro:bit");
  await expect(editor.locator("#mainmenu")).not.toContainText("Microsoft");

  // The student writes the program as JavaScript, which the blocks follow.
  await editor
    .getByRole("button", { name: "Convert code to JavaScript" })
    .first()
    .click();
  await editor.locator(".monaco-editor .view-lines").click();
  await student.keyboard.press("ControlOrMeta+a");
  await student.keyboard.type("basic.showNumber(7)");
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
  await expect(
    reading
      .frameLocator('iframe[title="micro:bit code editor"]')
      .locator("#mainmenu"),
  ).toBeVisible({ timeout: 90_000 });
  await reading.getByRole("button", { name: "Done", exact: true }).click();
  await expect(reading).toBeHidden();
});
