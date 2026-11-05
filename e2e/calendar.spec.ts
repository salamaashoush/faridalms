import { plainContent } from "@faridalms/domain/content-conversion";
import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { apiAs } from "./fixtures/api";
import {
  chooseFromMenu,
  PASSWORD,
  portal,
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
  await signInWith(
    family,
    "parent1007@northwind.example.com",
    PASSWORD,
    "/family",
  );
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

  await chooseFromMenu(
    event.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Cancel event" }),
  );
  await page
    .getByRole("dialog", { name: "Cancel this event?" })
    .getByRole("button", { name: "Cancel event" })
    .click();
  await expect(event.getByText("Cancelled", { exact: true })).toBeVisible();

  await family.reload();
  await expect(seen.getByText("Cancelled", { exact: true })).toBeVisible();
  await familyContext.close();
});

// Each browser plans its own week, so parallel projects never move each
// other's events.
const WEEK: Record<string, string> = {
  chromium: "2026-11-15",
  firefox: "2026-11-22",
  webkit: "2026-11-29",
};

const eventInput = (title: string, day: string) => ({
  id: "",
  expectedVersion: 0,
  titleEn: title,
  titleAr: "",
  category: "meeting" as const,
  startsOn: day,
  endsOn: day,
  allDay: false,
  startTime: "13:00",
  endTime: "14:00",
  location: "Library",
  provisional: false,
  audiences: [{ scope: "staff" as const, classId: "", gradeId: "" }],
  description: plainContent("Bring the term plan."),
});

test("staff plan a week, moving and lengthening events by dragging or from the keyboard", async ({
  page,
  browserName,
}, testInfo) => {
  const admin = await apiAs("admin");
  const sunday = WEEK[browserName] ?? "2026-12-06";
  const monday = addDays(sunday, 1);
  const title = `Planning (${browserName} ${crypto.randomUUID().slice(0, 6)})`;
  const created = await admin.calendar.save(eventInput(title, monday));
  const stored = async () => admin.calendar.event({ id: created.id });

  await signIn(page, "admin");
  await page.goto(
    `/calendar?view=week&month=${monday.slice(0, 7)}&day=${monday}`,
  );
  await untilHydrated(page);
  await expect(page.getByRole("tab", { name: "Week" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const week = page.getByRole("table", { name: "Events by day this week" });
  await expect(week.getByRole("columnheader")).toHaveCount(7);
  const chip = week.getByRole("link", { name: title });
  await expect(chip).toBeVisible();

  // A draft moves at once.
  await chip.dragTo(week.locator(`td[data-day="${addDays(monday, 1)}"]`));
  await expect(page.getByText(`${title} is now on`).first()).toBeVisible();
  await expect
    .poll(async () => (await stored()).startsOn)
    .toBe(addDays(monday, 1));

  // Alt and an arrow move it a day; with Shift they move its last day.
  await week.getByRole("link", { name: title }).focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect
    .poll(async () => (await stored()).startsOn)
    .toBe(addDays(monday, 2));
  await week.getByRole("link", { name: title }).focus();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expect
    .poll(async () => (await stored()).endsOn)
    .toBe(addDays(monday, 3));

  // Dragging its end lengthens it once more.
  await week
    .locator(
      `td[data-day="${addDays(monday, 3)}"] [data-resize="${created.id}"]`,
    )
    .dragTo(week.locator(`td[data-day="${addDays(monday, 4)}"]`));
  await expect
    .poll(async () => (await stored()).endsOn)
    .toBe(addDays(monday, 4));

  // A published event asks first whether to tell the people it reaches.
  const current = await stored();
  await admin.calendar.publish({
    id: created.id,
    expectedVersion: current.version,
    notify: false,
  });
  await page.reload();
  await untilHydrated(page);
  await week
    .locator(`td[data-day="${addDays(monday, 2)}"]`)
    .getByRole("link", { name: title })
    .dragTo(week.locator(`td[data-day="${sunday}"]`));
  const ask = page.getByRole("dialog", { name: "Move this event?" });
  await expect(
    ask.getByRole("checkbox", { name: /^Tell the \d+ people/ }),
  ).toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath("week-drag-en.png"),
    fullPage: true,
  });
  await ask.getByRole("button", { name: "Move", exact: true }).click();
  await expect(ask).toHaveCount(0);
  await expect.poll(async () => (await stored()).startsOn).toBe(sunday);
  expect((await stored()).endsOn).toBe(addDays(monday, 1));

  await page.getByRole("link", { name: "Next week" }).click();
  await expect(page).toHaveURL(new RegExp(`day=${addDays(sunday, 7)}`));
  await page
    .getByRole("main")
    .getByRole("link", { name: "Today", exact: true })
    .click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page).not.toHaveURL(/day=/);
});

test("a month-grid event opens from the keyboard, a day starts a new event and a date can be jumped to", async ({
  page,
  browserName,
}) => {
  const admin = await apiAs("admin");
  const day = addDays(WEEK[browserName] ?? "2026-12-06", 3);
  const title = `Open day (${browserName} ${crypto.randomUUID().slice(0, 6)})`;
  await admin.calendar.save(eventInput(title, day));

  await signIn(page, "admin");
  await page.goto(`/calendar?view=month&month=${day.slice(0, 7)}`);
  await untilHydrated(page);
  const grid = page.getByRole("table", { name: "Events by day this month" });
  await grid.getByRole("link", { name: title }).focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: title });
  await expect(panel.getByText("Bring the term plan.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  await grid
    .locator(`td[data-day="${day}"]`)
    .getByRole("link", { name: /^New event on/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/event-editor\\?day=${day}`));
  await expect(page.getByLabel("Starts on")).toHaveValue(day);

  await page.goto("/calendar?view=month");
  await untilHydrated(page);
  await page.getByLabel("Go to date").fill("2027-02-10");
  await expect(page).toHaveURL(/month=2027-02/);
  await expect(page).toHaveURL(/day=2027-02-10/);
  await expect(
    page.getByRole("heading", { level: 2, name: "February 2027" }),
  ).toBeVisible();
});

for (const view of ["agenda", "week", "month"] as const)
  test(`a family reads the ${view} on an Arabic phone, without management controls or overflow`, async ({
    browser,
  }, testInfo) => {
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const family = await phone.newPage();
    await signInWith(
      family,
      "parent1007@northwind.example.com",
      PASSWORD,
      "/family",
    );
    // The family reads the school in its own language once signed in.
    await phone.addCookies([
      { name: "language-tag", value: "ar", url: portal() },
    ]);
    await family.goto(`/calendar?view=${view}&month=2026-11`);
    await untilHydrated(family);
    await expect(family.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      family.getByRole("link", { name: "فعالية جديدة" }),
    ).toHaveCount(0);
    expect(
      await family.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await family.screenshot({
      path: testInfo.outputPath(`calendar-${view}-ar-phone.png`),
      fullPage: true,
    });
    await phone.close();
  });

test("on a phone, each day of the week offers a new event to those who may add one", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "admin");
  await page.goto("/calendar?view=week");
  await untilHydrated(page);
  const add = page.getByRole("link", { name: /^New event on / });
  await expect(add).toHaveCount(7);
  await expect(add.first()).toBeVisible();
  await expect(add.first()).toHaveCSS("opacity", "1");
});

test("an event written in two languages reads in each reader's", async ({
  browser,
  page,
  browserName,
}) => {
  const unique = `${browserName} ${crypto.randomUUID().slice(0, 6)}`;
  const title = `Science evening (${unique})`;
  await signIn(page, "admin");
  await page.goto("/event-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Title in English" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Bring a jar for the experiments.");
  await page.getByLabel("Starts on").fill(DAY[browserName] ?? "2026-11-13");
  await page.getByLabel("Starts at").fill("17:00");
  await page.getByLabel("Ends at").fill("18:00");
  await page.getByRole("combobox", { name: "Audience 1" }).click();
  await page.getByRole("option", { name: "Families" }).click();
  await page.getByText("Also write it in Arabic", { exact: true }).click();
  await page.getByRole("tab", { name: "العربية" }).click();
  await page
    .getByRole("textbox", { name: "Title in Arabic" })
    .fill(`أمسية العلوم (${unique})`);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("أحضر برطمانًا للتجارب.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar\?.*event=[a-f0-9-]+/);

  const familyContext = await browser.newContext();
  const family = await familyContext.newPage();
  await signInWith(
    family,
    "parent1007@northwind.example.com",
    PASSWORD,
    "/family",
  );
  await familyContext.addCookies([
    { name: "language-tag", value: "ar", url: portal() },
  ]);
  await family.goto("/calendar?month=2026-11&view=agenda");
  await untilHydrated(family);
  await family.getByRole("link", { name: `أمسية العلوم (${unique})` }).click();
  await expect(family.getByText("أحضر برطمانًا للتجارب.")).toBeVisible();
  await familyContext.close();
});
