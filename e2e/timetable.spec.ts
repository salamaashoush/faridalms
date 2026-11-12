import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser project plans its own homeroom, from a day after today so
// the weeks other specs read stay as seeded.
const HOMEROOM = { chromium: "7A", firefox: "8A", webkit: "9A" } as const;

test("an administrator changes a lesson from a day and the week shows it", async ({
  page,
  browserName,
}) => {
  const homeroom = HOMEROOM[browserName as keyof typeof HOMEROOM];
  await signIn(page, "admin");
  await page.goto("/timetable?from=2026-11-05");
  await untilHydrated(page);
  await page.getByRole("button", { name: /^Class(?!es)/ }).click();
  await page
    .getByRole("menuitemradio", { name: homeroom, exact: true })
    .click();
  // The menu hands focus back as it closes; the grid of the chosen class
  // is the one to edit.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page).toHaveURL(/classId=/);
  const cell = page.getByRole("button", { name: "Edit Thursday, Period 6" });
  const before = (await cell.textContent()) ?? "";
  await cell.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("combobox", { name: /^Lesson/ }).click();
  await expect(page.getByRole("option").first()).toBeVisible();
  const names = (await page.getByRole("option").allTextContents()).map((name) =>
    name.trim(),
  );
  const lessons = names.filter((name) => name.startsWith(homeroom));
  const original = lessons.find((name) => before.startsWith(name)) ?? "";
  const lesson = lessons.find((name) => name !== original) ?? "";
  expect(lesson).not.toBe("");
  await page.getByRole("option", { name: lesson, exact: true }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  const busy = page.getByRole("button", { name: "Keep both" });
  await expect(page.getByText("Timetable updated").or(busy)).toBeVisible();
  if (await busy.isVisible()) await busy.click();
  await expect(page.getByText("Timetable updated")).toBeVisible();
  await expect(cell).toContainText(lesson);

  await page.goto("/timetable?from=2026-11-04");
  await untilHydrated(page);
  await page.getByRole("button", { name: /^Class(?!es)/ }).click();
  await page
    .getByRole("menuitemradio", { name: homeroom, exact: true })
    .click();
  // The menu hands focus back as it closes; the grid of the chosen class
  // is the one to edit.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page).toHaveURL(/classId=/);
  await expect(
    page.getByRole("button", { name: "Edit Thursday, Period 6" }),
  ).toContainText(original);
});

test("a teacher reads their week", async ({ page }) => {
  await signInWith(
    page,
    "teacher2.northwind@northwind.example.com",
    PASSWORD,
    "/today",
  );
  await page.goto("/timetable");
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Timetable" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Arabic");
});

test("a student reads their week on a phone, a day at a time", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student");
  await page.goto("/me/timetable");
  const days = page.getByRole("group", { name: "Days of the week" });
  await expect(days).toBeVisible();
  await days.getByRole("button", { name: "Mon" }).click();
  await expect(days.getByRole("button", { name: "Mon" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Period 1").last()).toBeVisible();
});

// One browser adds the timetable, since the year's timetables are shared by
// every project; it starts late in the year and is removed again.
test("an administrator adds A/B weeks from a date and removes them", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "the year's timetables are shared");
  await signIn(page, "admin");
  await page.goto("/timetable?view=timetables");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Add timetable" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Name in English").fill("Summer");
  await sheet.getByLabel("Starts on").fill("2027-06-06");
  await expect(
    sheet.getByRole("combobox", { name: /^Weeks in the cycle/ }),
  ).toContainText("Weeks A/B");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Timetable saved/)).toBeVisible();
  await expect(page.getByText("Weeks A/B · Closed days count")).toBeVisible();

  await page.goto("/timetable?view=classes&from=2027-06-06");
  await untilHydrated(page);
  await expect(
    page.getByRole("columnheader", { name: "Sunday B" }),
  ).toBeVisible();
  await page.goto("/timetable?view=teachers&from=2027-06-13");
  await untilHydrated(page);
  await expect(page.getByText("Week B", { exact: true })).toBeVisible();

  await page.goto("/timetable?view=timetables");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Remove Summer" }).click();
  await page.getByRole("button", { name: "Remove timetable" }).click();
  await expect(page.getByText("Timetable removed")).toBeVisible();
  await expect(page.getByText("Summer")).toHaveCount(0);
});

test("an administrator runs a day on a bell schedule", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "the year's calendar is shared");
  await signIn(page, "admin");
  // The school's day and its bell schedules belong to the timetable.
  await page.goto("/timetable?view=day");
  await untilHydrated(page);
  // A schedule is added by its names, then opens on its periods, each
  // changed and saved on its own; the grid it replaced held them all.
  await page.getByRole("button", { name: "Add bell schedule" }).click();
  const sheet = page.getByRole("dialog", { name: "Add bell schedule" });
  await sheet.getByLabel("Name in English").fill("Late start");
  await sheet.getByRole("button", { name: "Add bell schedule" }).click();
  await expect(page.getByText("Bell schedule saved").first()).toBeVisible();
  const schedule = page.getByRole("dialog", { name: "Late start" });
  for (const name of ["Registration", "Period 2", "Period 3", "Break"]) {
    await schedule.getByRole("button", { name, exact: true }).click();
    const times = page.getByRole("dialog", { name: `${name} on Late start` });
    await times.getByRole("checkbox", { name: "Held that day" }).click();
    await times.getByRole("button", { name: "Save times" }).click();
    await expect(times).toBeHidden();
    await expect(
      schedule.getByRole("row", { name: new RegExp(`^${name} Not held`) }),
    ).toBeVisible();
  }
  await schedule.getByRole("button", { name: "Period 1", exact: true }).click();
  const first = page.getByRole("dialog", { name: "Period 1 on Late start" });
  await first.getByLabel("Starts").fill("09:00");
  await first.getByLabel("Ends").fill("09:45");
  await first.getByRole("button", { name: "Save times" }).click();
  await expect(first).toBeHidden();
  await schedule.getByRole("button", { name: "Close" }).click();

  await page.goto("/academic-years");
  await untilHydrated(page);
  await page.getByRole("link", { name: "2026–2027" }).first().click();
  await page.getByRole("tab", { name: "School days" }).click();
  await untilHydrated(page);
  await page.getByRole("button", { name: /^Wednesday, June 9/ }).click();
  // Another spec adds a schedule of its own alongside, so the day names
  // which one it runs on rather than taking whichever is offered first.
  await page.getByRole("combobox", { name: /^Bell times/ }).click();
  await page.getByRole("option", { name: "Late start" }).click();
  await page.getByRole("button", { name: "Use for these days" }).click();
  await expect(page.getByText("Days changed: 1")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Wednesday, June 9, .*on Late start/ }),
  ).toBeVisible();

  await page.goto("/timetable?view=teachers&from=2027-06-09");
  await untilHydrated(page);
  await expect(
    page.getByRole("columnheader", { name: /Wednesday Jun 9\s*Late start/ }),
  ).toBeVisible();
  await expect(page.getByText("09:00–09:45")).toBeVisible();
});

// The day comes before the A/B weeks another spec adds from June 6, so it
// is offered one Sunday, not a Sunday of each week.
test("an administrator runs a Tuesday as a Sunday, then puts it back", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "the year's calendar is shared");
  await signIn(page, "admin");
  await page.goto("/academic-years");
  await untilHydrated(page);
  await page.getByRole("link", { name: "2026–2027" }).first().click();
  await page.getByRole("tab", { name: "School days" }).click();
  await untilHydrated(page);
  await page.getByRole("button", { name: /^Tuesday, June 1,/ }).click();
  await page.getByRole("combobox", { name: /^Runs as/ }).click();
  await page.getByRole("option", { name: /^Sunday/ }).click();
  await page.getByRole("button", { name: "Run this day so" }).click();
  await expect(page.getByText("Day saved")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Tuesday, June 1, .*runs as Sunday/ }),
  ).toBeVisible();
  const list = page.getByRole("region", { name: "Days run as another" });
  await expect(list.getByText(/runs as Sunday/)).toBeVisible();

  await page.goto("/timetable?view=teachers&from=2027-06-01");
  await untilHydrated(page);
  await expect(
    page.getByRole("columnheader", {
      name: /Tuesday Jun 1\s*Runs as Sunday/,
    }),
  ).toBeVisible();

  await page.goBack();
  await untilHydrated(page);
  await list.getByRole("button", { name: /as its own day$/ }).click();
  await expect(list).toHaveCount(0);
});

test("a bell schedule adds an assembly that a class can have a lesson in for that day", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "the year's calendar is shared");
  await signIn(page, "admin");
  // The school's day and its bell schedules belong to the timetable.
  await page.goto("/timetable?view=day");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Add bell schedule" }).click();
  const sheet = page.getByRole("dialog", { name: "Add bell schedule" });
  await sheet.getByLabel("Name in English").first().fill("Assembly day");
  await sheet.getByRole("button", { name: "Add bell schedule" }).click();
  const schedule = page.getByRole("dialog", { name: "Assembly day" });
  await schedule
    .getByRole("button", { name: "Add a period of its own" })
    .click();
  const own = page.getByRole("dialog", { name: "Add a period of its own" });
  await own
    .getByRole("textbox", { name: "Name in English", exact: true })
    .fill("Assembly");
  await own.getByLabel("Code", { exact: true }).fill("asm");
  await own.getByLabel("Starts", { exact: true }).fill("06:30");
  await own.getByLabel("Ends", { exact: true }).fill("07:00");
  await own.getByRole("button", { name: "Add a period of its own" }).click();
  await expect(own).toBeHidden();
  await expect(
    schedule.getByRole("row", { name: /^Assembly asm/ }),
  ).toBeVisible();
  await schedule.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Its own: Assembly")).toBeVisible();

  await page.goto("/academic-years");
  await untilHydrated(page);
  await page.getByRole("link", { name: "2026–2027" }).first().click();
  await page.getByRole("tab", { name: "School days" }).click();
  await untilHydrated(page);
  await page.getByRole("button", { name: /^Thursday, June 17/ }).click();
  await page.getByRole("combobox", { name: /^Bell times/ }).click();
  await page.getByRole("option", { name: "Assembly day" }).click();
  await page.getByRole("button", { name: "Use for these days" }).click();
  await expect(page.getByText("Days changed: 1")).toBeVisible();

  await page.goto("/timetable?view=cover&from=2027-06-17");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Add a lesson for this day" }).click();
  const choose = page.getByRole("dialog");
  await choose.getByRole("combobox", { name: /^Class/ }).click();
  await page.getByRole("option", { name: "7A", exact: true }).click();
  await choose.getByRole("button", { name: "Choose who takes it" }).click();
  const arrange = page.getByRole("dialog");
  await arrange.getByRole("radio").nth(1).click();
  await arrange.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("table").getByText(/^This day only, with /),
  ).toBeVisible();

  await page.goto("/timetable?view=teachers&from=2027-06-16");
  await untilHydrated(page);
  await expect(page.getByText("Assembly day").first()).toBeVisible();
});
