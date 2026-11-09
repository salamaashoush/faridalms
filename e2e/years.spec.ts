import { expect, test } from "@playwright/test";

import { apiAs } from "./fixtures/api";
import { newYear } from "./fixtures/school";
import { chooseFromMenu, signIn, untilHydrated } from "./fixtures/sign-in";

// Browser projects share one school and years may not overlap, so each adds
// a year of its own. None is made current here: that would move every other
// spec's working year; the API suite covers it.
const YEAR = {
  chromium: { title: "2030–2031", start: "2030-09-08", end: "2031-06-12" },
  firefox: { title: "2032–2033", start: "2032-09-12", end: "2033-06-16" },
  webkit: { title: "2034–2035", start: "2034-09-10", end: "2035-06-14" },
} as const;

const DAY = {
  chromium: {
    title: "2050–2051 Salama",
    startsOn: "2050-09-04",
    endsOn: "2051-06-15",
    later: "2050-11-06",
  },
  firefox: {
    title: "2052–2053 Salama",
    startsOn: "2052-09-08",
    endsOn: "2053-06-12",
    later: "2052-11-07",
  },
  webkit: {
    title: "2054–2055 Salama",
    startsOn: "2054-09-06",
    endsOn: "2055-06-17",
    later: "2054-11-08",
  },
} as const;

test("the office sets a year's periods and their days, and a later change keeps the days before it", async ({
  page,
  browserName,
}) => {
  const dates = DAY[browserName];
  const admin = await apiAs("admin");
  const year = await newYear(admin, dates);
  // A new year takes the school day of the year before it, which may be
  // another browser's, changed by this same spec; it starts from the seed's.
  const { workingYearId } = await admin.classes.options();
  if (!workingYearId) throw new Error("the school has no working year");
  const { startsOn } = await admin.years.record({ id: workingYearId });
  const seeded = await admin.years.periods({ id: workingYearId, on: startsOn });
  const copied = await admin.years.periods({ id: year.id, on: dates.startsOn });
  await admin.years.savePeriods({
    yearId: year.id,
    from: dates.startsOn,
    known: copied.periods.map(({ id, version }) => ({ id, version })),
    periods: seeded.periods.map((period) => ({
      nameEn: period.nameEn ?? undefined,
      nameAr: period.nameAr ?? undefined,
      kind: period.kind,
      startTime: period.startTime,
      endTime: period.endTime,
      official: period.official,
      weekdays: period.weekdays,
      dayTimes: period.dayTimes,
    })),
  });
  await signIn(page, "admin");
  await page.goto(`/years/${year.id}`);
  await untilHydrated(page);
  await page.getByRole("tab", { name: "Periods", exact: true }).click();
  await expect(page).toHaveURL(/tab=periods/);
  const day = page.getByRole("region", { name: "School day" });
  await expect(
    day.getByRole("table").getByText("Period 1", { exact: true }),
  ).toBeVisible();
  await expect(
    day.getByRole("table").getByText("8:00 AM–8:45 AM"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "School days" })
      .getByText("Sunday, Monday, Tuesday, Wednesday, and Thursday"),
  ).toBeVisible();

  // Each period is a row of the day's table, changed in its own sheet from
  // a date; the whole-day grid this replaced was opened by Change periods.
  await chooseFromMenu(
    day.getByRole("button", { name: "Actions for Period 6" }),
    page.getByRole("menuitem", { name: "Remove" }),
  );
  const removing = page.getByRole("dialog", { name: "Remove Period 6" });
  await expect(removing.getByLabel("From", { exact: true })).toHaveValue(
    dates.startsOn,
  );
  await removing.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(removing).toHaveCount(0);
  await expect(page.getByText("Periods saved", { exact: true })).toBeVisible();
  await expect(
    day.getByRole("table").getByText("Period 6", { exact: true }),
  ).toHaveCount(0);

  await day.getByRole("button", { name: "Add period", exact: true }).click();
  const adding = page.getByRole("dialog", { name: "Add period" });
  await adding
    .getByRole("textbox", { name: "Name in English", exact: true })
    .fill("Clubs");
  await adding.getByLabel("Starts", { exact: true }).fill("13:30");
  const ends = adding.getByLabel("Ends", { exact: true });
  await ends.fill("13:00");
  await adding
    .getByRole("group", { name: "Days", exact: true })
    .getByRole("checkbox", { name: "Thursday" })
    .click();
  await adding.getByRole("button", { name: "Add period", exact: true }).click();
  await expect(ends).toHaveAttribute("aria-invalid", "true");
  await expect(ends).toHaveAccessibleDescription(
    "A lesson must end after it starts.",
  );
  await ends.fill("14:15");
  await adding.getByRole("button", { name: "Add period", exact: true }).click();
  await expect(adding).toHaveCount(0);
  const clubs = day.getByRole("row", { name: /^Clubs / });
  await expect(clubs).toContainText("1:30 PM–2:15 PM");
  await expect(clubs).toContainText("45 min");
  await expect(clubs).toContainText("Lesson");
  await expect(clubs).toContainText("Sunday, Monday, Tuesday, and Wednesday");

  await clubs.getByRole("button", { name: "Clubs", exact: true }).click();
  const changing = page.getByRole("dialog", { name: "Change Clubs" });
  await changing.getByLabel("From", { exact: true }).fill(dates.later);
  await changing
    .getByRole("textbox", { name: "Name in English", exact: true })
    .fill("Sports");
  await changing.getByRole("button", { name: "Save period" }).click();
  await expect(changing).toHaveCount(0);
  const changes = page.getByRole("region", { name: "Changes this year" });
  await expect(changes.getByRole("link")).toHaveCount(2);
  await changes.getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`on=${dates.startsOn}`));
  await expect(
    day.getByRole("table").getByText("Clubs", { exact: true }),
  ).toBeVisible();
  await changes.getByRole("link").last().click();
  await expect(page).toHaveURL(new RegExp(`on=${dates.later}`));
  await expect(
    day.getByRole("table").getByText("Sports", { exact: true }),
  ).toBeVisible();
  await expect(
    day.getByRole("table").getByText("Clubs", { exact: true }),
  ).toHaveCount(0);
});

test("a change to the school day cannot reach back over a register already taken", async ({
  page,
}) => {
  const admin = await apiAs("admin");
  const { workingYearId } = await admin.classes.options();
  if (!workingYearId) throw new Error("the school has no working year");
  const { startsOn } = await admin.years.record({ id: workingYearId });
  await signIn(page, "admin");
  await page.goto(`/years/${workingYearId}?tab=periods&on=${startsOn}`);
  await untilHydrated(page);
  const day = page.getByRole("region", { name: "School day" });
  await day.getByRole("button", { name: "Registration", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Change Registration" });
  await sheet.getByLabel("From", { exact: true }).fill(startsOn);
  await sheet.getByLabel("Ends", { exact: true }).fill("07:55");
  await sheet.getByRole("button", { name: "Save period" }).click();
  const from = sheet.getByLabel("From", { exact: true });
  await expect(from).toHaveAttribute("aria-invalid", "true");
  await expect(from).toHaveAccessibleDescription(
    /^A register was already taken on .+ in a period this changes\. Choose a later date\.$/,
  );
  await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    day.getByRole("table").getByText("7:45 AM–8:00 AM", { exact: true }),
  ).toBeVisible();
});

test("an administrator adds a year with terms, closes it and reopens it with a reason", async ({
  page,
  browserName,
}) => {
  const year = YEAR[browserName];
  await signIn(page, "admin");
  await page.goto("/academic-years");
  await untilHydrated(page);
  await page
    .getByRole("link", { name: "Add school year", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/academic-year-editor/);

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
  await page.goto("/academic-year-editor");
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
  await expect(page).toHaveURL(/\/academic-year-editor/);
});
