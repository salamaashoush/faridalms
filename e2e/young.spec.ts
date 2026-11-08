import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  chooseFromMenu,
  PASSWORD,
  portal,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seed's second teacher teaches Arabic to every grade; the seeded student
// sits in 8A. Each browser builds its own module, so none reads another's.
const TEACHER = "teacher2.northwind@northwind.example.com";

test("a young child plays a lesson one screen at a time, by tapping", async ({
  browser,
  page,
}) => {
  const title = `Counting ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/module-editor");
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Module title" }).fill(title);
  await page.getByRole("combobox", { name: "Classes" }).click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/modules\/[a-f0-9-]+/);

  await page.getByRole("link", { name: "Add lesson" }).click();
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Lesson title" }).fill("Ducks");
  await page.locator("#lesson-body").click();
  await page.keyboard.type("/choice");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Which one swims?");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Duck");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Cat");
  await page
    .locator("[data-question-option]")
    .first()
    .click({ position: { x: 12, y: 14 } });
  await page.locator("[data-question-option]").nth(1).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/count");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Put 3 ducks in the frame.");
  const bar = page.getByRole("toolbar", { name: "Question options" });
  await bar.getByRole("button", { name: "What the child does" }).click();
  await page
    .getByRole("menuitem", { name: "Puts that many in ten frames" })
    .click();
  await page.locator("[data-question-prompt]").last().click();
  await bar.getByRole("button", { name: "How many there are" }).click();
  await page.getByRole("menuitem", { name: "3", exact: true }).click();
  await page.locator("[data-question-prompt]").first().click();
  await bar.getByRole("button", { name: "Hints" }).click();
  await page.getByRole("textbox", { name: "Hint 1" }).fill("It says quack.");
  await page.keyboard.press("Enter");
  await page.getByRole("checkbox", { name: "For young children" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await chooseFromMenu(
    page.getByRole("button", { name: "More actions" }),
    page.getByRole("menuitem", { name: "Open to students" }),
  );
  await expect(page.getByText("Module open to students")).toBeVisible();

  const context = await browser.newContext();
  const child = await context.newPage();
  await signInWith(child, ACCOUNTS.student.email, PASSWORD, "/me");
  await child.goto("/me/modules");
  await untilHydrated(child);
  await child.getByRole("link", { name: title }).click();
  await child.getByRole("button", { name: "Start", exact: true }).click();

  const stage = child.getByRole("dialog", { name: "Ducks" });
  // A young lesson is set in the type made for children learning to read.
  await expect(stage).toHaveCSS("font-family", /Andika/);
  expect(
    await child.evaluate(
      async () => (await document.fonts.load('28px "Andika"', "Duck")).length,
    ),
  ).toBeGreaterThan(0);
  // Taps in a screen's first 400 ms are a finger still down from the last
  // one, and are dropped, so the child waits as a person would.
  const settle = () => child.waitForTimeout(450);
  await stage.getByRole("button", { name: "Start" }).click();
  const next = stage.getByRole("button", { name: "Next" });
  await expect(next).toBeDisabled();
  await settle();
  // Help is the question's hint, kept on screen, and goes once they run out.
  const help = stage.getByRole("button", { name: "Help me" });
  await help.click();
  await expect(stage.locator("output")).toContainText("It says quack.");
  await expect(help).toBeHidden();
  await stage.getByRole("button", { name: "Cat" }).click();
  await expect(stage.locator("output")).toContainText("Not yet");
  await stage.getByRole("button", { name: "Duck" }).click();
  await expect(stage.locator("output")).toContainText(
    "You kept trying and found it!",
  );
  await next.click();
  await settle();
  const putOne = stage.getByRole("button", { name: "Put one in" });
  await putOne.click();
  await putOne.click();
  await putOne.click();
  await stage.getByRole("button", { name: "Check" }).click();
  await expect(stage.locator("output")).toContainText("You made 3!");
  // The last screen hands the work in with a check rather than an arrow.
  await stage.getByRole("button", { name: "I'm done" }).click();
  await expect(stage.getByText("You did it!")).toBeVisible();
  await context.close();
});

test("a Reception teacher judges each child against an early learning goal", async ({
  browser,
  page,
}, testInfo) => {
  const school = "northwind-east";
  // Each browser judges its own goal, so neither reads the other's.
  const goal = testInfo.project.name === "firefox" ? "Writing" : "Speaking";
  await signInWith(
    page,
    `principal.${school}@northwind.example.com`,
    PASSWORD,
    "/today",
    school,
  );
  await page.goto(`${portal(school)}/standards`);
  await untilHydrated(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page
    .getByRole("menuitem", { name: "Add the EYFS early learning goals" })
    .click();
  await expect(
    page.getByRole("heading", { name: "EYFS early learning goals", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("The EYFS statutory framework")).toBeVisible();

  const context = await browser.newContext();
  const teacher = await context.newPage();
  await signInWith(
    teacher,
    `teacher1.${school}@northwind.example.com`,
    PASSWORD,
    "/today",
    school,
  );
  await teacher
    .getByRole("region", { name: "Classes" })
    .getByRole("link")
    .filter({ hasNotText: "All classes" })
    .first()
    .click();
  await untilHydrated(teacher);
  await teacher.getByRole("tab", { name: "Goals" }).click();
  await teacher.getByRole("combobox", { name: /^Goal/ }).click();
  await teacher.getByRole("option", { name: new RegExp(`^${goal}`) }).click();
  const section = teacher.getByRole("region", { name: goal });
  const first = section.getByRole("group", { name: /^Judgement for / }).first();
  await first.getByRole("button", { name: "Expected" }).click();
  await expect(section).toContainText(/1 expected, 0 emerging/);
  await expect(section.getByText(/^Judged/).first()).toBeVisible();

  // The judgement stands when the page is read again.
  await teacher.reload();
  await untilHydrated(teacher);
  await teacher.getByRole("combobox", { name: /^Goal/ }).click();
  await teacher.getByRole("option", { name: new RegExp(`^${goal}`) }).click();
  await expect(first.getByRole("button", { name: "Expected" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await first.getByRole("button", { name: "Not judged" }).click();
  await expect(section).toContainText(/0 expected, 0 emerging/);
  await context.close();
});

test("a Reception teacher records an exemption, shares the goals report and makes the return", async ({
  browser,
  page,
}, testInfo) => {
  const school = "northwind-east";
  // Each browser takes its own goal, so none reads another's.
  const goal =
    { firefox: "Managing Self", webkit: "Building Relationships" }[
      testInfo.project.name
    ] ?? "Self-Regulation";
  await signInWith(
    page,
    `principal.${school}@northwind.example.com`,
    PASSWORD,
    "/today",
    school,
  );
  await page.goto(`${portal(school)}/standards`);
  await untilHydrated(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page
    .getByRole("menuitem", { name: "Add the EYFS early learning goals" })
    .click();
  await expect(
    page.getByRole("heading", { name: "EYFS early learning goals", level: 1 }),
  ).toBeVisible();

  const context = await browser.newContext();
  const teacher = await context.newPage();
  await signInWith(
    teacher,
    `teacher1.${school}@northwind.example.com`,
    PASSWORD,
    "/today",
    school,
  );
  await teacher
    .getByRole("region", { name: "Classes" })
    .getByRole("link")
    .filter({ hasNotText: "All classes" })
    .first()
    .click();
  await untilHydrated(teacher);
  await teacher.getByRole("tab", { name: "Goals" }).click();
  await teacher.getByRole("combobox", { name: /^Goal/ }).click();
  await teacher.getByRole("option", { name: new RegExp(`^${goal}`) }).click();
  const section = teacher.getByRole("region", { name: goal });

  // An exemption sits behind the note, never beside expected and emerging.
  await section
    .getByRole("button", { name: /^Note or exemption for / })
    .first()
    .click();
  const exempt = section
    .getByRole("checkbox", { name: /^Exemption applies: / })
    .first();
  // The box shows the choice once the row takes it, a moment after the
  // click, so it is clicked and then awaited rather than checked at once.
  await exempt.click();
  await expect(exempt).toBeChecked();
  await expect(section).toContainText(/1 exempt/);

  await teacher
    .getByRole("button", { name: "Share the report with families" })
    .click();
  await expect(
    teacher.getByText(/^Families of \d+ of \d+ children see this report/),
  ).toBeVisible();

  await teacher.getByRole("button", { name: "End-of-year return" }).click();
  const sheet = teacher.getByRole("dialog", { name: "EYFS profile return" });
  await sheet
    .getByRole("textbox", { name: "Local authority number" })
    .fill("801");
  await sheet
    .getByRole("textbox", { name: "Establishment number" })
    .fill("2000");
  const download = teacher.waitForEvent("download");
  await sheet.getByRole("button", { name: "Download the return" }).click();
  expect((await download).suggestedFilename()).toBe(
    "8012000_FSP_801LLLL_001.xml",
  );
  await expect(sheet.getByRole("status")).toBeVisible();
  await teacher.keyboard.press("Escape");

  // The family reads the report, in the goals' own words, without the notes.
  const home = await browser.newContext();
  const family = await home.newPage();
  await signInWith(
    family,
    "parent1020@northwind.example.com",
    PASSWORD,
    "/family",
    school,
  );
  await family.goto(`${portal(school)}/family/grades`);
  await untilHydrated(family);
  await expect(
    family.getByRole("heading", {
      name: "Early learning goals",
      level: 2,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    family.getByRole("region", { name: "EYFS early learning goals" }),
  ).toContainText(goal);

  await teacher.getByRole("button", { name: "Stop sharing" }).click();
  await expect(
    teacher.getByRole("button", { name: "Share the report with families" }),
  ).toBeVisible();
  // The note stays open on the row from before.
  await exempt.click();
  await expect(exempt).not.toBeChecked();
  await expect(section).toContainText(/0 expected, 0 emerging/);
  await home.close();
  await context.close();
});

test("a school adds Development Matters to follow younger children", async ({
  page,
}) => {
  await signInWith(
    page,
    "principal.northwind@northwind.example.com",
    PASSWORD,
    "/today",
  );
  await page.goto("/standards");
  await untilHydrated(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Add Development Matters" }).click();
  await expect(
    page.getByRole("heading", { name: "Development Matters", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Development Matters, the DfE's guidance"),
  ).toBeVisible();

  // The school words a statement in Arabic itself; the English stays.
  const statement = "Watch someone’s face as they talk.";
  await page
    .getByRole("searchbox", { name: "Search standards" })
    .fill("Watch someone");
  await page.getByRole("button", { name: `Actions for ${statement}` }).click();
  await page.getByRole("menuitem", { name: "Edit standard" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit standard" });
  await sheet
    .getByRole("textbox", { name: "Statement in Arabic" })
    .fill("ينظر إلى وجه من يتحدّث إليه.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("ينظر إلى وجه من يتحدّث إليه.")).toBeVisible();
  await expect(page.getByText(statement)).toBeVisible();
});
