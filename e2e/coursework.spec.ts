import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  PASSWORD,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seed's second teacher teaches Arabic to every grade; the seeded student
// sits in 8A. Each browser sets its own assignment, so none reads another's.
const TEACHER = "teacher2.northwind@northwind.example.com";

test("a teacher assigns work, a student hands it in, and the returned grade reaches the student", async ({
  browser,
  page,
}) => {
  const title = `Letter ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/assignment-editor");
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Write a short letter about your weekend.");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.locator("#work-due").fill(`${tomorrow}T14:00`);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(
    page.getByText("Assigned", { exact: true }).first(),
  ).toBeVisible();
  const recordUrl = page.url().split("?")[0] ?? "";

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInWith(
    student,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await student.goto("/me/assignments");
  await untilHydrated(student);
  await student.getByRole("link", { name: title }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await student.locator("[contenteditable=true]").first().click();
  await student.keyboard.type("Dear Omar, I visited my grandparents.");
  await student.getByRole("button", { name: "Hand in", exact: true }).click();
  await student
    .getByRole("dialog")
    .getByRole("button", { name: "Hand in", exact: true })
    .click();
  await expect(
    student.getByRole("region", { name: "Handed in" }).getByText("Attempt 1"),
  ).toBeVisible();
  await expect(student.getByText("Undo hand in")).toBeVisible();

  await page.goto(`${recordUrl}?tab=work`);
  await untilHydrated(page);
  // The seeded student is Yasmin Sabry.
  const row = page
    .getByRole("tabpanel")
    .getByRole("row", { name: /Yasmin Sabry/ });
  await expect(row.getByText("Handed in", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Grade", exact: true }).click();
  await expect(page).toHaveURL(/\/teach\/grading/);
  await page.locator("#grade-score").fill("8");
  await page.locator("#grade-feedback").fill("A warm, well organised letter.");
  await page.getByRole("button", { name: "Return and next" }).click();
  await expect(page).toHaveURL(/tab=work/);
  await expect(
    page
      .getByRole("tabpanel")
      .getByRole("row", { name: /Yasmin Sabry/ })
      .getByText("Returned", { exact: true }),
  ).toBeVisible();

  await student.reload();
  await untilHydrated(student);
  await expect(
    student.getByText("A warm, well organised letter."),
  ).toBeVisible();
  await expect(student.getByText("8 / 10")).toBeVisible();
  await studentContext.close();
});

test("a teacher's gradebook shows the class's work and term grades", async ({
  page,
}) => {
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/gradebook");
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Gradebook" }),
  ).toBeVisible();
  const sheet = page.getByRole("table");
  await expect(
    sheet.getByRole("columnheader", { name: "Chapter 1 review" }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("columnheader", { name: "Term grade" }),
  ).toBeVisible();
});
