import { expect, test } from "@playwright/test";

import { PASSWORD, signInWith, untilHydrated } from "./fixtures/sign-in";

// The seeded student Yasmin Sabry sits in 8A, kept by the seed's second
// teacher; her mother signs in with her number. Each browser writes its own
// words, so parallel projects never read each other's message as theirs.
const TEACHER = "teacher2.northwind@northwind.example.com";
const MOTHER = "parent1007@northwind.example.com";

test("a guardian replies to the teacher's note and the teacher reads it", async ({
  browser,
  page,
  browserName,
}) => {
  const words = `Signed and returned (${browserName} ${crypto.randomUUID().slice(0, 6)})`;
  await signInWith(page, MOTHER, PASSWORD, "/family");
  await page.goto("/family/messages");
  await untilHydrated(page);
  await page
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: /Yasmin Sabry/ })
    .click();
  await expect(page.getByText("About Yasmin Sabry").last()).toBeVisible();
  await page.locator("form [contenteditable=true]").last().click();
  await page.keyboard.type(words);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("list", { name: "Messages" })).toContainText(
    words,
  );

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await signInWith(teacher, TEACHER, PASSWORD, "/teach");
  await teacher.goto("/teach/messages");
  await untilHydrated(teacher);
  await teacher
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: /Yasmin Sabry/ })
    .click();
  await expect(teacher.getByRole("list", { name: "Messages" })).toContainText(
    words,
  );
  await teacherContext.close();
});

test("a teacher writes to a child's family from a new message", async ({
  page,
  browserName,
}) => {
  const words = `Trip on Thursday (${browserName} ${crypto.randomUUID().slice(0, 6)})`;
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/messages");
  await untilHydrated(page);
  await page.getByRole("button", { name: "New message" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("combobox", { name: /^Student/ }).click();
  await page.getByRole("combobox", { name: /Search/ }).fill("Yasmin");
  await page.getByRole("option", { name: "Yasmin Sabry" }).click();
  await sheet.locator("[contenteditable=true]").click();
  await page.keyboard.type(words);
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(/thread=/);
  await expect(page.getByRole("list", { name: "Messages" })).toContainText(
    words,
  );
});
