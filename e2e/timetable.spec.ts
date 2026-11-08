import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser project plans its own homeroom, from a day after today so
// the weeks other specs read stay as seeded.
const HOMEROOM = { chromium: "7A", firefox: "8A", webkit: "9A" } as const;

test("an administrator changes a lesson from a day and the week shows it", async ({
  page,
  browserName,
}) => {
  const homeroom = HOMEROOM[browserName as keyof typeof HOMEROOM];
  await signIn(page, "admin");
  await page.goto("/timetable?from=2026-11-05");
  await untilHydrated(page);
  await page.getByRole("combobox", { name: /^Class/ }).click();
  await page.getByRole("option", { name: homeroom, exact: true }).click();
  const cell = page.getByRole("button", { name: "Edit Thursday, Period 6" });
  const before = (await cell.textContent()) ?? "";
  await cell.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("combobox", { name: /^Lesson/ }).click();
  await expect(page.getByRole("option").first()).toBeVisible();
  const names = (await page.getByRole("option").allTextContents()).map((name) =>
    name.trim(),
  );
  const lessons = names.filter((name) => name.startsWith(homeroom));
  const original = lessons.find((name) => before.startsWith(name)) ?? "";
  const lesson = lessons.find((name) => name !== original) ?? "";
  expect(lesson).not.toBe("");
  await page.getByRole("option", { name: lesson, exact: true }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  const busy = page.getByRole("button", { name: "Keep both" });
  await expect(page.getByText("Timetable updated").or(busy)).toBeVisible();
  if (await busy.isVisible()) await busy.click();
  await expect(page.getByText("Timetable updated")).toBeVisible();
  await expect(cell).toContainText(lesson);

  await page.goto("/timetable?from=2026-11-04");
  await untilHydrated(page);
  await page.getByRole("combobox", { name: /^Class/ }).click();
  await page.getByRole("option", { name: homeroom, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Thursday, Period 6" }),
  ).toContainText(original);
});

test("a teacher reads their week", async ({ page }) => {
  await signInWith(
    page,
    "teacher2.northwind@northwind.example.com",
    PASSWORD,
    "/today",
  );
  await page.goto("/timetable");
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Timetable" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Arabic");
});

test("a student reads their week on a phone, a day at a time", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student");
  await page.goto("/me/timetable");
  const days = page.getByRole("group", { name: "Days of the week" });
  await expect(days).toBeVisible();
  await days.getByRole("button", { name: "Mon" }).click();
  await expect(days.getByRole("button", { name: "Mon" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Period 1").last()).toBeVisible();
});
