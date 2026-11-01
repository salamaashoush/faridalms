import { expect, test } from "@playwright/test";

import { chooseFromMenu, signIn, untilHydrated } from "./fixtures/sign-in";

// Browser projects share one school and years may not overlap, so each adds
// a year of its own. None is made current here: that would move every other
// spec's working year; the API suite covers it.
const YEAR = {
  chromium: { title: "2030–2031", start: "2030-09-08", end: "2031-06-12" },
  firefox: { title: "2032–2033", start: "2032-09-12", end: "2033-06-16" },
  webkit: { title: "2034–2035", start: "2034-09-10", end: "2035-06-14" },
} as const;

test("an administrator adds a year with terms, closes it and reopens it with a reason", async ({
  page,
  browserName,
}) => {
  const year = YEAR[browserName];
  await signIn(page, "admin");
  await page.goto("/admin/academic-years");
  await untilHydrated(page);
  await page
    .getByRole("link", { name: "Add school year", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/academic-year-editor/);

  await page
    .getByRole("textbox", { name: "Year name in English" })
    .fill(year.title);
  await page.getByLabel("First day", { exact: true }).first().fill(year.start);
  await page.getByLabel("Last day", { exact: true }).first().fill(year.end);
  await page.getByRole("button", { name: "Add term", exact: true }).click();
  const term = page.getByRole("group", { name: "Term 1" });
  await term
    .getByRole("textbox", { name: "Term name in English" })
    .fill("Autumn");
  await term.getByLabel("First day", { exact: true }).fill(year.start);
  await term.getByLabel("Last day", { exact: true }).fill(year.end);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page).toHaveURL(/\/years\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: year.title }),
  ).toBeVisible();
  await expect(page.getByText("Upcoming", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Terms" }).getByText("Autumn"),
  ).toBeVisible();

  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }).last(),
    page.getByRole("menuitem", { name: "Close year" }),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close year" })
    .click();
  await expect(page.getByText(`${year.title} is closed`)).toBeVisible();
  // The sheet hands focus back to its menu's trigger once it has closed,
  // which shuts a menu opened before then.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit year" })).toHaveCount(0);

  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }).last(),
    page.getByRole("menuitem", { name: "Reopen year" }),
  );
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Reopen year" }).click();
  await expect(
    sheet.getByText("Say why the year is being reopened."),
  ).toBeVisible();
  await sheet
    .getByRole("textbox", { name: "Reason" })
    .fill("Correct a mistyped grade");
  await sheet.getByRole("button", { name: "Reopen year" }).click();
  await expect(
    page.getByText(`${year.title} is open for corrections`),
  ).toBeVisible();

  await page.getByRole("tab", { name: "History", exact: true }).click();
  const history = page.getByRole("region", { name: "History" });
  await expect(history.getByText("Year reopened")).toBeVisible();
  await expect(history.getByText("Correct a mistyped grade")).toBeVisible();
  await expect(history.getByText("Year closed")).toBeVisible();
});

test("a year that overlaps another is refused on its dates", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/admin/academic-year-editor");
  await untilHydrated(page);
  await page
    .getByRole("textbox", { name: "Year name in English" })
    .fill("Overlap");
  await page.getByLabel("First day", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Last day", { exact: true }).fill("2027-03-01");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("These dates overlap another school year.", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/academic-year-editor/);
});
