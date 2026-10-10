import { expect, test } from "@playwright/test";

import { PASSWORD, signInWith, untilHydrated } from "./fixtures/sign-in";

// The seed's second teacher wrote "Reading stories together", whose second
// lesson asks questions. Printing changes nothing, so every browser may
// read the same lesson.
const TEACHER = "teacher2.northwind@northwind.example.com";

test("a teacher prints a lesson as paper, with its questions to write on and their answers", async ({
  page,
}) => {
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/modules");
  await untilHydrated(page);
  await page
    .getByRole("link", { name: "Reading stories together" })
    .first()
    .click();
  await page.getByRole("link", { name: "Check your understanding" }).click();
  await expect(page).toHaveURL(/\/lessons\/[a-f0-9-]+/);
  await untilHydrated(page);

  await page.getByRole("button", { name: "More actions" }).last().click();
  await page.getByRole("menuitem", { name: "Print…" }).click();
  const sheet = page.getByRole("dialog", { name: "Print" });
  await expect(sheet).toBeVisible();
  const paper = sheet.locator(".paper-flow").first();

  // The paper carries the lesson's name, somewhere to write the student's,
  // and each question in a form to answer by hand: lettered options.
  await expect(
    paper.getByRole("heading", { name: "Check your understanding" }),
  ).toBeVisible();
  await expect(paper.getByText("Name", { exact: true })).toBeVisible();
  await expect(
    paper.getByText("Which of these is part of every story?"),
  ).toBeVisible();
  await expect(paper.getByText("a)", { exact: true }).first()).toBeVisible();
  // A student's copy says nothing of the answers.
  await expect(
    paper.getByText("Stories move because a problem needs solving."),
  ).toHaveCount(0);

  await sheet.getByText("Teacher's copy", { exact: true }).click();
  await expect(
    paper.getByText("Teacher's copy: answers in grey"),
  ).toBeVisible();
  await expect(
    paper.getByText("Stories move because a problem needs solving."),
  ).toBeVisible();

  await sheet.getByText("Answer key at the end", { exact: true }).click();
  await expect(
    sheet.getByRole("heading", {
      name: "Answer key: Check your understanding",
    }),
  ).toBeVisible();

  // Only the pages print: the bar and the settings stay on the screen.
  const print = sheet.getByRole("button", { name: "Print", exact: true });
  await expect(print).toBeEnabled();
  await page.emulateMedia({ media: "print" });
  await expect(print).toBeHidden();
  await expect(sheet.getByText("Paper size")).toBeHidden();
  await expect(
    paper.getByRole("heading", { name: "Check your understanding" }),
  ).toBeVisible();
  await page.emulateMedia({ media: null });

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
});
