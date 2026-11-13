import type { Locator, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { BARE } from "./fixtures/sign-in";

const board = (page: Page) => page.locator("#fit");
const preview = (page: Page) =>
  page.getByLabel("The product with these modules");

/**
 * Sets a switch. The page is drawn on the server, so a click that lands
 * before the browser has taken it over does nothing: the switch is pressed
 * until it reports the state asked for.
 */
async function set(button: Locator, pressed: boolean) {
  await expect(async () => {
    if ((await button.getAttribute("aria-pressed")) !== String(pressed))
      await button.click();
    await expect(button).toHaveAttribute("aria-pressed", String(pressed), {
      timeout: 1000,
    });
  }).toPass();
}

test("the product's site redraws the product as its modules are switched", async ({
  page,
}) => {
  await page.goto(BARE);
  await expect(
    page.getByRole("heading", { level: 1, name: /Made to fit your school\./ }),
  ).toBeVisible();

  // It opens on a school with every part: families sign in, and the setup
  // guide speaks of the year, grades and guardians.
  const shown = preview(page);
  await expect(shown.getByText("Families, students and staff")).toBeVisible();
  await expect(shown.getByText("Students and families")).toBeVisible();
  await expect(
    shown.getByText("School year, terms and calendar"),
  ).toBeVisible();
  await expect(
    shown.getByRole("columnheader", { name: "Guardian's phone" }),
  ).toBeVisible();

  // Families off: the product stops saying so, in its own words.
  await set(
    board(page).getByRole("button", { name: "Families and guardians" }),
    false,
  );
  await expect(shown.getByText("Students and staff")).toBeVisible();
  await expect(shown.getByText("Families, students and staff")).toHaveCount(0);
  await expect(
    shown.getByText("Add or import the students, so they can sign in."),
  ).toBeVisible();
  await expect(
    shown.getByRole("columnheader", { name: "Guardian's phone" }),
  ).toHaveCount(0);

  // An academy of courses has no year, grade, homeroom or timetable.
  await set(
    board(page).getByRole("button", { name: "A course academy" }),
    true,
  );
  await expect(shown.getByRole("columnheader", { name: "Grade" })).toHaveCount(
    0,
  );
  await expect(
    shown.getByRole("columnheader", { name: "Homeroom" }),
  ).toHaveCount(0);
  await expect(
    shown.getByText("Open an intake so people can apply online."),
  ).toBeVisible();
  await expect(
    shown.getByText("Create the school's classes and give each its teacher."),
  ).toBeVisible();

  // A module another needs comes on with it, and leaves with it.
  const gradebook = board(page).getByRole("button", { name: "Gradebook" });
  const coursework = board(page).getByRole("button", { name: "Coursework" });
  await set(board(page).getByRole("button", { name: "Core only" }), true);
  await expect(coursework).toHaveAttribute("aria-pressed", "false");
  await set(gradebook, true);
  await expect(coursework).toHaveAttribute("aria-pressed", "true");
  await set(coursework, false);
  await expect(gradebook).toHaveAttribute("aria-pressed", "false");
});

test("the product's site reads right to left in Arabic, and its switches still work", async ({
  page,
  context,
}) => {
  await context.addCookies([{ name: "language-tag", value: "ar", url: BARE }]);
  await page.goto(BARE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { level: 1, name: /على مقاس مدرستك\./ }),
  ).toBeVisible();
  const shown = page.getByLabel("المنتج بهذه الوحدات");
  await expect(shown.getByText("الأسر والطلاب والعاملون")).toBeVisible();
  await set(
    board(page).getByRole("button", { name: "الأسر وأولياء الأمور" }),
    false,
  );
  await expect(
    shown.getByText("الطلاب والعاملون", { exact: true }),
  ).toBeVisible();
  await expect(shown.getByText("الأسر والطلاب والعاملون")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});
