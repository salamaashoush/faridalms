import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  PASSWORD,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seed's second teacher teaches Arabic to every grade; the seeded student
// sits in 8A. Each browser builds its own module, so none reads another's.
const TEACHER = "teacher2.northwind@northwind.example.com";

test("a young child plays a lesson one screen at a time, by tapping", async ({
  browser,
  page,
}) => {
  const title = `Counting ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/module-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Module title" }).fill(title);
  await page.getByRole("combobox", { name: "Classes" }).click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/modules\/[a-f0-9-]+/);

  await page.getByRole("link", { name: "Add lesson" }).click();
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Lesson title" }).fill("Ducks");
  await page.locator("#lesson-body").click();
  await page.keyboard.type("/choice");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Which one swims?");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Duck");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Cat");
  await page
    .locator("[data-question-option]")
    .first()
    .click({ position: { x: 12, y: 14 } });
  await page.locator("[data-question-option]").nth(1).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/count");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Put 3 ducks in the frame.");
  const bar = page.getByRole("toolbar", { name: "Question options" });
  await bar.getByRole("button", { name: "What the child does" }).click();
  await page
    .getByRole("menuitem", { name: "Puts that many in ten frames" })
    .click();
  await page.locator("[data-question-prompt]").last().click();
  await bar.getByRole("button", { name: "How many there are" }).click();
  await page.getByRole("menuitem", { name: "3", exact: true }).click();
  await page.getByRole("checkbox", { name: "For young children" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Open to students" }).click();
  await expect(page.getByText("Module open to students")).toBeVisible();

  const context = await browser.newContext();
  const child = await context.newPage();
  await signInWith(child, ACCOUNTS.student.email, PASSWORD, "/me");
  await child.goto("/me/modules");
  await untilHydrated(child);
  await child.getByRole("link", { name: title }).click();
  await child.getByRole("button", { name: "Start", exact: true }).click();

  const stage = child.getByRole("dialog", { name: "Ducks" });
  // Taps in a screen's first 400 ms are a finger still down from the last
  // one, and are dropped, so the child waits as a person would.
  const settle = () => child.waitForTimeout(450);
  await stage.getByRole("button", { name: "Start" }).click();
  const next = stage.getByRole("button", { name: "Next" });
  await expect(next).toBeDisabled();
  await settle();
  await stage.getByRole("button", { name: "Cat" }).click();
  await expect(stage.locator("output")).toContainText("Not yet");
  await stage.getByRole("button", { name: "Duck" }).click();
  await expect(stage.locator("output")).toContainText(
    "You kept trying and found it!",
  );
  await next.click();
  await settle();
  const putOne = stage.getByRole("button", { name: "Put one in" });
  await putOne.click();
  await putOne.click();
  await putOne.click();
  await stage.getByRole("button", { name: "Check" }).click();
  await expect(stage.locator("output")).toContainText("You made 3!");
  // The last screen hands the work in with a check rather than an arrow.
  await stage.getByRole("button", { name: "I'm done" }).click();
  await expect(stage.getByText("You did it!")).toBeVisible();
  await context.close();
});
