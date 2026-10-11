import type { Locator, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { openAsStudent, openToStudents, startLesson } from "./fixtures/lessons";

const tray = (within: Page | Locator) =>
  within.locator(".blocklyFlyout .blocklyBlock");
// The tray is a workspace of its own; the program's blocks are the others.
const built = (within: Page | Locator) =>
  within.locator(".blocklySvg .blocklyBlock");

/**
 * Where a block is drawn. The editor draws on the frame after a change,
 * so a block's place is read once it has stopped moving.
 */
async function shapeOf(block: Locator) {
  const shape = block.locator(":scope > .blocklyPath").first();
  let last = await shape.boundingBox();
  await expect
    .poll(async () => {
      const now = await shape.boundingBox();
      const still = JSON.stringify(now) === JSON.stringify(last);
      last = now;
      return still;
    })
    .toBe(true);
  if (!last) throw new Error("the block is not drawn");
  return last;
}

/**
 * Keys pressed as fast as a script can press them reach the editor before
 * it has drawn what the last one did, which no hand can do; it loses its
 * place then. This waits for it to draw.
 */
const drawn = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );

/**
 * Drags a block by its top corner to where that corner should land. A
 * block snaps to the nearest place it fits, so near enough is enough.
 */
async function drag(page: Page, block: Locator, to: { x: number; y: number }) {
  const from = await shapeOf(block);
  const grip = { x: from.x + 14, y: from.y + 14 };
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x + 20, grip.y - 20, { steps: 4 });
  await page.mouse.move(to.x + 14, to.y + 14, { steps: 12 });
  await page.mouse.up();
}

test("a teacher picks a loop puzzle, and a student solves it with blocks after a first try falls short", async ({
  browser,
  page,
}) => {
  const title = `Puzzles ${crypto.randomUUID().slice(0, 6)}`;
  const recordUrl = await startLesson(page, title, "Loops");
  await page.keyboard.type("/blocks puzzle");
  await page.getByRole("option", { name: /Blocks puzzle/ }).click();
  await page.keyboard.type("Walk to the star with as few blocks as you can.");
  const question = page.locator("[data-question]");
  await expect(question).toHaveAttribute("data-kind", "puzzle");
  await expect(question.locator("[data-puzzle] svg")).toBeVisible();

  // The teacher starts from a ready-made puzzle, whose answer already solves it.
  await page.getByRole("button", { name: "Change the puzzle" }).click();
  const designer = page.getByRole("dialog", { name: "Make the puzzle" });
  await designer.getByRole("button", { name: "Loops 1", exact: true }).click();
  await expect(
    designer.getByText("Your program solves the puzzle."),
  ).toBeVisible();
  await expect(designer.getByText("Blocks: 2 of 2")).toBeVisible();
  await designer.getByRole("button", { name: "Save puzzle" }).click();
  await expect(designer).toBeHidden();
  await openToStudents(page, recordUrl);

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await openAsStudent(student, title, "Loops");
  const puzzle = student.locator('[data-puzzle="blocks"]');
  await expect(puzzle.getByText("Blocks: 0 of 2")).toBeVisible();
  await expect(tray(puzzle)).toHaveCount(2);

  // Repeat goes under "when run", and "move forward" inside it. A block is
  // a row of 48 at the editor's scale, and what a loop holds sits 16 in.
  const start = await shapeOf(built(puzzle).first());
  const canvas = puzzle.locator(".blocklySvg .blocklyBlockCanvas");
  const scale = Number(
    /scale\(([\d.]+)\)/.exec(
      (await canvas.getAttribute("transform")) ?? "",
    )?.[1] ?? 1,
  );
  await drag(student, tray(puzzle).filter({ hasText: "repeat" }), {
    x: start.x,
    y: start.y + 48 * scale,
  });
  await expect(built(puzzle).first()).toContainText("repeat");
  await drag(student, tray(puzzle).filter({ hasText: "move forward" }), {
    x: start.x + 16 * scale,
    y: start.y + 96 * scale,
  });
  await expect(built(puzzle).nth(1)).toContainText("move forward");
  await expect(puzzle.getByText("Blocks: 2 of 2")).toBeVisible();
  // The tray gives no third block: the puzzle allows two.
  await expect(tray(puzzle).first()).toHaveClass(/blocklyDisabled/);

  // Four steps stop short of the star, and the try counts as one.
  await puzzle.getByRole("button", { name: "Run", exact: true }).click();
  await expect(puzzle.locator("output")).toContainText("Not there yet");
  await expect(student.getByText("Not quite")).toBeVisible();

  // Six reach it.
  await built(puzzle).nth(1).locator(".blocklyEditableField").click();
  await student.locator(".blocklyHtmlInput").fill("6");
  await student.keyboard.press("Enter");
  await puzzle.getByRole("button", { name: "Run", exact: true }).click();
  await expect(puzzle.locator("output")).toContainText("You reached the star!");
  await expect(
    student.getByRole("paragraph").filter({ hasText: /^Right$/ }),
  ).toBeVisible();
  await studentContext.close();
});

test("a student builds a program with the keyboard alone, each block joining the end of it", async ({
  browser,
  page,
}) => {
  const title = `Keys ${crypto.randomUUID().slice(0, 6)}`;
  const recordUrl = await startLesson(page, title, "Straight on");
  await page.keyboard.type("/blocks puzzle");
  await page.getByRole("option", { name: /Blocks puzzle/ }).click();
  await page.keyboard.type("Walk to the star.");
  await expect(page.locator("[data-question]")).toHaveAttribute(
    "data-kind",
    "puzzle",
  );
  await openToStudents(page, recordUrl);

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await openAsStudent(student, title, "Straight on");
  const puzzle = student.locator('[data-puzzle="blocks"]');
  await expect(tray(puzzle)).toHaveCount(1);
  // Tab reaches the tray before the program, so nowhere in the program
  // has been stood on when the first block is taken.
  await puzzle.getByRole("button", { name: "Show as Python" }).focus();
  await student.keyboard.press("Tab");
  for (const count of [1, 2, 3]) {
    // Enter takes the block, Enter again leaves it where it is offered.
    await student.keyboard.press("Enter");
    await drawn(student);
    await student.keyboard.press("Enter");
    await expect(puzzle.getByText(`Blocks: ${count} of 3`)).toBeVisible();
    await drawn(student);
    await student.keyboard.press("t");
    await drawn(student);
  }
  await puzzle.getByRole("button", { name: "Run", exact: true }).press("Enter");
  await expect(puzzle.locator("output")).toContainText("You reached the star!");
  await expect(
    student.getByRole("paragraph").filter({ hasText: /^Right$/ }),
  ).toBeVisible();
  await studentContext.close();
});

test("a teacher walls off a row of arrows, and a young child walks round it", async ({
  browser,
  page,
}) => {
  const title = `Arrows ${crypto.randomUUID().slice(0, 6)}`;
  const recordUrl = await startLesson(page, title, "Find the star");
  await page.keyboard.type("/arrow path");
  await page.getByRole("option", { name: /Arrow path/ }).click();
  await page.keyboard.type("Help the hero reach the star.");
  await expect(page.locator("[data-question]")).toHaveAttribute(
    "data-label",
    /^Arrow path/,
  );

  await page.getByRole("button", { name: "Change the puzzle" }).click();
  const designer = page.getByRole("dialog", { name: "Make the puzzle" });
  const save = designer.getByRole("button", { name: "Save puzzle" });
  await expect(save).toBeEnabled();
  // A wall across the corridor leaves no way through, and nothing to save.
  await designer.getByRole("button", { name: "Column 2, row 1: Open" }).click();
  await expect(
    designer.getByRole("button", { name: "Column 2, row 1: Wall" }),
  ).toBeVisible();
  await expect(designer.getByText(/does not solve the puzzle/)).toBeVisible();
  await expect(save).toBeDisabled();
  // A second row opens a way round, once the teacher walks it.
  await designer.getByRole("button", { name: "Rows: add one" }).click();
  const answer = designer.locator('[data-puzzle="arrows"]');
  await answer.getByRole("button", { name: "Clear", exact: true }).click();
  for (const arrow of ["Down", "Right", "Right", "Right", "Up"])
    await answer.getByRole("button", { name: arrow, exact: true }).click();
  await answer.getByRole("button", { name: "Run", exact: true }).click();
  await expect(answer.locator("output")).toContainText("You reached the star!");
  await expect(
    designer.getByText("Your program solves the puzzle."),
  ).toBeVisible();
  await save.click();
  await expect(designer).toBeHidden();
  await openToStudents(page, recordUrl);

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await openAsStudent(student, title, "Find the star");
  const puzzle = student.locator('[data-puzzle="arrows"]');
  // Straight on meets the wall.
  await puzzle.getByRole("button", { name: "Right", exact: true }).click();
  await puzzle.getByRole("button", { name: "Run", exact: true }).click();
  await expect(puzzle.locator("output")).toContainText("hit a wall");
  // The step that went wrong is taken out, and the way round put in.
  await puzzle.getByRole("button", { name: "Remove step 1: Right" }).click();
  for (const arrow of ["Down", "Right", "Right", "Right", "Up"])
    await puzzle.getByRole("button", { name: arrow, exact: true }).click();
  await expect(puzzle.getByRole("list", { name: "Your steps" })).toBeVisible();
  await puzzle.getByRole("button", { name: "Run", exact: true }).click();
  await expect(puzzle.locator("output")).toContainText("You reached the star!");
  await expect(
    student.getByRole("paragraph").filter({ hasText: /^Right$/ }),
  ).toBeVisible();
  await studentContext.close();
});
