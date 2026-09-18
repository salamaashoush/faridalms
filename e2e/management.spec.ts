import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

async function login(page: Page, email = "admin@example.com") {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("northwind1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("main#main")).toBeVisible();
}
test("class forms explain invalid fields, recover on correction and protect unsaved work", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/class-editor");
  const name = page.getByLabel("Class name", { exact: true });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription("This field is required");
  await name.fill("Salama class");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Grade", { exact: true }).fill("P1");
  await page
    .getByRole("button", { name: "Assign subject", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const subject = page.getByRole("combobox", { name: "Subject", exact: true });
  await expect(subject).toHaveAccessibleDescription(
    "Choose an option from the list.",
  );
  await subject.click();
  await page.getByRole("option", { name: "Mathematics", exact: true }).click();
  await expect(subject).not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Leave without saving?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(name).toHaveValue("Salama class");
});

test("administrators create accounts and students through the shared editors", async ({
  page,
}, testInfo) => {
  await login(page);
  const unique = crypto.randomUUID().slice(0, 8);
  await page.goto("/admin/staff");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Name", { exact: true })
    .fill(`Salama Ashoush ${unique}`);
  await dialog
    .getByLabel("Email", { exact: true })
    .fill(`salama-${unique}@example.com`);
  await dialog
    .getByLabel("Password (at least 12 characters)", { exact: true })
    .fill("school-account-2026");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search records…" }).fill(unique);
  await expect(
    page.getByRole("cell", {
      name: `salama-${unique}@example.com`,
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("cell", {
      name: `salama-${unique}@example.com`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Edit Salama Ashoush ${unique}`, exact: true })
    .click();
  await dialog.getByLabel("Account can sign in").uncheck();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Inactive", exact: true }),
  ).toBeVisible();
  await page.goto("/admin/students");
  await page.getByRole("button", { name: "Add student", exact: true }).click();
  await expect(page).toHaveURL(/\/student-editor/);
  const editor = page.locator("main#main");
  await editor.getByLabel("First name", { exact: true }).fill("Salama");
  await editor
    .getByLabel("Last name", { exact: true })
    .fill(`Ashoush ${unique}`);
  await editor.getByLabel("Reference", { exact: true }).fill(`TEST-${unique}`);
  await editor.getByRole("combobox", { name: "Class", exact: true }).click();
  await page.getByRole("option", { name: "P1-B", exact: true }).click();
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/admin\/students/);
  await page
    .getByRole("searchbox", { name: "Search records…" })
    .fill(`TEST-${unique}`);
  await expect(
    page.getByRole("cell", { name: `TEST-${unique}`, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("student-management.png"),
    fullPage: true,
  });
});
test("calendar events persist, open details and support week and agenda views", async ({
  page,
}, testInfo) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await login(page);
  await page.goto("/admin/calendar");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  const title = `Salama school meeting ${crypto.randomUUID().slice(0, 8)}`;
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Event title").fill(title);
  await dialog
    .getByRole("textbox", { name: "Details and instructions", exact: true })
    .click();
  await page.keyboard.type("Bring your questions for the teaching team.");
  await dialog.getByRole("button", { name: "Save event" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page.getByText(title, { exact: true }).last().click();
  await expect(
    dialog.getByText("Bring your questions for the teaching team."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Edit event", exact: true }).click();
  await dialog.getByLabel("Event title").fill(`${title} updated`);
  await dialog.getByRole("button", { name: "Save event" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText(`${title} updated`, { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
  await page.getByRole("button", { name: "Next period" }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("interactive-calendar.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("parents can inspect events without management controls", async ({
  page,
}) => {
  await login(page, "parent@example.com");
  await page.goto("/family/calendar?month=2026-10");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create event", exact: true }),
  ).toHaveCount(0);
  await page.getByText("October 6 holiday", { exact: true }).last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit event", exact: true }),
  ).toHaveCount(0);
});

test("shared tables search, sort and toggle columns without losing URL state", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/students");
  await page.getByRole("button", { name: "Name", exact: true }).click();
  await expect(page).toHaveURL(/dir=desc/);
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Reference", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("columnheader", { name: "Reference", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search records…" }).fill("Omar");
  await expect(page).toHaveURL(/q=Omar/);
  await expect(
    page.getByRole("cell", { name: "Omar Ashoush", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("searchbox", { name: "Search records…" }),
  ).toHaveValue("Omar");
  await expect(
    page.getByRole("cell", { name: "Omar Ashoush", exact: true }),
  ).toBeVisible();
});

test("teachers publish coursework from the browser", async ({
  page,
  request,
}) => {
  const session = await request.post("http://127.0.0.1:3001/v1/auth/signIn", {
    data: {
      school: "northwind",
      email: "teacher@example.com",
      password: "northwind1234",
    },
  });
  const { token } = (await session.json()) as { token: string };
  const overview = await request.post(
    "http://127.0.0.1:3001/v1/getTeachingOverview",
    { headers: { authorization: `Bearer ${token}` } },
  );
  const { today } = (await overview.json()) as { today: string };
  await login(page, "teacher@example.com");
  await page.goto("/teach/assignments");
  await page
    .getByRole("link", { name: "Design an assignment", exact: true })
    .click();
  const title = `Salama browser coursework ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Assignment title", { exact: true }).fill(title);
  await page
    .getByRole("textbox", { name: "Instructions", exact: true })
    .click();
  await page.keyboard.type("Write a short explanation of what you learned.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByLabel("Due", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Due", { exact: true }).fill(`${today}T23:00`);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.goto("/teach/assignments");
  await page.getByRole("searchbox", { name: "Search records…" }).fill(title);
  await expect(
    page.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
});

test("families navigate shared student and class records with persistent tabs", async ({
  page,
}) => {
  await login(page, "parent@example.com");
  await page.goto("/family/children");
  await page
    .getByRole("link", { name: "Ali Ashoush PreKG-A", exact: true })
    .click();
  await expect(page).toHaveURL(/\/students\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { name: "Enrollment history", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ali Ashoush", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Medical information", exact: true })
    .click();
  await expect(page).toHaveURL(/tab=medical/);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Medical information", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "PreKG-A", exact: true }).click();
  await expect(page).toHaveURL(/\/classes\/[a-f0-9-]+/);
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Ali Ashoush", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Edit class", exact: true }),
  ).toHaveCount(0);
});

test("messages use a full-page composer, protect drafts and open the sent conversation", async ({
  page,
}, testInfo) => {
  await login(page, "parent@example.com");
  await page.goto("/family/messages?compose=true");
  await expect(
    page.getByRole("heading", { name: "New message", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("#compose-recipient")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Salama learning questions");
  await page
    .getByRole("button", { name: "Back to messages", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(
    page.getByRole("textbox", { name: "Subject", exact: true }),
  ).toHaveValue("Salama learning questions");
  await page.locator("#compose-recipient").click();
  await page.getByRole("option").first().click();
  await page.locator("#compose-body").click();
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Markdown", exact: true })
    .fill(
      "## Learning together\n\n**Salama** has a question about the reading.",
    );
  await page
    .getByRole("button", { name: "Replace from Markdown", exact: true })
    .click();
  await expect(
    page
      .locator("#compose-body")
      .getByRole("heading", { name: "Learning together" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("message-composer.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(/folder=sent/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("article strong")).toHaveText("Salama");
  await page.reload();
  await expect(page.locator("article strong")).toHaveText("Salama");
});

test("recipient search pages past fifty matching people without losing selections", async ({
  page,
  request,
}) => {
  const fixture = JSON.parse(
    execFileSync("bun", ["e2e/fixtures/recipients.ts"], { encoding: "utf8" }),
  ) as { name: string; ids: string[] };
  const auth = await request.post("http://127.0.0.1:3001/v1/auth/signIn", {
    data: {
      school: "northwind",
      email: "parent@example.com",
      password: "northwind1234",
    },
  });
  expect(auth.status()).toBe(200);
  const { token } = (await auth.json()) as { token: string };
  const headers = { authorization: `Bearer ${token}` };
  const firstResponse = await request.post(
    "http://127.0.0.1:3001/v1/getRecipients",
    { headers, data: { category: "teachers", q: fixture.name } },
  );
  expect(firstResponse.status()).toBe(200);
  const first = (await firstResponse.json()) as {
    rows: { id: string }[];
    nextCursor: { name: string; id: string };
  };
  expect(first.rows).toHaveLength(50);
  expect(first.nextCursor).toBeTruthy();
  const secondResponse = await request.post(
    "http://127.0.0.1:3001/v1/getRecipients",
    {
      headers,
      data: { category: "teachers", q: fixture.name, cursor: first.nextCursor },
    },
  );
  expect(secondResponse.status()).toBe(200);
  const second = (await secondResponse.json()) as {
    rows: { id: string }[];
    nextCursor: null;
  };
  expect(second.rows).toHaveLength(5);
  expect(second.nextCursor).toBeNull();
  expect(
    [...first.rows, ...second.rows].map((row) => row.id).toSorted(),
  ).toEqual(fixture.ids.toSorted());
  await login(page, "parent@example.com");
  await page.goto("/family/messages?compose=true");
  await page.locator("#compose-recipient").click();
  await page
    .getByRole("combobox", { name: "Search recipients", exact: true })
    .fill(fixture.name);
  await expect(page.getByRole("option")).toHaveCount(50);
  await page
    .getByRole("button", { name: "More recipients", exact: true })
    .click();
  await expect(page.getByRole("option")).toHaveCount(5);
  const chosen = await page.getByRole("option").first().innerText();
  await page.getByRole("option").first().click();
  await expect(page.locator("#compose-recipient")).toContainText(chosen);
});

test("message drafts survive reload, reopen from the directory and send once", async ({
  page,
}) => {
  await login(page, "parent@example.com");
  await page.goto("/family/messages?compose=true");
  const subject = `Salama draft ${crypto.randomUUID().slice(0, 8)}`;
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill(subject);
  await page.locator("#compose-body").click();
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Markdown", exact: true })
    .fill("## A saved thought\n\n**Salama** will finish this later.");
  await page
    .getByRole("button", { name: "Replace from Markdown", exact: true })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/draft=[a-f0-9-]{36}/);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Subject", exact: true }),
  ).toHaveValue(subject);
  await expect(
    page
      .locator("#compose-body")
      .getByRole("heading", { name: "A saved thought" }),
  ).toBeVisible();
  await expect(page.locator("#compose-body strong")).toHaveText("Salama");
  await page
    .getByRole("button", { name: "Back to messages", exact: true })
    .click();
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(subject) }).click();
  await expect(
    page.getByRole("textbox", { name: "Subject", exact: true }),
  ).toHaveValue(subject);
  await page.locator("#compose-recipient").click();
  await page.getByRole("option").first().click();
  const recipient = await page.locator("#compose-recipient").innerText();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#compose-recipient")).toHaveText(recipient);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(/folder=sent/);
  await expect(page.locator("article strong")).toHaveText("Salama");
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(subject) }),
  ).toHaveCount(0);
});
