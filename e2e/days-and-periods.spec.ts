import type { Page } from "@playwright/test";

import { addDays } from "@faridalms/domain/school";
import { dayOpen } from "@faridalms/domain/school-days";
import { expect, test } from "@playwright/test";

import type { Api } from "./fixtures/api";
import type { FreshSchool } from "./fixtures/fresh-school";

import { signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import {
  chooseFromMenu,
  PASSWORD,
  portal,
  untilHydrated,
} from "./fixtures/sign-in";

/** The school days on or before `day`, latest first, by the school's week and the days it marked. */
async function schoolDaysBack(api: Api, day: string, count: number) {
  const read = await api.schoolDays.days({ from: addDays(day, -30), to: day });
  const marks = new Map(read.days.map((row) => [row.day, row.meaning]));
  const found: string[] = [];
  for (
    let on = day;
    on >= read.from && found.length < count;
    on = addDays(on, -1)
  )
    if (dayOpen(read, on, marks.get(on) ?? null)) found.push(on);
  return found;
}

const longDay = (day: string, parts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    ...parts,
    timeZone: "UTC",
  });

/** A class with no year, taught by the school's teacher, with its pupil in it. */
async function runningClub(school: FreshSchool) {
  const { api: admin } = await signedInApi(school.admin, PASSWORD, school.slug);
  const { api: teacher } = await signedInApi(
    school.teacher,
    PASSWORD,
    school.slug,
  );
  const [me, { today }] = await Promise.all([
    teacher.identity.currentUser(),
    admin.identity.currentUser(),
  ]);
  const course = await admin.classes.save({
    startsOn: addDays(today, -30),
    code: "RUN-1",
    titleEn: "Running club",
    titleAr: "",
    teacherIds: [me.id],
  });
  const pupil = (await admin.people.students({ q: "Salama Pupil" })).rows[0];
  if (!pupil) throw new Error("the fresh school has no pupil");
  await admin.classes.enrol({
    studentId: pupil.id,
    classId: course.id,
    from: addDays(today, -30),
  });
  return { admin, today, course };
}

/** Marks everyone on an open register present and submits it. */
async function submitRegister(page: Page) {
  await expect(
    page.getByRole("radio", { name: "Present" }).first(),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Mark the rest present" }).click();
  await page.getByRole("button", { name: "Submit register" }).click();
  await expect(page.getByText("Register submitted")).toBeVisible();
}

test("a school without school years or a timetable marks a holiday by date and takes each class's register of the whole day", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const school = await freshSchool(browser, {
    without: ["school_years", "timetable"],
  });
  const at = portal(school.slug);
  const { admin, today, course } = await runningClub(school);
  const [taught, holiday] = await schoolDaysBack(admin, today, 2);
  if (!taught || !holiday) throw new Error("the school has had no days yet");

  const office = await browser.newContext();
  const officePage = await office.newPage();
  await signInTo(officePage, school, "admin");
  await officePage.goto(`${at}/settings`);
  await untilHydrated(officePage);
  await officePage.getByRole("link", { name: "Open school days" }).click();
  await expect(officePage).toHaveURL(/\/school-days/);
  await expect(
    officePage.getByRole("heading", { level: 1, name: "School days" }),
  ).toBeVisible();
  await expect(officePage.getByText(/school year/i)).toHaveCount(0);
  await officePage.goto(`${at}/school-days?start=${holiday.slice(0, 7)}`);
  await untilHydrated(officePage);
  await officePage
    .getByRole("button", {
      name: new RegExp(
        `^${longDay(holiday, { weekday: "long", month: "long", day: "numeric" })}`,
      ),
    })
    .click();
  await officePage.getByRole("button", { name: "Mark days" }).click();
  await expect(officePage.getByText("1 days marked.")).toBeVisible();
  await office.close();

  await signInTo(page, school, "teacher");
  await page.goto(`${at}/attendance?date=${taught}`);
  await untilHydrated(page);
  await page.getByRole("link", { name: "Running club", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Running club" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Period/ })).toHaveCount(0);
  await submitRegister(page);

  await page.goto(`${at}/registers/${course.id}?date=${holiday}`);
  await untilHydrated(page);
  await expect(
    page.getByText("The school calendar has no lessons on this day."),
  ).toBeVisible();
});

test("a school without school years sets its day, plans a class in no year on the timetable, and its teacher takes the register in the period", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const school = await freshSchool(browser, { without: ["school_years"] });
  const at = portal(school.slug);
  const { admin, today, course } = await runningClub(school);
  const [taught] = await schoolDaysBack(admin, today, 1);
  if (!taught) throw new Error("the school has had no days yet");
  const start = addDays(taught, -7);

  const office = await browser.newContext();
  const officePage = await office.newPage();
  await signInTo(officePage, school, "admin");
  await officePage.goto(`${at}/timetable?view=day&from=${start}`);
  await untilHydrated(officePage);
  await officePage
    .getByRole("button", { name: "Start from the usual school day" })
    .click();
  await expect(officePage.getByText("Periods saved")).toBeVisible();
  const day = officePage.getByRole("region", { name: "School day" });
  await expect(
    day.getByRole("table").getByText("Period 1", { exact: true }),
  ).toBeVisible();

  await officePage.goto(
    `${at}/timetable?view=classes&classId=${course.id}&from=${taught}`,
  );
  await untilHydrated(officePage);
  await officePage
    .getByRole("button", {
      name: `Edit ${longDay(taught, { weekday: "long" })}, Period 1`,
    })
    .click();
  const sheet = officePage.getByRole("dialog");
  await sheet.getByRole("combobox", { name: /^Lesson/ }).click();
  await officePage
    .getByRole("option", { name: "Running club", exact: true })
    .click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(officePage.getByText("Timetable updated")).toBeVisible();
  await office.close();

  await signInTo(page, school, "teacher");
  await page.goto(`${at}/attendance?date=${taught}`);
  await untilHydrated(page);
  await expect(
    page.getByRole("row", { name: /Running club/ }).getByText("Period 1"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Running club", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Period/ })).toBeVisible();
  await submitRegister(page);
});

test("the office changes the school's day from a date, and the days before keep theirs", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const school = await freshSchool(browser, { without: ["school_years"] });
  const at = portal(school.slug);
  const { api: admin } = await signedInApi(school.admin, PASSWORD, school.slug);
  const { today } = await admin.identity.currentUser();
  const start = addDays(today, 7);
  const later = addDays(today, 35);
  await signInTo(page, school, "admin");
  await page.goto(`${at}/timetable?view=day&from=${start}`);
  await untilHydrated(page);
  await page
    .getByRole("button", { name: "Start from the usual school day" })
    .click();
  await expect(page.getByText("Periods saved")).toBeVisible();
  const day = page.getByRole("region", { name: "School day" });
  await expect(
    day.getByRole("table").getByText("8:00 AM–8:45 AM"),
  ).toBeVisible();

  await chooseFromMenu(
    day.getByRole("button", { name: "Actions for Period 6" }),
    page.getByRole("menuitem", { name: "Remove" }),
  );
  const removing = page.getByRole("dialog", { name: "Remove Period 6" });
  await expect(removing.getByLabel("From", { exact: true })).toHaveValue(start);
  await removing.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(removing).toHaveCount(0);
  await expect(
    day.getByRole("table").getByText("Period 6", { exact: true }),
  ).toHaveCount(0);

  await day.getByRole("button", { name: "Add period", exact: true }).click();
  const adding = page.getByRole("dialog", { name: "Add period" });
  await adding
    .getByRole("textbox", { name: "Name in English", exact: true })
    .fill("Clubs");
  await adding.getByLabel("Starts", { exact: true }).fill("13:30");
  await adding.getByLabel("Ends", { exact: true }).fill("14:15");
  await adding.getByRole("button", { name: "Add period", exact: true }).click();
  await expect(adding).toHaveCount(0);
  const clubs = day.getByRole("row", { name: /^Clubs / });
  await expect(clubs).toContainText("1:30 PM–2:15 PM");

  await clubs.getByRole("button", { name: "Clubs", exact: true }).click();
  const changing = page.getByRole("dialog", { name: "Change Clubs" });
  await changing.getByLabel("From", { exact: true }).fill(later);
  await changing
    .getByRole("textbox", { name: "Name in English", exact: true })
    .fill("Sports");
  await changing.getByRole("button", { name: "Save period" }).click();
  await expect(changing).toHaveCount(0);
  const changes = page.getByRole("region", {
    name: "Changes to the school day",
  });
  await expect(changes.getByRole("link")).toHaveCount(2);
  await changes.getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`from=${start}`));
  await expect(
    day.getByRole("table").getByText("Clubs", { exact: true }),
  ).toBeVisible();
  await changes.getByRole("link").last().click();
  await expect(page).toHaveURL(new RegExp(`from=${later}`));
  await expect(
    day.getByRole("table").getByText("Sports", { exact: true }),
  ).toBeVisible();
});
