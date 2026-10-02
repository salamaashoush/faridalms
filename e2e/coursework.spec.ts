import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  PASSWORD,
  signInWith,
  untilHydrated,
} from "./fixtures/sign-in";

// The seed's second teacher teaches Arabic to every grade; the seeded student
// sits in 8A. Each browser sets its own assignment, so none reads another's.
const TEACHER = "teacher2.northwind@northwind.example.com";

test("a teacher assigns work, a student hands it in, and the returned grade reaches the student", async ({
  browser,
  page,
}) => {
  const title = `Letter ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/assignment-editor");
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Write a short letter about your weekend.");
  await page
    .locator("input[type=file][hidden]")
    .first()
    .setInputFiles({
      name: "letter-tips.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Start with Dear, end with your name."),
    });
  await expect(
    page.getByRole("link", { name: /^Download: letter-tips\.txt/ }),
  ).toBeVisible();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.locator("#work-due").fill(`${tomorrow}T14:00`);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(
    page.getByText("Assigned", { exact: true }).first(),
  ).toBeVisible();
  const recordUrl = page.url().split("?")[0] ?? "";

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInWith(
    student,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await student.goto("/me/assignments");
  await untilHydrated(student);
  await student.getByRole("link", { name: title }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await student
    .getByRole("button", { name: /^Open: letter-tips\.txt/ })
    .click();
  await expect(
    student.getByRole("dialog", { name: "letter-tips.txt" }),
  ).toBeVisible();
  await student.getByRole("button", { name: "Close" }).click();
  await student.locator("[contenteditable=true]").first().click();
  await student.keyboard.type("Dear Omar, I visited my grandparents.");
  await student.getByRole("button", { name: "Hand in", exact: true }).click();
  await student
    .getByRole("dialog")
    .getByRole("button", { name: "Hand in", exact: true })
    .click();
  await expect(
    student.getByRole("region", { name: "Handed in" }).getByText("Attempt 1"),
  ).toBeVisible();
  await expect(student.getByText("Undo hand in")).toBeVisible();

  await page.goto(`${recordUrl}?tab=work`);
  await untilHydrated(page);
  // The seeded student is Yasmin Sabry.
  const row = page
    .getByRole("tabpanel")
    .getByRole("row", { name: /Yasmin Sabry/ });
  await expect(row.getByText("Handed in", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Grade", exact: true }).click();
  await expect(page).toHaveURL(/\/teach\/grading/);
  await untilHydrated(page);
  // A passage selected in the work is offered a comment.
  await page.locator("article").evaluate((article, words) => {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(words) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + words.length);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      node.parentElement?.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true }),
      );
      return;
    }
  }, "visited my grandparents");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Comment" })
    .fill("Tell me one thing you did with them.");
  await page.getByRole("button", { name: "Save comment" }).click();
  await expect(
    page.getByRole("button", { name: "Show the passage in the work" }),
  ).toHaveText("visited my grandparents");
  await page.getByRole("button", { name: "Grade", exact: true }).click();
  await page.locator("#grade-score").fill("8");
  await page.locator("#grade-feedback").fill("A warm, well organised letter.");
  await page.getByRole("button", { name: "Return and next" }).click();
  await expect(page).toHaveURL(/tab=work/);
  await expect(
    page
      .getByRole("tabpanel")
      .getByRole("row", { name: /Yasmin Sabry/ })
      .getByText("Returned", { exact: true }),
  ).toBeVisible();

  await student.reload();
  await untilHydrated(student);
  await expect(
    student.getByText("A warm, well organised letter."),
  ).toBeVisible();
  await expect(student.getByText("8 / 10")).toBeVisible();
  const comments = student.getByRole("region", {
    name: "Comments on your work",
  });
  await expect(
    comments.getByText("Tell me one thing you did with them."),
  ).toBeVisible();
  await expect(
    comments.getByRole("button", { name: "Show the passage in the work" }),
  ).toHaveText("visited my grandparents");
  await studentContext.close();
});

test("a teacher's gradebook shows the class's work and term grades", async ({
  page,
}) => {
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/gradebook");
  await untilHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Gradebook" }),
  ).toBeVisible();
  const sheet = page.getByRole("table");
  await expect(
    sheet.getByRole("columnheader", { name: "Chapter 1 review" }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("columnheader", { name: "Term grade" }),
  ).toBeVisible();
});

test("a quiz is answered question by question, marked at hand-in, and its results shown", async ({
  browser,
  page,
}) => {
  const title = `Nouns ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/teach");
  await page.goto("/teach/assignment-editor");
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Answer both questions, then hand the quiz in.");
  await page.locator("#work-format").click();
  await page.getByRole("option", { name: "A quiz, marked for them" }).click();
  // A quiz's questions are blocks written in its brief, after its words.
  await page.getByText("Answer both questions, then hand the quiz in.").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/choice");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Which is a noun?");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Book");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Run");
  await page
    .locator("[data-question-option]")
    .first()
    .click({ position: { x: 12, y: 14 } });
  await expect(page.locator("[data-question-option]").first()).toHaveAttribute(
    "data-correct",
    "true",
  );
  await page.locator("[data-question-option]").nth(1).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/typed");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The capital of Egypt?");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("القاهرة");
  await expect(page.locator("[data-question]")).toHaveCount(2);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInWith(
    student,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await student.goto("/me/assignments");
  await untilHydrated(student);
  await student.getByRole("link", { name: title }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await untilHydrated(student);
  await student.getByRole("radio", { name: "Book" }).click();
  await student.getByRole("button", { name: "Keep answer" }).first().click();
  const typed = student.getByRole("textbox", { name: "Your answer" });
  await typed.fill("القاهره");
  await typed.press("Enter");
  await expect(student.getByText("2 of 2 answered")).toBeVisible();
  await student.getByRole("button", { name: "Hand in quiz" }).click();
  await student
    .getByRole("dialog")
    .getByRole("button", { name: "Hand in quiz" })
    .click();
  await expect(
    student.getByRole("button", { name: /Attempt 1 · 2 of 2/ }),
  ).toBeVisible();
  await expect(
    student.locator("output").getByText("Right", { exact: true }),
  ).toHaveCount(2);
  await studentContext.close();
});
