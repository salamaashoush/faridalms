import type { Page } from "@playwright/test";

import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { absentWords, shownWords } from "./fixtures/module-words";
import { names, refusal, schoolDaysBack } from "./fixtures/school";
import {
  PASSWORD,
  portal,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seeded academy on core, coursework, attendance and e-learning alone,
// with its administrator, a teacher, and a learner for each browser so
// parallel projects never hand in or read each other's work.
const SCHOOL = "lanternfield";
const at = portal(SCHOOL);
const ADMIN = "admin.lanternfield@lanternfield.example.com";
const TEACHER = "teacher1.lanternfield@lanternfield.example.com";
const TEACHER_NAME = "Heba Rashad";
const LEARNER: Record<string, [login: string, name: string]> = {
  chromium: ["student1.lanternfield@lanternfield.example.com", "Nour Saleh"],
  firefox: ["student7.lanternfield@lanternfield.example.com", "Dina Helmy"],
  webkit: ["student12.lanternfield@lanternfield.example.com", "Khaled Fathy"],
};

/** A one-pixel PNG, enough for a logo. */
const LOGO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const tag = () => crypto.randomUUID().slice(0, 6);

/**
 * The words of the absent modules on a record: its page, then each of its
 * tabs once that tab's own section has read its data.
 */
async function recordWords(page: Page, path: string, language: "en" | "ar") {
  const found = await absentWords(page, path, language);
  const tabs = page.getByRole("tab");
  const count = await tabs.count();
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    const name = (await tab.innerText()).trim();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name })).toBeVisible();
    await page.waitForLoadState("networkidle");
    found.push(...(await shownWords(page, `${path} ${name}`, language)));
  }
  return found;
}

test("the academy's setup guide has only core's steps and its modules', and can be finished", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { api } = await signedInApi(ADMIN, PASSWORD, SCHOOL);
  // An administrator of their own, since putting the guide away is theirs.
  const login = `salama.${tag()}@lanternfield.example.com`;
  const staff = await api.people.saveStaff({
    names: names("Salama", "Director"),
    email: login,
    roles: ["site_administrator"],
  });
  await api.people.saveSignIn({
    userId: staff.id,
    loginName: login,
    password: PASSWORD,
  });

  await signInWith(page, login, PASSWORD, "/today", SCHOOL);
  await untilHydrated(page);
  const guide = page.getByRole("region", { name: "Getting started" });
  const [steps, along] = [
    guide.getByRole("list").nth(0),
    guide.getByRole("list").nth(1),
  ];
  await expect(steps.getByRole("heading", { level: 3 })).toHaveText([
    "School details and logo",
    "Classes",
    "Staff",
    "Students",
  ]);
  for (const name of ["Classes", "Staff", "Students"])
    await expect(
      steps.getByRole("listitem").filter({ hasText: name }),
    ).toContainText("Done");
  await expect(along.getByRole("listitem")).toHaveText([
    /^An administrator signs in/,
    /^A teacher signs in/,
    /^First assignment published/,
    /^First register taken/,
    /^First invoice paid/,
    /^Kick-off call with our team/,
    /^Training session/,
    /^Data import finished/,
  ]);

  // The school's details: its logo beside the contact it already has.
  await guide
    .getByRole("link", { name: /^(Start|Review): School details and logo$/ })
    .click();
  await expect(page).toHaveURL(/\/settings(\?|$)/);
  // Another browser's walk may save the same profile at the same moment;
  // whoever loses saves again over what the other saved.
  await expect(async () => {
    await page.goto(`${at}/settings`);
    await untilHydrated(page);
    const profile = page.getByRole("region", { name: "School profile" });
    const logo = profile.locator("img[src^='/files/']");
    const before = (await logo.count()) ? await logo.getAttribute("src") : null;
    await profile.locator("input[type=file]").setInputFiles({
      name: "lanternfield.png",
      mimeType: "image/png",
      buffer: LOGO,
    });
    await expect.poll(() => logo.getAttribute("src")).not.toBe(before);
    await profile.getByRole("button", { name: "Save", exact: true }).click();
    await expect(profile.getByText(/saved/i)).toBeVisible({ timeout: 3_000 });
  }).toPass();

  await page.goto(`${at}/today`);
  await untilHydrated(page);
  await expect(
    steps.getByRole("listitem").filter({ hasText: "School details and logo" }),
  ).toContainText("Done");
  await expect(guide.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "4",
  );
  await guide.getByRole("button", { name: "Hide" }).click();
  await expect(guide).toBeHidden();
  await page.reload();
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
  await expect(guide).toHaveCount(0);
});

test("the academy runs a class from setup to a register, an assignment marked and returned, a lesson and a message, and names no module it lacks", async ({
  browser,
  page,
  browserName,
}) => {
  test.setTimeout(360_000);
  const chosen = LEARNER[browserName];
  if (!chosen) throw new Error(`no learner for ${browserName}`);
  const [learnerLogin, learner] = chosen;
  const { api: office } = await signedInApi(ADMIN, PASSWORD, SCHOOL);
  const { today } = await office.identity.currentUser();
  const starts = addDays(today, -14);
  const [lastDay] = await schoolDaysBack(office, today, 1);
  if (!lastDay) throw new Error("the academy has had no school days");
  const title = `Python for analysts ${tag()}`;

  // The administrator makes the class, with its teacher, and enrols a learner.
  await signInWith(page, ADMIN, PASSWORD, "/today", SCHOOL);
  await page.goto(`${at}/classes`);
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add class", exact: true }).click();
  await expect(page).toHaveURL(/\/class-editor/);
  await untilHydrated(page);
  await page
    .getByRole("textbox", { name: "Class name in English" })
    .fill(title);
  await page
    .getByRole("textbox", { name: "Class name in Arabic" })
    .fill("بايثون للمحللين");
  await page.getByRole("textbox", { name: /^Class code/ }).fill(`PYA-${tag()}`);
  await page.getByLabel("Starts on").fill(starts);
  await page.getByRole("button", { name: "Add teacher", exact: true }).click();
  await page.getByRole("combobox", { name: /^Teacher/ }).click();
  await page.getByRole("option", { name: TEACHER_NAME, exact: true }).click();
  await expect(page.getByRole("combobox", { name: /^Teacher/ })).toContainText(
    TEACHER_NAME,
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/classes(\?|$)/);
  await page
    .getByRole("table")
    .getByRole("link", { name: title, exact: true })
    .click();
  await expect(page).toHaveURL(/\/classes\/[0-9a-f-]{36}/);
  const classPath = new URL(page.url()).pathname;

  await page.getByRole("tab", { name: "Students", exact: true }).click();
  const roster = page.getByRole("region", { name: "Students" });
  await roster
    .getByRole("button", { name: "Add student", exact: true })
    .click();
  const adding = page.getByRole("dialog");
  await adding.getByRole("combobox", { name: /^Student/ }).click();
  await page.getByRole("combobox", { name: /^Search/ }).fill(learner);
  await page.getByRole("option", { name: learner, exact: true }).click();
  await adding.locator("#add-from").fill(starts);
  await adding
    .getByRole("button", { name: "Add student", exact: true })
    .click();
  await expect(
    page.getByText(`${learner} joined ${title}`, { exact: true }),
  ).toBeVisible();
  await roster.getByRole("link", { name: learner, exact: true }).click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/);
  const studentPath = new URL(page.url()).pathname;

  // Only core's pages and its three modules' are offered.
  await page.goto(`${at}/today`);
  await untilHydrated(page);
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link"),
  ).toHaveText([
    "Today",
    "Classes",
    "To review",
    "Coursework",
    "Modules",
    "Attendance",
    "Students",
    "Staff",
    /^Messages/,
    "Announcements",
    "Calendar",
    "Library",
    "Settings",
    "Billing",
    "Data protection",
    "Delivery log",
  ]);
  await page.goto(`${at}/settings`);
  await untilHydrated(page);
  await expect(page.getByRole("tab")).toHaveText([
    "School",
    "Subject catalogue",
    "Attendance",
    "Grading",
    "Roles and permissions",
    "Language model",
  ]);
  // Following up absences calls families, which the academy does not keep.
  await page.goto(`${at}/attendance?tab=follow`);
  await untilHydrated(page);
  await expect(page.getByRole("tab")).toHaveText([
    "Registers",
    "Front desk",
    "Absences",
    "Reported",
    "Reports",
  ]);
  await expect(page.getByRole("tab", { name: "Registers" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await refusal(office.followUp.day({ date: lastDay }))).toMatchObject({
    code: "NOT_FOUND",
  });

  const found: string[] = [];
  for (const language of ["en", "ar"] as const) {
    if (language === "ar")
      await page
        .context()
        .addCookies([{ name: "language-tag", value: "ar", url: at }]);
    for (const path of [
      "/today",
      "/settings",
      "/attendance",
      "/messages",
      "/announcement-editor",
    ])
      found.push(...(await absentWords(page, `${at}${path}`, language)));
    found.push(...(await recordWords(page, `${at}${classPath}`, language)));
    found.push(...(await recordWords(page, `${at}${studentPath}`, language)));
  }
  expect(found).toEqual([]);

  // The teacher takes the class's register for the last school day.
  const teaching = await browser.newContext();
  const teacher = await teaching.newPage();
  await signInWith(teacher, TEACHER, PASSWORD, "/today", SCHOOL);
  await teacher.goto(`${at}/attendance?date=${lastDay}`);
  await untilHydrated(teacher);
  await teacher.getByRole("link", { name: title, exact: true }).click();
  await expect(
    teacher.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(teacher.getByRole("button", { name: /^Period/ })).toHaveCount(0);
  await expect(
    teacher.getByRole("radio", { name: "Present" }).first(),
  ).toBeEnabled();
  await teacher.getByRole("button", { name: "Mark the rest present" }).click();
  await teacher.getByRole("button", { name: "Submit register" }).click();
  await expect(teacher.getByText("Register submitted")).toBeVisible();

  // The teacher sets work, which has no term to belong to.
  const work = `Read a CSV ${tag()}`;
  await teacher.goto(`${at}/assignment-editor`);
  await untilHydrated(teacher);
  await teacher.locator("#work-class").click();
  await teacher
    .getByRole("option", { name: new RegExp(title) })
    .first()
    .click();
  await teacher.getByRole("textbox", { name: "Assignment title" }).fill(work);
  await teacher.locator("[contenteditable=true]").first().click();
  await teacher.keyboard.type("Load sales.csv and print its first five rows.");
  await expect(teacher.locator("#work-term")).toHaveCount(0);
  await teacher.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(teacher).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  const workUrl = teacher.url().split("?")[0] ?? "";

  // The learner hands it in.
  const learning = await browser.newContext();
  const student = await learning.newPage();
  await signInWith(student, learnerLogin, PASSWORD, "/me", SCHOOL);
  await student.goto(`${at}/me/assignments`);
  await untilHydrated(student);
  await student.getByRole("link", { name: work }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: work }),
  ).toBeVisible();
  await student.locator("[contenteditable=true]").first().click();
  await student.keyboard.type('print(pandas.read_csv("sales.csv").head())');
  await student.getByRole("button", { name: "Hand in", exact: true }).click();
  await student
    .getByRole("dialog")
    .getByRole("button", { name: "Hand in", exact: true })
    .click();
  await expect(
    student.getByRole("region", { name: "Handed in" }).getByText("Attempt 1"),
  ).toBeVisible();

  // The teacher marks and returns it, and the learner reads the mark.
  await teacher.goto(`${workUrl}?tab=work`);
  await untilHydrated(teacher);
  const row = teacher
    .getByRole("tabpanel")
    .getByRole("row", { name: new RegExp(learner) });
  await expect(row.getByText("Handed in", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Grade", exact: true }).click();
  await expect(teacher).toHaveURL(/\/grading/);
  await untilHydrated(teacher);
  await expect(async () => {
    await teacher.getByRole("button", { name: "Grade", exact: true }).click();
    await expect(teacher.locator("#grade-score")).toBeVisible({
      timeout: 2_000,
    });
  }).toPass();
  await teacher.locator("#grade-score").fill("9");
  await teacher.locator("#grade-feedback").fill("Five rows, read cleanly.");
  await teacher.getByRole("button", { name: "Return and next" }).click();
  await expect(teacher).toHaveURL(/tab=work/);
  await expect(
    teacher
      .getByRole("tabpanel")
      .getByRole("row", { name: new RegExp(learner) })
      .getByText("Returned", { exact: true }),
  ).toBeVisible();
  await student.reload();
  await untilHydrated(student);
  await expect(student.getByText("Five rows, read cleanly.")).toBeVisible();
  await expect(student.getByText("9 / 10")).toBeVisible();

  // A module of lessons for the class, opened to its learners.
  const module = `Tables with pandas ${tag()}`;
  await teacher.goto(`${at}/module-editor`);
  await untilHydrated(teacher);
  await teacher.getByRole("textbox", { name: "Module title" }).fill(module);
  await teacher.getByRole("combobox", { name: "Classes" }).click();
  await teacher
    .getByRole("option", { name: new RegExp(title) })
    .first()
    .click();
  await teacher.keyboard.press("Escape");
  await teacher.getByRole("button", { name: "Save", exact: true }).click();
  await expect(teacher).toHaveURL(/\/modules\/[a-f0-9-]+/);
  await teacher.getByRole("link", { name: "Add lesson" }).click();
  await expect(teacher).toHaveURL(/\/lesson-editor/);
  await untilHydrated(teacher);
  await teacher.getByRole("textbox", { name: "Lesson title" }).fill("Columns");
  await teacher.locator("#lesson-body").click();
  await teacher.keyboard.type("A column is one field of every row.");
  await expect(teacher.getByText("Saved", { exact: true })).toBeVisible();
  await teacher.getByRole("button", { name: "Back" }).click();
  await expect(teacher.getByRole("link", { name: "Columns" })).toBeVisible();
  await expect(async () => {
    await teacher.getByRole("button", { name: "More actions" }).click();
    await teacher
      .getByRole("menuitem", { name: "Open to students" })
      .click({ timeout: 1_000 });
  }).toPass();
  await expect(teacher.getByText("Module open to students")).toBeVisible();

  await student.goto(`${at}/me/modules`);
  await untilHydrated(student);
  await student.getByRole("link", { name: module }).click();
  await student.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: "Columns" }),
  ).toBeVisible();
  await expect(
    student.getByText("A column is one field of every row."),
  ).toBeVisible();

  // The teacher writes to the learner, who reads it, and the teacher sees so.
  const words = `Bring your laptop on Sunday (${browserName} ${tag()})`;
  await teacher.goto(`${at}/messages`);
  await untilHydrated(teacher);
  await teacher.getByRole("button", { name: "New message" }).click();
  const sheet = teacher.getByRole("dialog", { name: "New message" });
  await sheet.getByRole("combobox", { name: /^Person/ }).click();
  await teacher.getByRole("combobox", { name: /Search/ }).fill(learner);
  await teacher.getByRole("option", { name: learner }).click();
  await sheet.locator("[contenteditable=true]").click();
  await teacher.keyboard.type(words);
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(teacher).toHaveURL(/thread=/);
  const thread = teacher.getByRole("list", { name: "Messages" });
  await expect(thread).toContainText(words);

  await student.goto(`${at}/me/messages`);
  await untilHydrated(student);
  await student
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: new RegExp(TEACHER_NAME) })
    .first()
    .click();
  await expect(student.getByRole("list", { name: "Messages" })).toContainText(
    words,
  );
  await teacher.reload();
  await untilHydrated(teacher);
  await expect(
    thread.getByRole("listitem").filter({ hasText: words }),
  ).toContainText("Seen by 1");

  await learning.close();
  await teaching.close();
});

test("a school that keeps families follows up absences from its attendance", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/attendance?tab=follow");
  await untilHydrated(page);
  await expect(page.getByRole("tab", { name: "Follow up" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
