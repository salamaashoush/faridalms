import { expect, test } from "@playwright/test";

import { apiAs } from "./fixtures/api";
import {
  newClass,
  newStudent,
  schoolDaysTo,
  workingYear,
} from "./fixtures/school";
import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// Each browser project keeps to its own register and its own homeroom's
// absences, so the parallel projects never take or excuse the same one. The
// daily registers stay in 7A, whose students no other spec moves: a register
// taken today would stop a move from today.
const HOMEROOM = { chromium: "7A", firefox: "8A", webkit: "9A" } as const;
const PERIOD = {
  chromium: null,
  firefox: /^Period 1 ·/,
  webkit: /^Period 2 ·/,
} as const;

/** The latest school day up to today: not a Friday or Saturday. */
function schoolDay() {
  const day = new Date();
  while ([5, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

test("a homeroom teacher takes a register on a phone", async ({
  page,
  browserName,
}) => {
  const period = PERIOD[browserName as keyof typeof PERIOD];
  await page.setViewportSize({ width: 390, height: 844 });
  await signInWith(
    page,
    "teacher1.northwind@northwind.example.com",
    PASSWORD,
    "/today",
  );
  await page.goto(`/attendance?date=${schoolDay()}`);
  await page.getByRole("link", { name: "7A", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "7A" }),
  ).toBeVisible();
  // The phone shell has no search button to wait on; the register's marks
  // stay disabled until the page is interactive.
  const anyMark = page.getByRole("radio", { name: "Present" }).first();
  await expect(anyMark).toBeEnabled();
  if (period) {
    await page.getByRole("button", { name: /^Period/ }).click();
    await page.getByRole("menuitemradio", { name: period }).click();
    await expect(page).toHaveURL(/periodId=/);
    await expect(anyMark).toBeEnabled();
  }
  const first = page.getByRole("group", { name: /^Mark for / }).first();
  await first.getByRole("radio", { name: "Absent" }).locator("..").click();
  await page.getByRole("button", { name: "Mark the rest present" }).click();
  await expect(page.getByText(/not marked/)).toHaveCount(0);
  await page.getByRole("button", { name: "Submit register" }).click();
  await expect(page.getByText("Register submitted")).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(first.getByRole("radio", { name: "Absent" })).toBeChecked();
});

test("the office excuses an unexplained absence and the reason reaches the record", async ({
  page,
  browserName,
}) => {
  const homeroom = HOMEROOM[browserName as keyof typeof HOMEROOM];
  await signIn(page, "admin");
  await page.goto("/attendance?tab=absences&from=2026-09-13&to=2026-09-24");
  await untilHydrated(page);
  const row = page
    .getByRole("row")
    .filter({ hasText: `${homeroom} · Registration` })
    .filter({ hasText: "Absent" })
    .first();
  const student = (await row.getByRole("link").textContent()) ?? "";
  const date = (await row.getByRole("cell").nth(2).textContent()) ?? "";
  await row.getByRole("button", { name: /^Actions for / }).click();
  await page.getByRole("menuitem", { name: "Excuse" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: /Note/ }).fill("Doctor's note.");
  await sheet.getByRole("button", { name: "Excuse" }).click();
  await expect(page.getByText("1 mark excused")).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: student })
      .filter({ hasText: date })
      .filter({ hasText: `${homeroom} · Registration` }),
  ).toHaveCount(0);

  await page.goto(
    "/attendance?tab=absences&from=2026-09-13&to=2026-09-24&show=all",
  );
  await untilHydrated(page);
  await page
    .getByRole("row")
    .filter({ hasText: student })
    .filter({ hasText: date })
    .getByRole("link", { name: student })
    .click();
  await expect(page.getByRole("tab", { name: "Attendance" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Doctor's note.").first()).toBeVisible();
});

test("a family reads their child's attendance", async ({ page }) => {
  await signIn(page, "parent");
  await page.goto("/family/attendance");
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Attendance" }),
  ).toBeVisible();
  await expect(page.getByText("Attendance rate")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Absences and late arrivals" }),
  ).toBeVisible();
});

test("an unsaved register asks before it is left, and a register saved meanwhile is refused with the marks kept", async ({
  page,
}) => {
  const admin = await apiAs("admin");
  const unique = crypto.randomUUID().slice(0, 6);
  const { id: workingYearId } = await workingYear(admin);
  const klass = await newClass(admin, {
    yearId: workingYearId,
    title: `Salama register ${unique}`,
  });
  const [first, second] = await Promise.all([
    newStudent(admin, `Guard ${unique}`),
    newStudent(admin, `Stale ${unique}`),
  ]);
  const { today } = await admin.identity.currentUser();
  const days = await schoolDaysTo(admin, workingYearId, today);
  const day = days.at(-3);
  const joined = days.at(-6);
  if (!day || !joined) throw new Error("too few school days so far");
  await Promise.all(
    [first, second].map((student) =>
      admin.homerooms.place({
        studentId: student.id,
        classId: klass.id,
        from: joined,
      }),
    ),
  );

  await signIn(page, "admin");
  await page.goto(`/registers/${klass.id}?date=${day}`);
  await untilHydrated(page);
  const mark = page
    .getByRole("group", { name: `Mark for ${first.name}` })
    .getByRole("radio", { name: "Absent" });
  await expect(mark).toBeEnabled();
  await mark.locator("..").click();
  await expect(mark).toBeChecked();

  // Changing the day with a mark unsaved asks first, and staying keeps it.
  const address = page.url();
  await page.locator("#register-date").fill(days.at(-4) ?? joined);
  const leave = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Keep editing" }).click();
  await expect(leave).toHaveCount(0);
  await expect(page).toHaveURL(address);
  await expect(mark).toBeChecked();

  // Someone else saves the register while this one is open.
  const register = await admin.attendance.register({
    classId: klass.id,
    date: day,
  });
  await admin.attendance.save({
    classId: klass.id,
    date: day,
    periodId: register.period.id,
    expectedVersion: 0,
    marks: [{ studentId: second.id, meaning: "present" }],
  });
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText:
        "Someone saved this register after you opened it. Reload to see their marks before saving again.",
    }),
  ).toBeVisible();
  await expect(mark).toBeChecked();
});
