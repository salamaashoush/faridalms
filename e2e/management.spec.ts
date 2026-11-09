import type { Locator } from "@playwright/test";

import { plainContent } from "@faridalms/domain/content-conversion";
import { expect, test } from "@playwright/test";

import { apiAs } from "./fixtures/api";
import { openWith, signIn, untilHydrated } from "./fixtures/sign-in";

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

test("class forms explain invalid fields, recover on correction and protect unsaved work", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/classes");
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add class", exact: true }).click();
  await expect(page).toHaveURL(/\/class-editor/);
  const arabicName = page.getByRole("textbox", {
    name: "Class name in Arabic",
  });
  const code = page.getByRole("textbox", { name: /^Class code/ });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(arabicName).toHaveAttribute("aria-invalid", "true");
  await expect(arabicName).toHaveAccessibleDescription(
    "Enter the name in Arabic or English",
  );
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(code).toHaveAccessibleDescription(
    "Use 1 to 40 Latin letters, digits, dots or dashes.",
  );
  await page
    .getByRole("textbox", { name: "Class name in English" })
    .fill("Salama class");
  await expect(arabicName).not.toHaveAttribute("aria-invalid", "true");
  await code.fill(`S-${crypto.randomUUID().slice(0, 8)}`);
  await expect(code).not.toHaveAttribute("aria-invalid", "true");

  // A subject the class already has is not offered again, so it cannot be
  // added twice.
  // Each subject is added in its own sheet, which offers only the subjects
  // the class lacks. The control was a menu of subjects under the grid.
  const addSubject = async (name: string, absent?: string) => {
    await page
      .getByRole("button", { name: "Add subject", exact: true })
      .click();
    const sheet = page.getByRole("dialog", { name: "Add subject" });
    await sheet.getByRole("combobox", { name: /^Subject (?!teacher)/ }).click();
    const offered = (option: string) =>
      page.getByRole("option", { name: option, exact: true });
    if (absent) await expect(offered(absent)).toHaveCount(0);
    await offered(name).click();
    await sheet.getByRole("button", { name: "Add subject" }).click();
    await expect(sheet).toBeHidden();
  };
  await addSubject("Mathematics");
  await addSubject("Arabic", "Mathematics");

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const leave = page.getByRole("dialog", {
    name: "Leave without saving?",
    exact: true,
  });
  await expect(leave).toBeVisible();
  await leave
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Class name in English" }),
  ).toHaveValue("Salama class");
  await expect(page).toHaveURL(/\/class-editor/);
});

test("administrators add a staff member through the shared editor and turn their sign-in off", async ({
  page,
}) => {
  const unique = crypto.randomUUID().slice(0, 8);
  const name = `Salama Ashoush ${unique}`;
  const email = `salama-${unique}@northwind.example.com`;
  await signIn(page, "admin");
  await page.goto("/staff");
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add staff member" }).first().click();
  await expect(page).toHaveURL(/\/staff-editor/);
  await fillNames(
    page.getByRole("main"),
    ["سلامة", "عاشور"],
    ["Salama", `Ashoush ${unique}`],
  );
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/staff/);

  await page.getByRole("searchbox").fill(unique);
  const row = page.getByRole("table").getByRole("row").filter({
    hasText: email,
  });
  await expect(row).toBeVisible();
  await page.reload();
  await expect(row).toBeVisible();
  await row.getByRole("link", { name }).click();
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Create sign-in" }).click();
  const sheet = page.getByRole("dialog", { name: "Create sign-in" });
  await sheet.getByLabel("Password").fill("school-account-passphrase-2026");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);

  await page.getByRole("button", { name: "Disable sign-in" }).click();
  const confirm = page.getByRole("dialog", {
    name: `Disable ${name}'s sign-in?`,
  });
  await confirm.getByRole("button", { name: "Disable sign-in" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(
    page.getByText(`${name} can no longer sign in`, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Enable sign-in" }),
  ).toBeVisible();
});

test("administrators edit a student record in side sheets and confirm a class move", async ({
  page,
}) => {
  const unique = crypto.randomUUID().slice(0, 8);
  const reference = `T-${unique}`;
  await signIn(page, "admin");
  await page.goto("/students");
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add student", exact: true }).click();
  await expect(page).toHaveURL(/\/student-editor/);
  const personal = page.getByRole("region", { name: "Personal details" });
  await fillNames(personal, ["سلامة", "عاشور"], ["Salama", `Ashoush ${unique}`]);
  await personal
    .getByRole("textbox", { name: "Student reference" })
    .fill(reference);
  await page.getByRole("combobox", { name: /^Grade/ }).click();
  await page.getByRole("option").nth(1).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/students/);

  // A second student cannot take the reference the first already holds.
  await untilHydrated(page);
  await page.getByRole("link", { name: "Add student", exact: true }).click();
  const another = page.getByRole("region", { name: "Personal details" });
  await fillNames(another, ["منى", "عاشور"], ["Mona", `Ashoush ${unique}`]);
  const taken = another.getByRole("textbox", { name: "Student reference" });
  await taken.fill(reference);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // A form this long takes the reader to its error summary, which links
  // each field it names.
  const summary = page.getByRole("alert", { name: "There is a problem" });
  await expect(summary).toBeFocused();
  await expect(
    summary.getByRole("link", { name: /Student reference/ }),
  ).toBeVisible();
  await expect(taken).toHaveAttribute("aria-invalid", "true");
  await expect(taken).toHaveAccessibleDescription(
    "Another student already uses this reference",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Leave without saving?" })
    .getByRole("button", { name: "Discard changes" })
    .click();
  await expect(page).toHaveURL(/\/students/);

  await page.getByRole("searchbox").fill(reference);
  await expect(page).toHaveURL(new RegExp(`q=${reference}`));
  await page
    .getByRole("table")
    .getByRole("link", { name: `Salama Ashoush ${unique}` })
    .click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
  const studentId = new URL(page.url()).pathname.split("/").at(-1) ?? "";

  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit personal details", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Edit personal details" });
  const arabicGiven = sheet
    .getByRole("group", { name: "Name in Arabic" })
    .getByRole("textbox", { name: "First name" });
  await fillNames(sheet, ["", ""], ["", ""]);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(arabicGiven).toBeFocused();
  await expect(arabicGiven).toHaveAttribute("aria-invalid", "true");
  await expect(arabicGiven).toHaveAccessibleDescription(
    "Enter the name in Arabic or English",
  );
  await fillNames(sheet, ["سلامة", "عاشور"], ["Salama", `Ashoush-${unique}`]);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  const name = `Salama Ashoush-${unique}`;
  await expect(
    page.getByRole("heading", { level: 1, name, exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Family", exact: true }).click();
  await page.getByRole("button", { name: "Add guardian", exact: true }).click();
  const guardian = page.getByRole("dialog", { name: "Add guardian" });
  await expect(guardian.getByRole("textbox", { name: "Mobile" })).toBeVisible();
  await guardian.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(guardian).toHaveCount(0);

  // Placed in a class of its own since the year began, so the move below
  // ends a placement no other spec reads.
  const admin = await apiAs("admin");
  const options = await admin.classes.options();
  const year = options.years.find((row) => row.id === options.workingYearId);
  if (!year) throw new Error("no working year");
  const classOf = async (label: string) =>
    admin.classes.save({
      yearId: year.id,
      code: `S-${unique}-${label}`,
      titleEn: `Salama ${unique} ${label}`,
      titleAr: "",
      subjects: [],
    });
  const first = `Salama ${unique} one`;
  const second = `Salama ${unique} two`;
  const { id: firstId } = await classOf("one");
  await classOf("two");
  await admin.classes.enrol({
    studentId,
    classId: firstId,
    from: year.startsOn,
  });
  await page.reload();
  await page.getByRole("tab", { name: "Enrollment", exact: true }).click();
  const classes = page.getByRole("region", { name: "Classes" });
  await expect(classes.getByRole("link", { name: first })).toBeVisible();

  await classes
    .getByRole("button", { name: "Move class", exact: true })
    .click();
  const move = page.getByRole("dialog", {
    name: `Move ${name} to another class`,
  });
  const target = move.getByRole("combobox", { name: /^New class/ });
  await move.getByRole("button", { name: "Move class", exact: true }).click();
  await expect(target).toBeFocused();
  await expect(target).toHaveAccessibleDescription(
    "Choose an option from the list.",
  );
  await target.click();
  await expect(page.getByRole("option", { name: first })).toHaveCount(0);
  await page.getByRole("option", { name: second }).click();
  // The move cannot start before the placement it ends.
  await expect(move.getByLabel("From", { exact: true })).toHaveAttribute(
    "min",
    year.startsOn,
  );
  await expect(move.getByRole("status")).toContainText(second);
  await move.getByRole("button", { name: "Move class", exact: true }).click();
  await expect(move).toHaveCount(0);
  await expect(
    page.getByText(`${name} moved to ${second}`, { exact: true }),
  ).toBeVisible();
  await expect(
    classes
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: second }) }),
  ).toContainText("Current");
  await expect(classes.getByRole("link", { name: first })).toBeVisible();

  await classes
    .getByRole("button", { name: "Remove from class", exact: true })
    .click();
  const withdraw = page.getByRole("dialog", {
    name: `Remove ${name} from ${second}`,
  });
  await withdraw
    .getByRole("button", { name: "Remove from class", exact: true })
    .click();
  await expect(withdraw).toHaveCount(0);
  await expect(
    page.getByText(`${name} left the class`, { exact: true }),
  ).toBeVisible();
});

test("calendar events keep their details, open from the agenda and move between periods", async ({
  page,
  browserName,
}) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  const title = `Salama school meeting (${browserName} ${crypto.randomUUID().slice(0, 6)})`;
  const details = "Bring your questions for the teaching team.";
  await signIn(page, "admin");
  await page.goto("/event-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Title in English" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type(details);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar\?.*event=[a-f0-9-]+/);
  const event = page.getByRole("dialog", { name: title });
  await expect(event.getByText(details)).toBeVisible();
  await page.reload();
  await expect(event.getByText(details)).toBeVisible();

  const eventUrl = new URL(page.url());
  eventUrl.searchParams.delete("event");
  eventUrl.searchParams.set("view", "agenda");
  await page.goto(eventUrl.toString());
  await untilHydrated(page);
  await expect(page).toHaveURL(/view=agenda/);
  await page.getByRole("link", { name: title }).click();
  await expect(event.getByText(details)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(event).toHaveCount(0);

  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page).not.toHaveURL(/view=agenda/);
  const monthLabel = page.locator("h2[aria-live=polite]");
  const shown = await monthLabel.innerText();
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(monthLabel).not.toHaveText(shown);
  const today = page
    .locator("#main")
    .getByRole("link", { name: "Today", exact: true });
  await today.filter({ visible: true }).click();
  await expect(today).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("parents can inspect events without management controls", async ({
  page,
}) => {
  await signIn(page, "parent");
  await page.goto("/calendar?month=2026-10&view=agenda");
  await untilHydrated(page);
  await expect(page.getByRole("link", { name: "New event" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New event" })).toHaveCount(0);
  await page.getByRole("link", { name: "Parents' evening" }).click();
  const event = page.getByRole("dialog", { name: "Parents' evening" });
  await expect(
    event.getByText("Meet each of your child's teachers for ten minutes."),
  ).toBeVisible();
  await expect(event.getByRole("button", { name: "Edit" })).toHaveCount(0);
});

test("shared tables search, sort and toggle columns without losing URL state", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto("/students");
  await untilHydrated(page);
  await page.getByRole("button", { name: "Name", exact: true }).click();
  await expect(page).toHaveURL(/dir=desc/);
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Reference", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("columnheader", { name: "Reference", exact: true }),
  ).toHaveCount(0);
  const search = page.getByRole("searchbox");
  await search.fill("Yasmin");
  await expect(page).toHaveURL(/q=Yasmin/);
  const yasmin = page
    .getByRole("table")
    .getByRole("link", { name: "Yasmin Sabry", exact: true });
  await expect(yasmin).toBeVisible();
  await page.reload();
  await expect(search).toHaveValue("Yasmin");
  await expect(yasmin).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page).not.toHaveURL(/q=Yasmin/);
  await expect(search).toHaveValue("");
  await expect(page).toHaveURL(/dir=desc/);
});

test("the staff directory hides a column", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/staff");
  await untilHydrated(page);
  await expect(
    page.getByRole("columnheader", { name: "Email", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Email", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("columnheader", { name: "Email", exact: true }),
  ).toHaveCount(0);
});

test("the student index opens records, exports a selection and filters on a phone", async ({
  page,
}) => {
  await signIn(page, "admin");
  // Other specs add students, who may fill the first page before her.
  await page.goto("/students?q=Sabry");
  await untilHydrated(page);
  await page
    .getByRole("table")
    .getByRole("link", { name: "Yasmin Sabry", exact: true })
    .click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);

  await page.goBack();
  await untilHydrated(page);
  const selectAll = page.getByRole("checkbox", {
    name: "Select all rows on this page",
    exact: true,
  });
  await page
    .getByRole("checkbox", { name: "Select Yasmin Sabry", exact: true })
    .click();
  await expect(page).toHaveURL(/\/students/);
  await expect(
    page.getByText("1 selected", { exact: true }).last(),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("group", { name: "Actions for the selected rows" })
    .getByRole("button", { name: "More actions" })
    .click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("Students.csv");
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(selectAll).toBeFocused();
  await expect(selectAll).not.toBeChecked();
  await expect(page.getByRole("searchbox")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("searchbox").fill("Yasmin");
  await expect(page).toHaveURL(/q=Yasmin/);
  // The year says what the list shows, so it stays in the row on a phone;
  // the filters fold into the sheet, whose Reset clears both.
  await page.getByRole("button", { name: /^School year/ }).click();
  await page.getByRole("menuitemradio", { checked: false }).first().click();
  await expect(page).toHaveURL(/year=[a-f0-9-]+/);
  const filters = page.getByRole("dialog", { name: "Filters" });
  await openWith(page.getByRole("button", { name: /^Filters/ }), filters);
  await filters.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page).not.toHaveURL(/q=Yasmin/);
  await expect(page).not.toHaveURL(/year=[a-f0-9-]+/);
  await filters.getByRole("button", { name: "Done", exact: true }).click();
  await expect(filters).toHaveCount(0);
});

test("teachers assign coursework from the browser once it is complete", async ({
  page,
}) => {
  const title = `Salama browser coursework ${crypto.randomUUID().slice(0, 8)}`;
  await signIn(page, "teacher");
  await page.goto("/assignment-editor");
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page.getByRole("option").first().click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Add instructions before assigning.",
  );
  await expect(page).not.toHaveURL(/\/assignments\/[a-f0-9-]+/);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Write a short explanation of what you learned.");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.locator("#work-due").fill(`${tomorrow}T23:00`);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toBeVisible();
  await page.goto("/assignments");
  await untilHydrated(page);
  await page.getByRole("searchbox").fill(title);
  await expect(
    page.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
});

test("a new message explains what is missing and opens the sent conversation", async ({
  page,
}) => {
  const words = `Salama has a question about the reading ${crypto.randomUUID().slice(0, 6)}`;
  await signIn(page, "parent");
  await page.goto("/family/messages");
  await untilHydrated(page);
  await page.getByRole("button", { name: "New message" }).click();
  const sheet = page.getByRole("dialog", { name: "New message" });
  const person = sheet.getByRole("combobox", { name: /^Person/ });
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(person).toBeFocused();
  await expect(person).toHaveAccessibleDescription("Choose who to write to.");
  await expect(sheet.getByText("Write the message.")).toBeVisible();
  await person.click();
  await page.getByRole("option").first().click();
  await sheet.locator("[contenteditable=true]").click();
  await page.keyboard.type(words);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+b");
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(/thread=/);
  // A new message to someone already written to joins that conversation,
  // which other runs have written to as well.
  const bold = page
    .getByRole("list", { name: "Messages" })
    .locator("strong")
    .filter({ hasText: words });
  await expect(bold).toHaveText(words);
  await page.reload();
  await expect(bold).toHaveText(words);
});

test("a reply being written survives a reload and is sent once", async ({
  page,
}) => {
  const parent = await apiAs("parent");
  const { rows } = await parent.messages.recipients({ q: "" });
  const teacher = rows.find((row) => row.kind !== "student");
  if (!teacher) throw new Error("no one for the parent to write to");
  const { threadId } = await parent.messages.start({
    kind: "direct",
    recipientIds: [teacher.userId],
    content: plainContent("Salama has a question."),
  });
  const words = `Salama will finish this later ${crypto.randomUUID().slice(0, 6)}`;
  await signIn(page, "parent");
  await page.goto(`/family/messages?thread=${threadId}`);
  await untilHydrated(page);
  const reply = page.locator("form [contenteditable=true]").last();
  // The draft is kept a moment after the last key; the reload waits for it.
  const kept = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes(words) &&
      response.ok(),
  );
  await reply.click();
  await page.keyboard.type(words);
  await kept;
  await page.reload();
  await expect(reply).toHaveText(words);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const messages = page.getByRole("list", { name: "Messages" });
  await expect(messages.getByText(words, { exact: true })).toHaveCount(1);
  await expect(reply).toHaveText("");
  await page.reload();
  await expect(messages.getByText(words, { exact: true })).toHaveCount(1);
  await expect(reply).toHaveText("");
});
