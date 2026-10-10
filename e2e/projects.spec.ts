import type { Locator, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  PASSWORD,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seed's second teacher teaches Arabic to every grade; the seeded student
// sits in 8A. Each browser builds its own module, so none reads another's.
const TEACHER = "teacher2.northwind@northwind.example.com";

const page1 = (heading: string, more = "") =>
  [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<link rel="stylesheet" href="style.css">',
    "</head>",
    "<body>",
    `<h1>${heading}</h1>`,
    more,
    '<script src="script.js"></script>',
    "</body>",
    "</html>",
    "",
  ].join("\n");

/** Replaces the code of the file the studio shows. */
async function write(page: Page, studio: Locator, code: string) {
  await studio.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(code);
}

/** The student's page as it plays, in its own frame inside the files host's. */
const played = (within: Page | Locator) =>
  within
    .frameLocator('iframe[title="Web page"]')
    .frameLocator('iframe[title="Web page"]');

test("a teacher sets a web project, a student builds it from several files and hands it in, and the teacher runs and marks it", async ({
  browser,
  page,
}) => {
  const title = `Web pages ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/module-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Module title" }).fill(title);
  await page.getByRole("combobox", { name: "Classes" }).click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/modules\/[a-f0-9-]+/);
  const recordUrl = page.url().split("?")[0] ?? "";

  await page.getByRole("link", { name: "Add lesson" }).click();
  await expect(page).toHaveURL(/\/teach\/lesson-editor/);
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Lesson title" }).fill("My page");
  await page.locator("#lesson-body").click();
  await page.keyboard.type("Today you build a page of your own.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/web project");
  await page.getByRole("option", { name: /Web project/ }).click();
  await page.keyboard.type("Build a page about an animal.");
  await expect(page.locator("[data-question]")).toHaveAttribute(
    "data-kind",
    "project",
  );

  // The teacher writes the files every student starts from.
  await page.getByRole("button", { name: "Build the starter project" }).click();
  const starter = page.getByRole("dialog", { name: "Web project" });
  await expect(starter.getByRole("tab")).toHaveText([
    "index.html",
    "style.css",
    "script.js",
  ]);
  await write(page, starter, page1("The otter"));
  await starter.getByRole("tab", { name: "style.css" }).click();
  await write(page, starter, "h1 {\n    color: rgb(0, 128, 128);\n}\n");
  await starter.getByRole("tab", { name: "script.js" }).click();
  await write(
    page,
    starter,
    'document.querySelector("h1").addEventListener("click", () => {\n    missing();\n});\n',
  );
  // The page is made of all three files, and an error names its file.
  const heading = played(starter).getByRole("heading", { name: "The otter" });
  await expect(heading).toHaveCSS("color", "rgb(0, 128, 128)");
  await heading.click();
  await expect(starter.getByText(/^script\.js, line 2: /)).toBeVisible();
  await starter.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("[data-question]")).toHaveAttribute(
    "data-label",
    /starts from your project/,
  );
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(recordUrl);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Open to students" }).click();
  await expect(page.getByText("Module open to students")).toBeVisible();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInWith(
    student,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await student.goto("/me/modules");
  await untilHydrated(student);
  await student.getByRole("link", { name: title }).click();
  await student.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: "My page" }),
  ).toBeVisible();
  await expect(
    played(student).getByRole("heading", { name: "The otter" }),
  ).toBeVisible();

  const steps = await student.evaluate(() => history.length);
  await student.getByRole("button", { name: "Open the project" }).click();
  const studio = student.getByRole("dialog", { name: "Web project" });
  await write(
    student,
    studio,
    page1("The red panda", '<a href="about.html">About me</a>'),
  );
  await expect(
    played(studio).getByRole("heading", { name: "The red panda" }),
  ).toBeVisible();
  await studio.getByRole("button", { name: "New file" }).click();
  const name = student.getByRole("textbox", { name: "File name" });
  await name.fill("about me.html");
  await student.getByRole("button", { name: "Add file" }).click();
  await expect(
    student.getByText(/^Use only letters and numbers/),
  ).toBeVisible();
  await name.fill("about.html");
  await student.getByRole("button", { name: "Add file" }).click();
  await expect(studio.getByRole("tab", { selected: true })).toHaveText(
    "about.html",
  );
  await write(student, studio, "<h1>About me</h1>\n");
  // A link to another of the project's pages opens it.
  await studio.getByRole("button", { name: "index.html" }).click();
  await played(studio).getByRole("link", { name: "About me" }).click();
  await expect(
    played(studio).getByRole("heading", { name: "About me" }),
  ).toBeVisible();
  await expect(studio.getByText("Saved", { exact: true })).toBeVisible();
  await studio.getByRole("button", { name: "Done", exact: true }).click();
  // Drawing the page again and again leaves the browser's Back alone.
  expect(await student.evaluate(() => history.length)).toBe(steps);

  // The project is kept as it is built, and sent only when handed in.
  await student.reload();
  await untilHydrated(student);
  await expect(
    played(student).getByRole("heading", { name: "The red panda" }),
  ).toBeVisible();
  await expect(
    student.getByRole("button", { name: "Keep building" }),
  ).toBeVisible();
  await student
    .getByRole("button", { name: "Hand in to your teacher" })
    .click();
  await expect(
    student.getByText("Sent. Your teacher will mark it."),
  ).toBeVisible();
  await expect(
    student.getByRole("button", { name: "Hand in again" }),
  ).toBeDisabled();
  await studentContext.close();

  await page.goto(`${recordUrl}?tab=answers`);
  await untilHydrated(page);
  await expect(
    played(page).getByRole("heading", { name: "The red panda" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "See the code" }).click();
  const reading = page.getByRole("dialog", { name: "Web project" });
  await expect(reading.getByRole("tab")).toHaveText([
    "index.html",
    "style.css",
    "script.js",
    "about.html",
  ]);
  await expect(reading.getByText("Changes here aren't kept")).toBeVisible();
  await reading.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Points out of 2" }).fill("2");
  await page.getByRole("button", { name: "Save mark" }).click();
  await expect(page.getByText("Marked: 2 of 2 points")).toBeVisible();
});
