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

test("a student's record opens on their day, their year of attendance and what their guardians were told", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/admin/students");
  await untilHydrated(page);
  await page.getByRole("table").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
  // The day's lessons, or that it has none: a weekend's record says so.
  const today = page.getByRole("region", { name: "Today", exact: true });
  await expect(
    today
      .getByRole("listitem")
      .or(today.getByText("No lessons today."))
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Told to guardians" }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Attendance", exact: true })
    .getByRole("button", { name: "All marks" })
    .click();
  await expect(
    page.getByRole("tab", { name: "Attendance", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("the office writes to a student's guardians from the student's record", async ({
  page,
}) => {
  await signIn(page, "admin");
  // A student whose family's conversations no other spec reads.
  await page.goto("/admin/students?q=GA1008");
  await untilHydrated(page);
  await page
    .getByRole("link", { name: /Tarek Farouk/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
  // Moving class is asked for here too, and opens the sheet the classes do.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Move class" }).click();
  const move = page.getByRole("dialog", {
    name: "Move Tarek Farouk to another class",
  });
  await expect(move).toBeVisible();
  await move.getByRole("button", { name: "Cancel" }).click();
  await expect(move).toBeHidden();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Message guardians" }).click();
  const sheet = page.getByRole("dialog", { name: "New message" });
  // Nobody is picked: the conversation is with this student's guardians.
  await expect(
    sheet.getByText("To the guardians of Tarek Farouk"),
  ).toBeVisible();
  await expect(sheet.getByRole("combobox")).toHaveCount(0);
  const note = `Sports day kit, ${crypto.randomUUID().slice(0, 6)}`;
  await sheet.getByRole("textbox", { name: "Message" }).fill(note);
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/messages\?.*thread=[a-f0-9-]+/);
  await expect(page.getByText(note).first()).toBeVisible();
});

test("the office writes to the families of the students it picks in the list, each in its own conversation", async ({
  page,
}) => {
  await signIn(page, "admin");
  // Two students whose families' conversations no other spec reads.
  await page.goto("/admin/students?q=Zaki");
  await untilHydrated(page);
  const pick = page
    .getByRole("table")
    .getByRole("checkbox", { name: /^Select .*Zaki/ });
  await pick.nth(0).check();
  await pick.nth(1).check();
  await page.getByRole("button", { name: "Message guardians" }).click();
  const sheet = page.getByRole("dialog", { name: "New message" });
  await expect(
    sheet.getByText("To the guardians of the 2 students picked"),
  ).toBeVisible();
  const note = `Trip on Thursday, ${crypto.randomUUID().slice(0, 6)}`;
  await sheet.getByRole("textbox", { name: "Message" }).fill(note);
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Sent to the guardians of 2 students."),
  ).toBeVisible();
  await expect(sheet).toBeHidden();
  // Each family has it in a conversation about its own child. Other
  // browsers write to the same two, so each is opened and read through.
  await page.goto("/admin/messages");
  await untilHydrated(page);
  const families = page
    .getByRole("list", { name: "Conversations" })
    .getByRole("button", { name: /Zaki/ });
  for (const family of [families.nth(0), families.nth(1)]) {
    await family.click();
    await expect(page.getByRole("list", { name: "Messages" })).toContainText(
      note,
    );
  }
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

test("a health alert and a pickup restriction show on the student's header", async ({
  page,
}) => {
  const unique = crypto.randomUUID().slice(0, 8);
  await signIn(page, "admin");
  await page.goto("/admin/students");
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add student", exact: true }).click();
  const personal = page.getByRole("region", { name: "Personal details" });
  await fillNames(personal, ["سلامة", "حسن"], ["Salama", `Hassan ${unique}`]);
  await personal
    .getByRole("textbox", { name: "Student reference" })
    .fill(`H-${unique}`);
  await page.getByRole("button", { name: "Add guardian", exact: true }).click();
  const guardian = page.getByRole("group", { name: "Guardian 1" });
  await guardian
    .getByRole("textbox", { name: "Mobile" })
    .fill(`012${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`);
  await fillNames(guardian, ["منى", "حسن"], ["Mona", `Hassan ${unique}`]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/students/);
  await page.getByRole("searchbox").fill(`H-${unique}`);
  await page
    .getByRole("table")
    .getByRole("link", { name: `Salama Hassan ${unique}` })
    .click();

  await page.getByRole("tab", { name: "Health", exact: true }).click();
  await page.getByRole("button", { name: "Add health record" }).click();
  const sheet = page.getByRole("dialog", { name: "Add health record" });
  await sheet.getByRole("textbox", { name: "Details" }).fill("Peanuts");
  await sheet
    .getByRole("checkbox", {
      name: "Show a medical alert on the student's record",
    })
    .click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText("Medical alert", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Family", exact: true }).click();
  await page
    .getByRole("button", { name: `Edit custody for Mona Hassan ${unique}` })
    .click();
  const custody = page.getByRole("dialog", {
    name: `Edit custody for Mona Hassan ${unique}`,
  });
  await custody
    .getByRole("combobox", { name: "May collect the student" })
    .click();
  await page.getByRole("option", { name: "Not allowed to collect" }).click();
  await custody.getByRole("button", { name: "Save" }).click();
  await expect(custody).toHaveCount(0);
  await expect(page.getByText("May not collect the student")).toBeVisible();
  await expect(page.getByText("Custody note", { exact: true })).toBeVisible();
});

test("an administrator keeps a guardian's address on the student's family tab", async ({
  page,
}) => {
  const unique = crypto.randomUUID().slice(0, 8);
  await signIn(page, "admin");
  await page.goto("/admin/students");
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add student", exact: true }).click();
  const personal = page.getByRole("region", { name: "Personal details" });
  await fillNames(personal, ["يوسف", "نبيل"], ["Youssef", `Nabil ${unique}`]);
  await personal
    .getByRole("textbox", { name: "Student reference" })
    .fill(`N-${unique}`);
  await page.getByRole("button", { name: "Add guardian", exact: true }).click();
  const guardian = page.getByRole("group", { name: "Guardian 1" });
  await guardian
    .getByRole("textbox", { name: "Mobile" })
    .fill(`012${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`);
  await fillNames(guardian, ["هالة", "نبيل"], ["Hala", `Nabil ${unique}`]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/students/);
  await page.getByRole("searchbox").fill(`N-${unique}`);
  await page
    .getByRole("table")
    .getByRole("link", { name: `Youssef Nabil ${unique}` })
    .click();

  await page.getByRole("tab", { name: "Family", exact: true }).click();
  await page
    .getByRole("button", { name: `Actions for Hala Nabil ${unique}` })
    .click();
  await page.getByRole("menuitem", { name: "Edit contact details" }).click();
  const contacts = page.getByRole("dialog", {
    name: `Contact details for Hala Nabil ${unique}`,
  });
  await contacts
    .getByRole("textbox", { name: "Street and building" })
    .fill("12 Nile Street");
  await contacts
    .getByRole("textbox", { name: "City or district" })
    .fill("Zamalek");
  await contacts.getByRole("button", { name: "Save" }).click();
  await expect(contacts).toHaveCount(0);
  const guardians = page.getByRole("region", { name: "Guardians" });
  await expect(guardians.getByText("12 Nile Street, Zamalek")).toBeVisible();
  await expect(guardians.getByText(/Main home/)).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Brothers and sisters" })
      .getByText("No brothers or sisters at the school."),
  ).toBeVisible();
});
