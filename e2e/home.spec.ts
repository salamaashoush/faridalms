import { expect, test } from "@playwright/test";

import { PASSWORD, signIn, signInWith } from "./fixtures/sign-in";

// Lessons and registers depend on the weekday the suite runs, so these checks
// hold on any day: classes, family news and attendance always have a card.
test("a teacher's day lists their classes and opens one", async ({ page }) => {
  await signInWith(
    page,
    "teacher2.northwind@northwind.example.com",
    PASSWORD,
    "/teach",
  );
  const classes = page.getByRole("region", { name: "Classes" });
  await expect(classes).toBeVisible();
  await classes.getByRole("link", { name: "8A Arabic" }).click();
  await expect(page).toHaveURL(/\/classes\/[a-f0-9-]+/);
});

test("a family's home shows their child and the latest school news", async ({
  page,
}) => {
  await signInWith(page, "parent1007@northwind.example.com", PASSWORD, "/family");
  await expect(
    page.getByRole("region", { name: "Yasmin Sabry" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Latest news" })).toBeVisible();
});

test("the office sees how attendance is going", async ({ page }) => {
  await signIn(page, "admin");
  await expect(page.getByRole("region", { name: "Attendance" })).toBeVisible();
});
