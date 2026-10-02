import { expect, test } from "@playwright/test";

import { PASSWORD, signInWith, untilHydrated } from "./fixtures/sign-in";

const TEACHER = "teacher1.northwind-east@northwind.example.com";

test("a teacher prints sign-in badges for a young class", async ({ page }) => {
  await signInWith(page, TEACHER, PASSWORD, "/teach", "northwind-east");
  await page.goto("/teach/classes");
  await untilHydrated(page);
  await page.getByRole("link", { name: "KG2A" }).first().click();
  await page.getByRole("tab", { name: "Students" }).click();
  await page.getByRole("link", { name: "Sign-in badges" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign-in badges", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Print badges for everyone" }).click();
  // Another browser may have printed this class's badges first, and then
  // replacing them takes a confirmation.
  const sheet = page.getByRole("dialog", { name: "Badges for KG2A" });
  const confirm = page.getByRole("button", { name: "Print new badges" });
  await expect(sheet.or(confirm)).toBeVisible();
  if (await confirm.isVisible()) await confirm.click();
  await expect(sheet.getByRole("listitem")).toHaveCount(5);
  await expect(sheet.getByText("Show me to the camera").first()).toBeVisible();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(/^Printed /).first()).toBeVisible();
});

test("a badge that does not work says so, and leaves no secret in the address", async ({
  page,
}) => {
  await page.goto(`/badge?school=northwind-east#${"x".repeat(43)}`);
  await expect(page.getByRole("alert")).toHaveText(
    "This badge does not work any more. Ask your teacher for a new one.",
  );
  expect(new URL(page.url()).hash).toBe("");
  await page.getByRole("link", { name: "Sign in with a password" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a parent hands the device to a young child and a grown-up's answer brings them back", async ({
  page,
}) => {
  await signInWith(
    page,
    "parent1020@northwind.example.com",
    PASSWORD,
    "/family",
    "northwind-east",
  );
  await untilHydrated(page);
  await page.getByRole("button", { name: /^Hand over to / }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Hello, /);
  await expect(page.getByRole("button", { name: "Account" })).toHaveCount(0);

  await page.getByRole("button", { name: "Grown-ups" }).click();
  const gate = page.getByRole("dialog", {
    name: "Back to the grown-up's account",
  });
  await gate.getByRole("textbox").fill("1");
  await gate.getByRole("button", { name: "Continue" }).click();
  await expect(gate.getByRole("alert")).toBeVisible();
  const [a, b] = (await gate.locator("label").innerText())
    .split("×")
    .map((side) => Number(side.trim()));
  await gate.getByRole("textbox").fill(String((a ?? 0) * (b ?? 0)));
  await gate.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/family$/);
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
});
