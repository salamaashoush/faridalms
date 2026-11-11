import { expect, test } from "@playwright/test";

import { PASSWORD, signIn, signInWith } from "./fixtures/sign-in";

// Lessons and registers depend on the weekday the suite runs, so these checks
// hold on any day: classes, announcements and attendance always have a card.
test("a teacher's day lists their classes and opens one", async ({ page }) => {
  await signInWith(
    page,
    "teacher2.northwind@northwind.example.com",
    PASSWORD,
    "/today",
  );
  const classes = page.getByRole("region", { name: "Classes" });
  await expect(classes).toBeVisible();
  await classes.getByRole("link", { name: "8A Arabic" }).click();
  await expect(page).toHaveURL(/\/classes\/[a-f0-9-]+/);
});

test("a family's home shows their child and the latest announcements", async ({
  page,
}) => {
  await signInWith(
    page,
    "parent1007@northwind.example.com",
    PASSWORD,
    "/family",
  );
  await expect(
    page.getByRole("region", { name: "Yasmin Sabry" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Announcements" }),
  ).toBeVisible();
});

// Each browser asks as a family of its own: a guardian may keep only a few
// requests about one child open at a time.
const FAMILY: Record<string, string> = {
  chromium: "parent1001@northwind.example.com",
  firefox: "parent1002@northwind.example.com",
  webkit: "parent1003@northwind.example.com",
};

test("a guardian reads what the school holds about their child and asks the office to correct it", async ({
  page,
  browserName,
}) => {
  await signInWith(page, FAMILY[browserName] ?? "", PASSWORD, "/family");
  await page.goto("/family/children");
  await page.getByRole("link", { name: "Details" }).first().click();
  await expect(page).toHaveURL(/\/family\/details\?studentId=/);
  await expect(
    page.getByRole("heading", { level: 1, name: /'s details$/ }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "At school" })).toContainText(
    /NO\d+/,
  );
  await expect(
    page.getByRole("region", { name: "Your contact details" }),
  ).toContainText("@northwind.example.com");

  await page.getByRole("button", { name: "Ask to correct" }).click();
  const sheet = page.getByRole("dialog", {
    name: /^Ask the school to correct/,
  });
  // What should change has to be said before anything is sent.
  await sheet.getByRole("button", { name: "Send request" }).click();
  await expect(sheet.getByText("This field is required")).toBeVisible();
  await sheet
    .getByRole("textbox", { name: "What should change" })
    .fill("The family name is spelt Nasser, with two s.");
  await sheet.getByRole("button", { name: "Send request" }).click();
  await expect(
    page.getByText(/^Sent to the school office, which must answer by /),
  ).toBeVisible();
  await expect(sheet).toBeHidden();
});

test("the office sees how attendance is going", async ({ page }) => {
  await signIn(page, "admin");
  await expect(page.getByRole("region", { name: "Attendance" })).toBeVisible();
});
