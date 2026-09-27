import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser adds its own event on its own day, so parallel projects never
// cancel each other's.
const DAY: Record<string, string> = {
  chromium: "2026-11-10",
  firefox: "2026-11-11",
  webkit: "2026-11-12",
};

test("the office adds an event for families, who see it and then see it called off", async ({
  browser,
  page,
  browserName,
}) => {
  const title = `Book swap (${browserName} ${crypto.randomUUID().slice(0, 6)})`;
  const day = DAY[browserName] ?? "2026-11-13";
  await signIn(page, "admin");
  await page.goto("/event-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Title in English" }).fill(title);
  await page.getByRole("textbox", { name: "Where" }).fill("Library");
  await page.getByLabel("Starts on").fill(day);
  await page.getByLabel("Starts at").fill("13:00");
  await page.getByLabel("Ends at").fill("14:00");
  await page.getByRole("combobox", { name: "Audience 1" }).click();
  await page.getByRole("option", { name: "Families" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar\?.*event=[a-f0-9-]+/);
  const event = page.getByRole("dialog", { name: title });
  await expect(event.getByRole("heading", { name: title })).toBeVisible();

  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await signInWith(family, "parent1007@northwind.example.com", PASSWORD, "/family");
  await family.goto("/calendar?month=2026-11&view=agenda");
  await untilHydrated(family);
  await family.getByRole("link", { name: title }).click();
  const seen = family.getByRole("dialog", { name: title });
  await expect(seen.getByRole("heading", { name: title })).toBeVisible();
  await expect(seen.getByText("Library")).toBeVisible();

  // Moving it asks whether to tell people, already ticked for a new place.
  await event.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Where" }).fill("Main hall");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  const ask = page.getByRole("dialog", { name: "Update this event?" });
  await expect(
    ask.getByRole("checkbox", { name: /^Tell the \d+ people/ }),
  ).toBeChecked();
  await ask.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.getByText("Event saved.")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(event.getByText("Main hall")).toBeVisible();

  // The panel is modal, so the page behind it (the search launcher that
  // untilHydrated waits on) leaves the accessibility tree; the panel itself
  // renders only once the page has hydrated.
  await family.reload();
  await expect(seen.getByText("Main hall")).toBeVisible();

  await event.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Cancel event" }).click();
  await page
    .getByRole("dialog", { name: "Cancel this event?" })
    .getByRole("button", { name: "Cancel event" })
    .click();
  await expect(event.getByText("Cancelled", { exact: true })).toBeVisible();

  await family.reload();
  await expect(seen.getByText("Cancelled", { exact: true })).toBeVisible();
  await familyContext.close();
});
