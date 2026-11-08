import { expect, test } from "@playwright/test";

import { ANTHROPIC_STAND_IN } from "./fixtures/assistant";
import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seed's second teacher teaches Arabic to every grade, as in the
// learning spec; each run builds its own module.
const TEACHER = "teacher2.northwind@northwind.example.com";

test.describe.configure({ mode: "serial" });

test("an administrator turns the language model on for the school's teachers", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/settings?section=assistant");
  await untilHydrated(page);
  await expect(page.getByText("Help from a language model")).toBeVisible();
  const enabled = page.getByRole("checkbox", { name: "Let teachers use it" });
  if (!(await enabled.isChecked())) await enabled.click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});

test("a teacher adds suggested questions one by one and levels a paragraph, sending only their words", async ({
  page,
}) => {
  const title = `Plants ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/module-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Module title" }).fill(title);
  await page.getByRole("combobox", { name: "Classes" }).click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/modules\/[a-f0-9-]+/);
  await page.getByRole("link", { name: "Add lesson" }).click();
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Lesson title" }).fill("Food");
  await page.locator("#lesson-body").click();
  await page.keyboard.type("Plants make their food from light in the leaves.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Offered once the lesson is stored: the insert menu asks for questions.
  await page.keyboard.press("Enter");
  await page.keyboard.type("/suggest");
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Writing help" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Ask" }).click();
  await expect(
    panel.getByText("What do plants need to make their food?"),
  ).toBeVisible();
  // Nothing is in the lesson until the teacher adds it.
  await expect(page.locator("[data-question]")).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Add to the document" })
    .first()
    .click();
  await expect(panel.getByRole("button", { name: "Added" })).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("[data-question]")).toHaveCount(1);

  // A selected paragraph is rewritten for a reading level, kept on request.
  await page
    .locator("#lesson-body")
    .getByText("Plants make their food")
    .click({ clickCount: 3 });
  await page.getByRole("button", { name: "Writing help" }).click();
  await expect(
    panel.getByRole("radio", { name: "Level this text" }),
  ).toBeChecked();
  await panel.getByRole("button", { name: "Ask" }).click();
  await expect(panel.getByText("A short and simple text.")).toBeVisible();
  await panel.getByRole("button", { name: "Replace the text" }).click();
  await expect(
    page.locator("#lesson-body").getByText("A short and simple text."),
  ).toBeVisible();

  const sent = (await (
    await page.request.get(`${ANTHROPIC_STAND_IN}/e2e/requests`)
  ).json()) as { user: string }[];
  const words = sent.map((request) => request.user).join("\n");
  expect(words).toContain("Plants make their food from light in the leaves.");
  expect(words).not.toContain("teacher2");
});

test("a drafted translation waits for a person's check before students have it", async ({
  page,
}) => {
  const title = `Rivers ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/module-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Module title" }).fill(title);
  await page.getByRole("combobox", { name: "Classes" }).click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/modules\/[a-f0-9-]+/);
  await page.getByRole("link", { name: "Add lesson" }).click();
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Lesson title" }).fill("Rivers");
  await page.locator("#lesson-body").click();
  await page.keyboard.type("Rivers carve valleys.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Details" }).click();
  await page.locator("#lesson-language").click();
  await page.getByRole("option", { name: "English" }).click();
  await page.getByRole("checkbox", { name: /Also write it in Arabic/ }).click();
  await page.getByRole("button", { name: "Draft the translation" }).click();
  await expect(
    page.getByText("The draft is in the translation."),
  ).toBeVisible();
  await expect(
    page.locator("#lesson-body").getByText("ترجمة Rivers carve valleys."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Nobody has checked the translation against the original yet.",
    ),
  ).toBeVisible();
});
