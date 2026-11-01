import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { signIn, untilHydrated } from "./fixtures/sign-in";

// Each browser rolls the current year into a target year of its own, since
// years may not overlap.
const TARGET = {
  chromium: { title: "2040–2041", start: "2040-09-09", end: "2041-06-13" },
  firefox: { title: "2042–2043", start: "2042-09-07", end: "2043-06-11" },
  webkit: { title: "2044–2045", start: "2044-09-11", end: "2045-06-15" },
} as const;

// Other specs add students with no class while this one runs; a student who
// stays needs a class, so each of them is marked as leaving.
async function resolveBlockers(page: Page) {
  const blocked = page.getByRole("listitem").filter({
    has: page.getByRole("combobox", { name: /Choose a class$/ }),
  });
  while ((await blocked.count()) > 0) {
    await blocked
      .first()
      .getByRole("combobox", { name: /^Decision for / })
      .click();
    await page.getByRole("option", { name: "Leaves" }).click();
  }
}

/** Reviews and applies the plan, unless the form says what still needs a decision. */
async function applyPlan(page: Page) {
  await page.getByRole("button", { name: "Review and apply" }).click();
  const confirm = page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply rollover" });
  const problem = page.getByRole("alert").filter({
    has: page.getByRole("heading", { name: "There is a problem" }),
  });
  await expect(confirm.or(problem)).toBeVisible();
  if (await confirm.isVisible()) await confirm.click();
}

test("an administrator rolls the current year into the next and opens a new class", async ({
  page,
  browserName,
}) => {
  const target = TARGET[browserName];
  const unique = crypto.randomUUID().slice(0, 6);
  await signIn(page, "admin");
  await page.goto("/admin/academic-year-editor");
  await untilHydrated(page);
  await page
    .getByRole("textbox", { name: "Year name in English" })
    .fill(target.title);
  await page.getByLabel("First day", { exact: true }).fill(target.start);
  await page.getByLabel("Last day", { exact: true }).fill(target.end);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/years\/[a-f0-9-]+/);

  await page.getByRole("button", { name: "More actions" }).last().click();
  await page
    .getByRole("menuitem", { name: "Roll over into this year" })
    .click();
  await expect(page).toHaveURL(/\/admin\/rollover/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Roll over into ${target.title}`,
    }),
  ).toBeVisible();

  const first = page.getByRole("group", { name: "7A", exact: true });
  await first
    .getByRole("textbox", { name: "Class name in English" })
    .fill(`Next ${unique}`);
  const decision = page
    .getByRole("combobox", { name: /^Decision for / })
    .first();
  await decision.click();
  await page.getByRole("option", { name: "Graduates" }).click();
  await resolveBlockers(page);
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("Plan saved")).toBeVisible();

  const summary = page.getByText(/^Applied from /);
  const stale = page.getByText(/changed since the plan was saved/);
  const blocked = page.getByRole("alert").filter({
    has: page.getByRole("heading", { name: "There is a problem" }),
  });
  await applyPlan(page);
  await expect(summary.or(stale).or(blocked)).toBeVisible();
  // Students other specs add or place after the save make the draft stale.
  // Read again, the plan is reconciled with who is placed now, so it is
  // unsaved until saved; it is settled, saved and applied again, as a person
  // would, until no placement moved in between.
  for (let round = 0; round < 5 && !(await summary.isVisible()); round += 1) {
    await page.keyboard.press("Escape");
    await page.reload();
    await untilHydrated(page);
    await resolveBlockers(page);
    if (await page.getByText(/^Placements changed since/).isVisible()) {
      await page.getByRole("button", { name: "Save plan" }).click();
      await expect(page.getByText("Plan saved").last()).toBeVisible();
    }
    await applyPlan(page);
    await expect(summary.or(stale).or(blocked)).toBeVisible();
  }
  await expect(summary).toBeVisible();

  const created = page
    .getByRole("region", { name: "New classes" })
    .getByRole("link", { name: "7-A", exact: true });
  await created.click();
  await expect(
    page.getByRole("heading", { level: 1, name: `Next ${unique}` }),
  ).toBeVisible();
  await expect(page.getByText(target.title).first()).toBeVisible();
});
