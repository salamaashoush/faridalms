import type { Locator } from "@playwright/test";

import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  signIn,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

async function fillNames(
  scope: Locator,
  arabic: [string, string],
  english: [string, string],
) {
  const ar = scope.getByRole("group", { name: "Name in Arabic" });
  await ar.getByRole("textbox", { name: "First name" }).fill(arabic[0]);
  await ar.getByRole("textbox", { name: "Family name" }).fill(arabic[1]);
  const en = scope.getByRole("group", { name: "Name in English" });
  await en.getByRole("textbox", { name: "First name" }).fill(english[0]);
  await en.getByRole("textbox", { name: "Family name" }).fill(english[1]);
}

test("an administrator adds a student with a new guardian and opens both records", async ({
  page,
}) => {
  const unique = crypto.randomUUID().slice(0, 8);
  const mobile = `010${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  await signIn(page, "admin");
  await page.goto("/admin/students");
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add student", exact: true }).click();
  await expect(page).toHaveURL(/\/student-editor/);

  const personal = page.getByRole("region", { name: "Personal details" });
  await fillNames(personal, ["سلامة", "عاشور"], ["Salama", `Ashoush ${unique}`]);
  await personal
    .getByRole("textbox", { name: "Student reference" })
    .fill(`T-${unique}`);
  await page.getByRole("combobox", { name: /^Grade/ }).click();
  await page.getByRole("option").nth(1).click();

  await page.getByRole("button", { name: "Add guardian", exact: true }).click();
  const guardian = page.getByRole("group", { name: "Guardian 1" });
  await guardian.getByRole("textbox", { name: "Mobile" }).fill(mobile);
  await fillNames(guardian, ["منى", "عاشور"], ["Mona", `Ashoush ${unique}`]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/students/);

  await page.getByRole("searchbox").fill(`T-${unique}`);
  await expect(page).toHaveURL(new RegExp(`q=T-${unique}`));
  await page
    .getByRole("table")
    .getByRole("link", { name: `Salama Ashoush ${unique}` })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: `Salama Ashoush ${unique}` }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Family", exact: true }).click();
  await page.getByRole("link", { name: `Mona Ashoush ${unique}` }).click();
  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: `Mona Ashoush ${unique}` }),
  ).toBeVisible();
  const linked = page.getByRole("region", { name: "Linked students" });
  await expect(
    linked.getByRole("link", { name: `Salama Ashoush ${unique}` }),
  ).toBeVisible();
  await expect(linked.getByText("Mother", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Roles at this school" })
      .getByText("Parent"),
  ).toBeVisible();
});

test("the student list keeps only the filters a reader changed in the URL", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/admin/students");
  await untilHydrated(page);
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Name", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/students\?dir=desc$/);
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/students\?dir=desc$/);
});

test("record tabs follow the reading direction in Arabic", async ({
  page,
  context,
}) => {
  await signIn(page, "admin");
  await context.addCookies([
    { name: "language-tag", value: "ar", domain: "127.0.0.1", path: "/" },
  ]);
  await page.goto("/admin/students");
  await untilHydrated(page);
  await page.getByRole("table").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
  await page.getByRole("tab", { name: "نظرة عامة", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "التفاصيل", exact: true }),
  ).toBeFocused();
});

test("a parent opens their own record but not the school's student list", async ({
  page,
}) => {
  await signIn(page, "parent");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: /profile/i }).click();
  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+/);
  await expect(
    page.getByRole("region", { name: "Linked students" }).getByRole("link"),
  ).not.toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "History", exact: true }),
  ).toHaveCount(0);
});

test("an administrator adds a staff member, opens their sign-in and they sign in", async ({
  page,
  browser,
}) => {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = `staff-${unique}@northwind.example.com`;
  const password = "a long enough pass phrase";
  await signIn(page, "admin");
  await page.goto("/admin/staff");
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add staff member" }).first().click();
  await expect(page).toHaveURL(/\/staff-editor/);
  await fillNames(
    page.getByRole("main"),
    ["سلامة", "نور"],
    ["Salama", `Nour ${unique}`],
  );
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("checkbox", { name: "Counselor" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/staff/);

  await page.getByRole("searchbox").fill(email);
  const row = page
    .getByRole("table")
    .getByRole("row")
    .filter({ hasText: email });
  await expect(row).toContainText("Teacher and Counselor");
  await row.getByRole("link", { name: `Salama Nour ${unique}` }).click();
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Create sign-in" }).click();
  const sheet = page.getByRole("dialog", { name: "Create sign-in" });
  await expect(
    sheet.getByRole("textbox", { name: "Sign-in name" }),
  ).toHaveValue(email);
  await sheet.getByLabel("Password").fill(password);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  const context = await browser.newContext();
  const staff = await context.newPage();
  await signInWith(staff, email, password, "/teach");
  await expect(staff.getByRole("heading", { level: 1 })).toBeVisible();
  await context.close();
});

test("an administrator makes a role and gives it to a teacher", async ({
  page,
}) => {
  const unique = crypto.randomUUID().slice(0, 8);
  await signIn(page, "admin");
  await page.goto("/admin/settings?section=access");
  await untilHydrated(page);
  await page.getByRole("button", { name: "New role" }).click();
  const sheet = page.getByRole("dialog", { name: "New role" });
  await sheet
    .getByRole("textbox", { name: "Name in English" })
    .fill(`Timetabler ${unique}`);
  await sheet.getByRole("checkbox", { name: "Build the timetable" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: `Timetabler ${unique}` }),
  ).toBeVisible();

  await page.goto("/admin/staff?role=%5B%22teacher%22%5D");
  await untilHydrated(page);
  await page.getByRole("table").getByRole("link").first().click();
  await page.getByRole("tab", { name: "Access", exact: true }).click();
  await page.getByRole("button", { name: "Assign role" }).click();
  const assign = page.getByRole("dialog", { name: "Assign role" });
  await assign.getByRole("combobox", { name: /^Role/ }).click();
  await page.getByRole("option", { name: `Timetabler ${unique}` }).click();
  await assign.getByRole("button", { name: "Save" }).click();
  await expect(assign).toHaveCount(0);
  await expect(
    page.getByText(`Timetabler ${unique}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Build the timetable", { exact: true }),
  ).toBeVisible();
});

// Each browser project edits a different school, so the three runs never
// race on one profile's version.
const PROFILE_ADMIN: Record<
  "chromium" | "firefox" | "webkit",
  [school: string, email: string]
> = {
  chromium: ["northwind", "principal.northwind@northwind.example.com"],
  firefox: ["northwind-east", "principal.northwind-east@northwind.example.com"],
  webkit: ["acme", "principal.acme@acme.example.com"],
};

test("the school profile saves its fields and refuses a weekend start", async ({
  page,
  browserName,
}) => {
  const [school, email] = PROFILE_ADMIN[browserName];
  await signInWith(page, email, PASSWORD, "/admin", school);
  await page.goto("/admin/settings");
  await untilHydrated(page);
  const profile = page.getByRole("region", { name: "School profile" });
  const weekStart = profile.getByRole("combobox", {
    name: "First day of the school week",
  });
  const start = await weekStart.innerText();
  // Whatever the school's weekend is, the day the week starts on today is a
  // working day; making it a weekend day as well must be refused.
  const startDay = start.trim();
  await profile.getByRole("checkbox", { name: startDay, exact: true }).click();
  await profile
    .getByRole("textbox", { name: "School phone" })
    .fill("+20 2 1234 5678");
  await profile.getByRole("button", { name: "Save" }).click();
  await expect(
    profile.getByText("The school week can't start on a weekend day."),
  ).toBeVisible();

  await profile.getByRole("checkbox", { name: startDay, exact: true }).click();
  await profile.getByRole("button", { name: "Save" }).click();
  await expect(
    profile.getByText("The school week can't start on a weekend day."),
  ).toHaveCount(0);
  await expect(profile.getByText(/saved/i)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "School phone" })).toHaveValue(
    "+20 2 1234 5678",
  );
});
