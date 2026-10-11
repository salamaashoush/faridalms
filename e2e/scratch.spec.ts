import type { Locator } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { openAsStudent, openToStudents, startLesson } from "./fixtures/lessons";
import {
  ACCOUNTS,
  PASSWORD,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

/** The sprite's name in the studio: changing it is a change the studio saves. */
const spriteIn = (studio: Locator) =>
  studio
    .frameLocator('iframe[title="Coding studio"]')
    .locator('input[placeholder="Name"]')
    .first();

test("a student shows a coding project to the class once the teacher agrees, and a classmate builds on it in the studio", async ({
  browser,
  page,
}) => {
  const title = `Shared games ${crypto.randomUUID().slice(0, 6)}`;
  const recordUrl = await startLesson(page, title, "Our games");
  await page.keyboard.type("/coding project");
  await page.getByRole("option", { name: /Coding project/ }).click();
  await page.keyboard.type("Make a game.");
  const galleryOn = page.getByRole("button", { name: /^Class gallery/ });
  await galleryOn.click();
  await expect(galleryOn).toHaveAttribute("aria-pressed", "true");
  await openToStudents(page, recordUrl);

  /** Signs a student in, opens the lesson, and saves a project with its sprite renamed. */
  const build = async (email: string, sprite: string) => {
    const context = await browser.newContext();
    const student = await context.newPage();
    await signInWith(student, email, PASSWORD, ACCOUNTS.student.home);
    await student.goto("/me/modules");
    await untilHydrated(student);
    await student.getByRole("link", { name: title }).click();
    await student.getByRole("button", { name: "Start", exact: true }).click();
    await expect(
      student.getByRole("heading", { level: 1, name: "Our games" }),
    ).toBeVisible();
    // The gallery opens only to those who have saved a project of their own.
    await expect(
      student.getByText(
        "Save a project of your own to see what your classmates made.",
      ),
    ).toBeVisible();
    await student
      .getByRole("button", { name: "Open the coding studio" })
      .click();
    const studio = student.getByRole("dialog", { name: "Coding studio" });
    await expect(spriteIn(studio)).toHaveValue("Sprite1", { timeout: 90_000 });
    await spriteIn(studio).fill(sprite);
    await spriteIn(studio).press("Enter");
    await studio.getByRole("button", { name: "Done", exact: true }).click();
    await expect(studio).toBeHidden({ timeout: 30_000 });
    await expect(
      student.getByText("Sent. Your teacher will mark it."),
    ).toBeVisible();
    return { context, student };
  };

  const first = await build(ACCOUNTS.student.email, "Hero");
  await first.student
    .getByRole("button", { name: "Show mine to the class" })
    .click();
  await expect(
    first.student.getByText(
      "Your project is waiting for your teacher to show it.",
    ),
  ).toBeVisible();
  await first.context.close();

  // A classmate sees nothing the teacher has not shown.
  const second = await build("student1008@northwind.example.com", "Mine");
  await expect(
    second.student.getByText("No classmate's project is in the gallery yet."),
  ).toBeVisible();

  // The teacher sees both being built, and shows the one offered.
  await page.goto(`${recordUrl}?tab=live`);
  await untilHydrated(page);
  await expect(page.getByText("Projects being built 2")).toBeVisible();
  await page.goto(`${recordUrl}?tab=answers`);
  await untilHydrated(page);
  await expect(page.getByText("Offered to the class gallery")).toBeVisible();
  await page.getByRole("button", { name: "Show to the class" }).click();
  await expect(page.getByText("In the class gallery")).toBeVisible();

  await second.student.reload();
  await untilHydrated(second.student);
  await second.student
    .getByRole("button", { name: "Yasmin Sabry's project" })
    .click();
  const shown = second.student.getByRole("dialog", { name: "Coding studio" });
  await expect(spriteIn(shown)).toHaveValue("Hero", { timeout: 90_000 });
  await shown.getByRole("button", { name: "Build on this project" }).click();
  await second.student
    .getByRole("dialog", { name: "Build on Yasmin Sabry's project?" })
    .getByRole("button", { name: "Build on this project" })
    .click();
  // The studio opens again on the classmate's project, saved as their own.
  await expect(
    second.student.getByText("You are now building on Yasmin Sabry's project."),
  ).toBeVisible({ timeout: 90_000 });
  const mine = second.student.getByRole("dialog", { name: "Coding studio" });
  await expect(spriteIn(mine)).toHaveValue("Hero");
  await mine.getByRole("button", { name: "Done", exact: true }).click();
  await expect(mine).toBeHidden({ timeout: 30_000 });
  await second.context.close();

  await page.reload();
  await untilHydrated(page);
  await expect(page.getByText("Built on Yasmin Sabry's project")).toBeVisible();
});

test("a teacher says what a finished project does, and each save ticks what the project has", async ({
  browser,
  page,
}) => {
  const title = `Checked games ${crypto.randomUUID().slice(0, 6)}`;
  const recordUrl = await startLesson(page, title, "Two sprites");
  await page.keyboard.type("/coding project");
  await page.getByRole("option", { name: /Coding project/ }).click();
  await page.keyboard.type("Make two sprites meet.");
  await page
    .getByRole("button", { name: "What a finished project does" })
    .click();
  await page
    .getByRole("menuitemcheckbox", { name: "Starts with the green flag" })
    .click();
  await page
    .getByRole("menuitemcheckbox", { name: "Has two sprites or more" })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-question]")).toHaveAttribute(
    "data-label",
    /project checks: 2/,
  );
  await openToStudents(page, recordUrl);

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await openAsStudent(student, title, "Two sprites");
  const list = student.getByRole("list").filter({
    hasText: "Starts with the green flag",
  });
  await expect(list.getByRole("listitem")).toHaveText([
    "Starts with the green flag",
    "Has two sprites or more",
  ]);
  await expect(
    student.getByText("Each is ticked when a saved project does it."),
  ).toBeVisible();

  await student.getByRole("button", { name: "Open the coding studio" }).click();
  const studio = student.getByRole("dialog", { name: "Coding studio" });
  const editor = studio.frameLocator('iframe[title="Coding studio"]');
  await expect(spriteIn(studio)).toHaveValue("Sprite1", { timeout: 90_000 });
  // A second sprite from the library, which the studio serves itself.
  await editor.getByRole("button", { name: "Choose a Sprite" }).first().click();
  await editor.getByRole("button", { name: "Abby", exact: true }).click();
  await expect(spriteIn(studio)).toHaveValue("Abby");
  await studio.getByRole("button", { name: "Done", exact: true }).click();
  await expect(studio).toBeHidden({ timeout: 30_000 });
  // Two sprites, and no script yet for the flag to start.
  await expect(student.getByText("1 of 2 so far")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveText([
    "Starts with the green flagNot yet",
    "Has two sprites or moreDone",
  ]);
  await studentContext.close();

  await page.goto(`${recordUrl}?tab=answers`);
  await untilHydrated(page);
  await expect(page.getByText("1 of 2 so far")).toBeVisible();
});
