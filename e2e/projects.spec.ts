import type { Locator, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  chooseFromMenu,
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
  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Open to students" }),
  );
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
  const name = student.getByRole("textbox", { name: "File name" });
  // The one page keeps a page's name.
  await studio.getByRole("button", { name: "More for index.html" }).click();
  await student.getByRole("menuitem", { name: "Rename" }).click();
  await name.fill("notes.js");
  await student.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(
    student.getByText(/^A project needs a page or a program/),
  ).toBeVisible();
  await student.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    studio.getByRole("button", { name: "index.html" }),
  ).toBeVisible();
  await studio.getByRole("button", { name: "New file" }).click();
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

  // The teacher in the room sees each project as it stands, and opens one large.
  await page.goto(`${recordUrl}?tab=live`);
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { name: "Projects being built 1" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open Yasmin Sabry's project" })
    .click();
  const large = page.getByRole("dialog", { name: "Web project" });
  await expect(
    played(large).getByRole("heading", { name: "The red panda" }),
  ).toBeVisible();
  await large.getByRole("button", { name: "Done", exact: true }).click();

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

test("a student shows a project to the class once the teacher agrees, and a classmate builds on it", async ({
  browser,
  page,
}) => {
  const title = `Shared pages ${crypto.randomUUID().slice(0, 6)}`;
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
  await page.getByRole("textbox", { name: "Lesson title" }).fill("Our pages");
  await page.locator("#lesson-body").click();
  await page.keyboard.type("/web project");
  await page.getByRole("option", { name: /Web project/ }).click();
  await page.keyboard.type("Build a page to show the class.");
  const galleryOn = page.getByRole("button", { name: /^Class gallery/ });
  await galleryOn.click();
  await expect(galleryOn).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(recordUrl);
  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Open to students" }),
  );
  await expect(page.getByText("Module open to students")).toBeVisible();

  /** Signs a student in, opens the lesson, builds a page and hands it in. */
  const build = async (email: string, heading: string) => {
    const context = await browser.newContext();
    const student = await context.newPage();
    await signInWith(student, email, PASSWORD, ACCOUNTS.student.home);
    await student.goto("/me/modules");
    await untilHydrated(student);
    await student.getByRole("link", { name: title }).click();
    await student.getByRole("button", { name: "Start", exact: true }).click();
    await expect(
      student.getByRole("heading", { level: 1, name: "Our pages" }),
    ).toBeVisible();
    // The gallery opens only to those who have handed in a project.
    await expect(
      student.getByText(
        "Hand in your project to see what your classmates made.",
      ),
    ).toBeVisible();
    await student.getByRole("button", { name: "Open the project" }).click();
    const studio = student.getByRole("dialog", { name: "Web project" });
    await write(student, studio, page1(heading));
    await expect(studio.getByText("Saved", { exact: true })).toBeVisible();
    await studio.getByRole("button", { name: "Done", exact: true }).click();
    await student
      .getByRole("button", { name: "Hand in to your teacher" })
      .click();
    await expect(
      student.getByText("Sent. Your teacher will mark it."),
    ).toBeVisible();
    return { context, student };
  };

  const first = await build(ACCOUNTS.student.email, "The red panda");
  await first.student
    .getByRole("button", { name: "Show mine to the class" })
    .click();
  await expect(
    first.student.getByText(
      "Your project is waiting for your teacher to show it.",
    ),
  ).toBeVisible();

  // A classmate sees nothing the teacher has not shown.
  const second = await build("student1008@northwind.example.com", "The otter");
  await expect(
    second.student.getByText("No classmate's project is in the gallery yet."),
  ).toBeVisible();

  await page.goto(`${recordUrl}?tab=answers`);
  await untilHydrated(page);
  await expect(page.getByText("Offered to the class gallery")).toBeVisible();
  await page.getByRole("button", { name: "Show to the class" }).click();
  await expect(page.getByText("In the class gallery")).toBeVisible();

  await first.student.reload();
  await untilHydrated(first.student);
  await expect(
    first.student.getByText("Your project is in the class gallery."),
  ).toBeVisible();
  await first.context.close();

  await second.student.reload();
  await untilHydrated(second.student);
  await second.student
    .getByRole("button", { name: "Yasmin Sabry's project" })
    .click();
  const shown = second.student.getByRole("dialog", { name: "Web project" });
  await expect(
    played(shown).getByRole("heading", { name: "The red panda" }),
  ).toBeVisible();
  await shown.getByRole("button", { name: "Build on this project" }).click();
  await second.student
    .getByRole("dialog", { name: "Build on Yasmin Sabry's project?" })
    .getByRole("button", { name: "Build on this project" })
    .click();
  await expect(
    second.student.getByText("You are now building on Yasmin Sabry's project."),
  ).toBeVisible();
  // The classmate's own project is now the one they built on.
  await expect(
    played(second.student).getByRole("heading", { name: "The red panda" }),
  ).toBeVisible();
  await second.student.getByRole("button", { name: "Hand in again" }).click();
  await expect(
    second.student.getByRole("button", { name: "Hand in again" }),
  ).toBeDisabled();
  await second.context.close();

  await page.reload();
  await untilHydrated(page);
  await expect(page.getByText("Built on Yasmin Sabry's project")).toBeVisible();
});

test("a p5.js sketch draws for its student with the library the school serves", async ({
  browser,
  page,
}) => {
  const title = `Sketches ${crypto.randomUUID().slice(0, 6)}`;
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
  await page.getByRole("textbox", { name: "Lesson title" }).fill("Circles");
  await page.locator("#lesson-body").click();
  await page.keyboard.type("/p5");
  await page.getByRole("option", { name: /p5\.js sketch/ }).click();
  await page.keyboard.type("Make the circle follow the mouse.");
  await expect(page.locator("[data-question]")).toHaveAttribute(
    "data-label",
    /starts from your project/,
  );
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(recordUrl);
  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Open to students" }),
  );
  await expect(page.getByText("Module open to students")).toBeVisible();

  const context = await browser.newContext();
  const student = await context.newPage();
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
  // The library made the canvas the sketch asks for, at the size it asks.
  const canvas = played(student).locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("width", /\d+/);
  // A mistake in the sketch is told with its file and line, library or not.
  await student.getByRole("button", { name: "Open the project" }).click();
  const studio = student.getByRole("dialog", { name: "Web project" });
  await studio.getByRole("tab", { name: "sketch.js" }).click();
  await write(
    student,
    studio,
    "function setup() {\n    createCanvas(200, 200);\n    nowhere();\n}\n",
  );
  await expect(studio.getByText(/^sketch\.js, line 3: /)).toBeVisible();
  await context.close();
});

test("a Python project runs across its files in the browser", async ({
  browser,
  page,
}) => {
  // Python is fetched and started in each browser before the first run.
  test.slow();
  const title = `Programs ${crypto.randomUUID().slice(0, 6)}`;
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
  await page.getByRole("textbox", { name: "Lesson title" }).fill("Shapes");
  await page.locator("#lesson-body").click();
  await page.keyboard.type("/python project");
  await page.getByRole("option", { name: /Python project/ }).click();
  await page.keyboard.type("Work out the area of a square.");
  await expect(page.locator("[data-question]")).toHaveAttribute(
    "data-label",
    /^Python project · starts from your project/,
  );
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(recordUrl);
  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Open to students" }),
  );
  await expect(page.getByText("Module open to students")).toBeVisible();

  const context = await browser.newContext();
  const student = await context.newPage();
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
  await student.getByRole("button", { name: "Open the project" }).click();
  const studio = student.getByRole("dialog", { name: "Web project" });
  await expect(studio.getByRole("tab")).toHaveText(["main.py", "shapes.py"]);
  await write(
    student,
    studio,
    'from shapes import area\n\nprint("area", area(3))\n',
  );
  await studio.getByRole("tab", { name: "shapes.py" }).click();
  await write(student, studio, "def area(side):\n    return side * side\n");
  // The main file runs, with the project's other file there to import.
  await studio.getByRole("button", { name: "Run", exact: true }).click();
  await expect(studio.getByText("area 9")).toBeVisible({ timeout: 120_000 });
  // A mistake in the program is told with its line.
  await studio.getByRole("tab", { name: "main.py" }).click();
  await write(student, studio, "print(1)\nprint(nowhere)\n");
  await studio.getByRole("button", { name: "Run", exact: true }).click();
  // The line is said twice: where it is read, and to a screen reader.
  await expect(studio.getByText(/^Line 2: NameError/).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(studio.getByText("Saved", { exact: true })).toBeVisible();
  await studio.getByRole("button", { name: "Done", exact: true }).click();
  await student
    .getByRole("button", { name: "Hand in to your teacher" })
    .click();
  await expect(
    student.getByText("Sent. Your teacher will mark it."),
  ).toBeVisible();
  await context.close();
});
