import type { Page } from "@playwright/test";

import { expect } from "@playwright/test";

import {
  ACCOUNTS,
  chooseFromMenu,
  PASSWORD,
  signInWith,
  untilHydrated,
} from "./sign-in";

// The seed's second teacher teaches Arabic to every grade; the seeded student
// sits in 8A. Each browser builds its own module, so none reads another's.
const TEACHER = "teacher2.northwind@northwind.example.com";

/** A module with one lesson open in the editor, its body ready to type in. */
export async function startLesson(page: Page, title: string, lesson: string) {
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/module-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Module title" }).fill(title);
  await page.getByRole("combobox", { name: "Classes" }).click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/modules\/[a-f0-9-]+/);
  const recordUrl = page.url().split("?")[0] ?? "";
  await page.getByRole("link", { name: "Add lesson" }).click();
  await expect(page).toHaveURL(/\/teach\/lesson-editor/);
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Lesson title" }).fill(lesson);
  await page.locator("#lesson-body").click();
  return recordUrl;
}

export async function openToStudents(page: Page, recordUrl: string) {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(recordUrl);
  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Open to students" }),
  );
  await expect(page.getByText("Module open to students")).toBeVisible();
}

export async function openAsStudent(page: Page, title: string, lesson: string) {
  await signInWith(
    page,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await page.goto("/me/modules");
  await untilHydrated(page);
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: lesson }),
  ).toBeVisible();
}
