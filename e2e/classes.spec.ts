import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

// Each browser project runs against the same seeded school, so each moves
// its own student and none finds a roster another has already changed.
const JOINED = {
  chromium: "Adam Sabry",
  firefox: "Jana Zaki",
  webkit: "Mostafa Helmy",
} as const;

const MOVED = {
  chromium: "Yasmin Rashad",
  firefox: "Nour Fathy",
  webkit: "Ali Farouk",
} as const;

async function openClass(page: Page, name: string) {
  await page.goto("/classes");
  await untilHydrated(page);
  await page
    .getByRole("table")
    .getByRole("link", { name, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name, exact: true }),
  ).toBeVisible();
}

test("an administrator adds a class and a student from another class joins it", async ({
  page,
  browserName,
}) => {
  const student = JOINED[browserName];
  const unique = crypto.randomUUID().slice(0, 8);
  const title = `Test ${unique}`;
  await signIn(page, "admin");
  await page.goto("/classes");
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add class", exact: true }).click();
  await expect(page).toHaveURL(/\/class-editor/);

  await page
    .getByRole("textbox", { name: "Class name in Arabic" })
    .fill(`تجربة ${unique}`);
  await page
    .getByRole("textbox", { name: "Class name in English" })
    .fill(title);
  await page.getByRole("textbox", { name: /^Class code/ }).fill(`T-${unique}`);
  await page.getByRole("combobox", { name: /^Grade/ }).click();
  await page.getByRole("option", { name: "Grade 8", exact: true }).click();
  // A subject is added in its own sheet and kept with the class.
  await page.getByRole("button", { name: "Add subject", exact: true }).click();
  const subject = page.getByRole("dialog", { name: "Add subject" });
  await subject.getByRole("combobox", { name: /^Subject (?!teacher)/ }).click();
  await page.getByRole("option", { name: "Arabic", exact: true }).click();
  await subject.getByRole("button", { name: "Add subject" }).click();
  await expect(subject).toBeHidden();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/classes/);

  await page.getByRole("searchbox").fill(`T-${unique}`);
  await expect(page).toHaveURL(new RegExp(`q=T-${unique}`));
  await page
    .getByRole("table")
    .getByRole("link", { name: title, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Subjects" })
      .getByRole("link", { name: "Arabic", exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Students", exact: true }).click();
  const roster = page.getByRole("region", { name: "Students" });
  await expect(
    roster.getByText("No students in this class on this day."),
  ).toBeVisible();
  await roster
    .getByRole("button", { name: "Add student", exact: true })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("combobox", { name: /^Student/ }).click();
  await page.getByRole("combobox", { name: /^Search/ }).fill(student);
  await page.getByRole("option", { name: student, exact: true }).click();
  await sheet.getByRole("button", { name: "Add student", exact: true }).click();
  await expect(
    page.getByText(`${student} moved to ${title}`, { exact: true }),
  ).toBeVisible();
  await expect(
    roster.getByRole("link", { name: student, exact: true }),
  ).toBeVisible();

  await roster.getByRole("link", { name: student, exact: true }).click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
  await page.getByRole("tab", { name: "Enrollment", exact: true }).click();
  const classes = page.getByRole("region", { name: "Classes" });
  await expect(
    classes.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  // Rollovers running beside this spec give the student next year's 8A too;
  // the class they left is this year's.
  await expect(
    classes
      .getByRole("listitem")
      .filter({ hasText: "2026–2027" })
      .getByRole("link", { name: "8A", exact: true }),
  ).toBeVisible();
});

test("an administrator moves a student to another class from today", async ({
  page,
  browserName,
}) => {
  const student = MOVED[browserName];
  await signIn(page, "admin");
  await openClass(page, "9A");
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  const roster = page.getByRole("region", { name: "Students" });
  await roster
    .getByRole("button", { name: `Actions for ${student}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Move class", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("combobox", { name: /^New class/ }).click();
  await page.getByRole("option", { name: "8A", exact: true }).click();
  await expect(sheet.getByRole("status")).toContainText("8A");
  await sheet.getByRole("button", { name: "Move class", exact: true }).click();
  await expect(
    page.getByText(`${student} moved to 8A`, { exact: true }),
  ).toBeVisible();
  await expect(
    roster.getByRole("link", { name: student, exact: true }),
  ).toHaveCount(0);

  await openClass(page, "8A");
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Students" })
      .getByRole("link", { name: student, exact: true }),
  ).toBeVisible();
});

test("a class code already used this year is refused with its reason", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/classes");
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add class", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Class name in English" })
    .fill("Duplicate");
  await page.getByRole("textbox", { name: /^Class code/ }).fill("7-A");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Another class this year already uses this code.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/class-editor/);
});

test("a teacher opens their class without enrolment or editing controls", async ({
  page,
}) => {
  await signIn(page, "teacher");
  await page.goto("/classes");
  await untilHydrated(page);
  await page
    .getByRole("table")
    .getByRole("link", { name: "7A", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "7A", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit class" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  const roster = page.getByRole("region", { name: "Students" });
  await expect(roster.getByRole("listitem")).toHaveCount(6);
  await expect(roster.getByRole("button", { name: "Add student" })).toHaveCount(
    0,
  );
  await expect(
    roster.getByRole("button", { name: /^Actions for/ }),
  ).toHaveCount(0);
});

test("a teacher finds a class's file by its name and its kind", async ({
  page,
}) => {
  const unique = crypto.randomUUID().slice(0, 8);
  const notes = `notes-${unique}.txt`;
  const picture = `board-${unique}.png`;
  await signIn(page, "teacher");
  await page.goto("/classes");
  await untilHydrated(page);
  await page
    .getByRole("table")
    .getByRole("link", { name: "7A", exact: true })
    .click();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await page.locator("input[type=file][multiple]").setInputFiles([
    {
      name: notes,
      mimeType: "text/plain",
      buffer: Buffer.from("Bring a ruler on Sunday."),
    },
    {
      name: picture,
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    },
  ]);
  const table = page.getByRole("table");
  await page
    .getByRole("searchbox", { name: "Search files", exact: true })
    .fill(unique);
  await expect(table.getByText(notes, { exact: true })).toBeVisible();
  await expect(table.getByText(picture, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Type", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: /^Pictures/ }).click();
  await page.keyboard.press("Escape");
  await expect(table.getByText(picture, { exact: true })).toBeVisible();
  await expect(table.getByText(notes, { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/fileKinds=/);
});
