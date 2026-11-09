import { plainContent } from "@faridalms/domain/content-conversion";
import { expect, test } from "@playwright/test";

import { API_ORIGIN, signedInApi } from "./fixtures/api";
import {
  ACCOUNTS,
  openWith,
  PASSWORD,
  portal,
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
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/assignment-editor");
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
  await expect(page).toHaveURL(/\/grading/);
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
  await expect(page.getByRole("textbox", { name: "Comment" })).toBeHidden();
  await page.getByRole("button", { name: "Grade", exact: true }).click();
  // The grade sheet lists the comments with the passages they mark.
  await expect(
    page.getByRole("button", { name: /^visited my grandparents: show/ }),
  ).toHaveText("visited my grandparents");
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
    comments.getByRole("button", { name: /^visited my grandparents: show/ }),
  ).toHaveText("visited my grandparents");
  // The passage is a mark in the work that points at its comment.
  await expect(
    student.locator("mark[aria-details]", {
      hasText: "visited my grandparents",
    }),
  ).toHaveCount(1);
  // The student answers the comment where it stands.
  await comments
    .getByRole("button", { name: /^visited my grandparents: show/ })
    .click();
  await student.getByRole("button", { name: "I don't understand" }).click();
  await expect(
    student.getByRole("button", { name: "I don't understand" }),
  ).toHaveAttribute("aria-pressed", "true");
  await student
    .getByRole("textbox", { name: "Reply" })
    .fill("Should I say what we cooked?");
  await student.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    comments.getByText("Should I say what we cooked?"),
  ).toBeVisible();
  await studentContext.close();
});

test("a teacher writes a rubric, grades by its levels, and the student reads what the level means", async ({
  browser,
  page,
}) => {
  const title = `Essay ${crypto.randomUUID().slice(0, 6)}`;
  const meaning = "Backs the point with one fitting example.";
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/assignment-editor");
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Argue for a longer break.");
  await page.getByRole("button", { name: "Write a rubric" }).click();
  const sheet = page.getByRole("dialog", { name: "Rubric" });
  await sheet.getByRole("button", { name: "Use this rubric" }).click();
  // Nothing is used while a criterion has no name.
  await expect(
    sheet.getByText("Name what this criterion judges."),
  ).toBeVisible();
  await sheet
    .getByRole("textbox", { name: "Criterion 1" })
    .fill("Use of evidence");
  await sheet
    .getByRole("textbox", { name: "What work at Meets looks like" })
    .fill(meaning);
  await sheet.getByRole("button", { name: "Use this rubric" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("#work-rubric")).toHaveText(/Attached rubric/);
  await expect(page.locator("#work-points")).toHaveValue("4");
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
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
  await student.locator("[contenteditable=true]").first().click();
  await student.keyboard.type("A longer break lets us eat and rest.");
  await student.getByRole("button", { name: "Hand in", exact: true }).click();
  await student
    .getByRole("dialog")
    .getByRole("button", { name: "Hand in", exact: true })
    .click();
  await expect(student.getByText("Undo hand in")).toBeVisible();

  await page.goto(`${recordUrl}?tab=work`);
  await untilHydrated(page);
  await page
    .getByRole("tabpanel")
    .getByRole("row", { name: /Yasmin Sabry/ })
    .getByRole("button", { name: "Grade", exact: true })
    .click();
  await expect(page).toHaveURL(/\/grading/);
  await untilHydrated(page);
  const levels = page.getByRole("radiogroup", { name: "Use of evidence" });
  await openWith(
    page.getByRole("button", { name: "Grade", exact: true }),
    levels,
  );
  const meets = levels.getByRole("radio", { name: "Meets 3 points" });
  // The grader reads what the level means as they choose it.
  await expect(meets).toHaveAccessibleDescription(meaning);
  await meets.click();
  await expect(meets).toBeChecked();
  await expect(page.getByText("3 of 4 points")).toBeVisible();
  await expect(page.locator("#grade-score")).toHaveValue("3");
  await page.getByRole("button", { name: "Return and next" }).click();
  await expect(page).toHaveURL(/tab=work/);

  await student.reload();
  await untilHydrated(student);
  // The student reads the whole rubric with the level reached marked.
  const awarded = student
    .getByRole("list", { name: "Levels of Use of evidence" })
    .getByRole("listitem")
    .filter({ hasText: "Awarded" });
  await expect(awarded).toHaveCount(1);
  await expect(awarded).toContainText("Meets");
  await expect(awarded).toContainText("3 points");
  await expect(awarded).toContainText(meaning);
  await expect(student.getByText("3 of 4 points")).toBeVisible();
  await studentContext.close();
});

test("a teacher's gradebook shows the class's work and term grades", async ({
  page,
}) => {
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/gradebook");
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
  const grades = sheet.getByRole("textbox", { name: /^Term grade for / });
  await grades.first().fill("120");
  await page.getByRole("button", { name: "Save grades" }).click();
  await expect(
    page
      .getByRole("alert")
      .getByRole("link", { name: /term grade is more than 100/ }),
  ).toBeVisible();
  await expect(grades.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(grades.nth(1)).toBeFocused();
});

test("a quiz is answered question by question, marked at hand-in, and its results shown", async ({
  browser,
  page,
}) => {
  const title = `Nouns ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/assignment-editor");
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

test("a teacher marks one quiz question for several students at once", async ({
  browser,
  page,
}) => {
  const title = `Characters ${crypto.randomUUID().slice(0, 6)}`;
  const brief = "Answer in a sentence, then hand the quiz in.";
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/assignment-editor");
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type(brief);
  await page.locator("#work-format").click();
  await page.getByRole("option", { name: "A quiz, marked for them" }).click();
  await page.getByText(brief).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/written");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Who is your favourite character, and why?");
  await expect(page.locator("[data-question]")).toHaveCount(1);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  const address = new URL(page.url()).pathname;

  // The seed's student and their classmate in 8A each hand in an answer.
  for (const email of [
    ACCOUNTS.student.email,
    "student1008@northwind.example.com",
  ]) {
    const context = await browser.newContext();
    const student = await context.newPage();
    await signInWith(student, email, PASSWORD, ACCOUNTS.student.home);
    await student.goto(address);
    await untilHydrated(student);
    await student
      .getByRole("textbox", { name: "Your answer" })
      .fill("Charlotte, because she is kind to Wilbur.");
    await student.getByRole("button", { name: "Keep answer" }).click();
    await student.getByRole("button", { name: "Hand in quiz" }).click();
    await student
      .getByRole("dialog")
      .getByRole("button", { name: "Hand in quiz" })
      .click();
    await expect(
      student.getByRole("button", { name: /Attempt 1/ }),
    ).toBeVisible();
    await context.close();
  }

  await page.goto(`${address}?tab=answers`);
  await untilHydrated(page);
  await expect(page.getByText(/2 to mark/)).toBeVisible();
  await page.getByRole("button", { name: "Choose all waiting" }).click();
  const chosen = page.getByRole("group", { name: "2 chosen" });
  await chosen.getByRole("spinbutton", { name: /Points out of/ }).fill("1");
  await chosen
    .getByRole("textbox", { name: "Feedback" })
    .fill("Say which moment shows her kindness.");
  await chosen.getByRole("button", { name: "Mark 2 chosen" }).click();
  await expect(page.getByText(/^Marked: 1 of \d+ points?$/)).toHaveCount(2);
  await expect(page.getByText(/to mark/)).toHaveCount(0);
});

test("a discussion opens classmates' posts once a student answers, and counts their replies", async ({
  browser,
  page,
}) => {
  const title = `Nile ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/assignment-editor");
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Was the Nile flood more a friend or a danger?");
  await page.locator("#work-format").click();
  await page.getByRole("option", { name: "A class discussion" }).click();
  await page.locator("#discussion-replies").click();
  await page.getByRole("option", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  const address = new URL(page.url()).pathname;

  const classmateContext = await browser.newContext();
  const classmate = await classmateContext.newPage();
  await signInWith(
    classmate,
    "student1008@northwind.example.com",
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await classmate.goto(address);
  await untilHydrated(classmate);
  await classmate.getByRole("textbox", { name: "Your answer" }).click();
  await classmate.keyboard.type("A danger: high floods washed villages away.");
  await classmate.getByRole("button", { name: "Post", exact: true }).click();
  await expect(classmate.getByText("Answer posted")).toBeVisible();
  await classmateContext.close();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInWith(
    student,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await student.goto(address);
  await untilHydrated(student);
  await expect(student.getByText(/Post your answer first/)).toBeVisible();
  await expect(student.getByText("washed villages away")).toHaveCount(0);
  await student.getByRole("textbox", { name: "Your answer" }).click();
  await student.keyboard.type("A friend: the silt fed the farms.");
  await student.getByRole("button", { name: "Post", exact: true }).click();
  await expect(student.getByText(/washed villages away/)).toBeVisible();
  await student.getByRole("button", { name: /^Reply to (?!Yasmin)/ }).click();
  await student.keyboard.type("But the same floods made the soil rich.");
  await student.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    student.getByText("Replies to classmates: 1 of 1"),
  ).toBeVisible();

  await page.goto(`${address}?tab=discussion`);
  await untilHydrated(page);
  await page.getByRole("button", { name: "Post actions" }).first().click();
  await page.getByRole("menuitem", { name: "Hide from the class" }).click();
  await expect(page.getByText("Post hidden")).toBeVisible();
  await student.reload();
  await untilHydrated(student);
  await expect(student.getByText(/washed villages away/)).toHaveCount(0);
  await expect(student.getByText("Hidden by the teacher.")).toBeVisible();
  await studentContext.close();

  await page.goto(`${address}?tab=work`);
  await untilHydrated(page);
  await page
    .getByRole("tabpanel")
    .getByRole("row", { name: /Yasmin Sabry/ })
    .getByRole("button", { name: "Grade", exact: true })
    .click();
  await expect(page).toHaveURL(/\/grading/);
  await expect(page.getByText(/^Replying to /)).toBeVisible();
  await expect(
    page.getByText("But the same floods made the soil rich."),
  ).toBeVisible();
});

test("a module holds its class's discussion, and a post's likes are counted and named to the teacher", async ({
  browser,
  page,
}) => {
  const title = `Oases ${crypto.randomUUID().slice(0, 6)}`;
  const { api } = await signedInApi(TEACHER);
  const { classes } = await api.coursework.options();
  const arabic = classes.find((row) => row.titleEn === "8A Arabic");
  if (!arabic) throw new Error("the seed has no 8A Arabic");
  const module = await api.learning.saveModule({
    id: "",
    expectedVersion: 0,
    title: `Deserts ${title}`,
    summary: "",
    classIds: [arabic.id],
    prerequisiteId: "",
    sequential: false,
  });
  // Students reach a module once it is published, which takes a lesson.
  await api.learning.saveLesson({
    id: "",
    moduleId: module.id,
    expectedVersion: 0,
    title: "Springs",
    completion: "view",
    passScore: null,
    young: false,
    content: plainContent("Water rises where the rock gives way."),
    publish: false,
  });
  await api.learning.publishModule({
    id: module.id,
    expectedVersion: module.version,
  });

  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto(`/modules/${module.id}?tab=discussions`);
  await untilHydrated(page);
  await page.getByRole("link", { name: "New discussion" }).first().click();
  await expect(page).toHaveURL(/\/assignment-editor\?.*moduleId=/);
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Which oasis would you cross the desert for?");
  await expect(page.locator("#discussion-module")).toContainText(
    `Deserts ${title}`,
  );
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  const address = new URL(page.url()).pathname;
  await page.goto(`${address}?tab=discussion`);
  await untilHydrated(page);
  await page.getByRole("button", { name: "New post" }).click();
  await page.getByRole("textbox", { name: "New post" }).click();
  await page.keyboard.type("Think of water and shade.");
  await page.getByRole("button", { name: "Post", exact: true }).click();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInWith(
    student,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await student.goto(`/modules/${module.id}`);
  await untilHydrated(student);
  await student
    .getByRole("region", { name: "Discussions" })
    .getByRole("link", { name: title })
    .click();
  await expect(student).toHaveURL(new RegExp(address));
  await untilHydrated(student);
  await student.getByRole("textbox", { name: "Your answer" }).click();
  await student.keyboard.type("Siwa, for its springs.");
  await student.getByRole("button", { name: "Post", exact: true }).click();
  const like = student.getByRole("button", { name: /^Like the post by / });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(like).toContainText("1 like");
  await studentContext.close();

  await page.goto(`${address}?tab=discussion`);
  await untilHydrated(page);
  await expect(page.getByText(/^Liked by Yasmin/)).toBeVisible();
});

test("a module's discussion is set once and taken by every class of the module", async ({
  page,
}) => {
  const title = `Wadis ${crypto.randomUUID().slice(0, 6)}`;
  const { api } = await signedInApi(TEACHER);
  const { classes } = await api.coursework.options();
  const arabic = classes.find((row) => row.titleEn === "8A Arabic");
  const other = classes.find(
    (row) => row.id !== arabic?.id && row.classType === "scheduled",
  );
  if (!arabic || !other) throw new Error("the teacher needs two classes");
  const module = await api.learning.saveModule({
    id: "",
    expectedVersion: 0,
    title: `Valleys ${title}`,
    summary: "",
    classIds: [arabic.id, other.id],
    prerequisiteId: "",
    sequential: false,
  });

  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto(`/modules/${module.id}?tab=discussions`);
  await untilHydrated(page);
  await page.getByRole("link", { name: "New discussion" }).first().click();
  await expect(page).toHaveURL(/\/assignment-editor\?.*moduleId=/);
  await untilHydrated(page);
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Where does the water of a wadi go?");
  // Who takes part is who the module reaches in each class.
  await expect(
    page.getByText("One discussion across every class the module is set for."),
  ).toBeVisible();
  await expect(page.locator("#work-audience")).toHaveCount(0);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);

  await page.goto(`/modules/${module.id}?tab=discussions`);
  await untilHydrated(page);
  await expect(
    page
      .getByRole("region", { name: "Discussions" })
      .getByRole("link", { name: title }),
  ).toHaveCount(2);
});

test("classmates review each other's work unnamed, and read the reviews once the teacher releases them", async ({
  browser,
  page,
}) => {
  const title = `Letters ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/assignment-editor");
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Write the Nile a letter.");
  await page
    .getByRole("checkbox", { name: "Classmates review each other's work" })
    .click();
  await page.locator("#peer-reviews").click();
  await page.getByRole("option", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  const address = new URL(page.url()).pathname;

  const handIn = async (email: string, words: string) => {
    const context = await browser.newContext();
    const student = await context.newPage();
    await signInWith(student, email, PASSWORD, ACCOUNTS.student.home);
    await student.goto(address);
    await untilHydrated(student);
    await student.locator("[contenteditable=true]").first().click();
    await student.keyboard.type(words);
    await student.getByRole("button", { name: "Hand in", exact: true }).click();
    await student
      .getByRole("dialog")
      .getByRole("button", { name: "Hand in", exact: true })
      .click();
    await expect(
      student.getByRole("region", { name: "Handed in" }).getByText("Attempt 1"),
    ).toBeVisible();
    return { context, student };
  };
  const classmate = await handIn(
    "student1008@northwind.example.com",
    "Dear Nile, thank you for the fish.",
  );
  const author = await handIn(
    ACCOUNTS.student.email,
    "Dear Nile, you carry the boats to Cairo.",
  );

  await page.goto(`${address}?tab=reviews`);
  await untilHydrated(page);
  await page.getByRole("button", { name: "Hand out reviews" }).click();
  await expect(page.getByText("0 of 2 reviews sent")).toBeVisible();

  // The classmate reviews the work handed them, its author unnamed.
  const reviewer = classmate.student;
  await reviewer.reload();
  await untilHydrated(reviewer);
  const reviewing = reviewer.getByRole("region", { name: "Peer review" });
  await expect(reviewing.getByText("Work 1")).toBeVisible();
  await expect(reviewing.getByText("you carry the boats")).toBeVisible();
  await expect(reviewing.getByText("Yasmin")).toHaveCount(0);
  await reviewing
    .getByRole("textbox", { name: "What works well" })
    .fill("Naming Cairo makes the river feel real.");
  await reviewing
    .getByRole("textbox", { name: "Even better if" })
    .fill("Ask the river for something.");
  await reviewing.getByRole("button", { name: "Send review" }).click();
  await expect(reviewer.getByText("Review sent.")).toBeVisible();
  await classmate.context.close();

  await page.reload();
  await untilHydrated(page);
  await expect(page.getByText("1 of 2 reviews sent")).toBeVisible();
  await page.getByRole("button", { name: "Release reviews" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Release reviews" })
    .click();
  await expect(page.getByText(/^Released to students/)).toBeVisible();

  const student = author.student;
  await student.reload();
  await untilHydrated(student);
  const said = student.getByRole("region", { name: "What classmates said" });
  await expect(said.getByText("Classmate 1")).toBeVisible();
  await expect(
    said.getByText("Naming Cairo makes the river feel real."),
  ).toBeVisible();
  await author.context.close();
});

test("a reviewer comments on a passage by its review date, and the author says how helpful the review was", async ({
  browser,
}) => {
  const { api: teacher } = await signedInApi(TEACHER);
  const { classes } = await teacher.coursework.options();
  const arabic = classes.find((row) => row.titleEn === "8A Arabic");
  if (!arabic) throw new Error("the seed has no 8A Arabic");
  const reviewsDue = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const saved = await teacher.coursework.save({
    classId: arabic.id,
    title: `Sea poem ${crypto.randomUUID().slice(0, 6)}`,
    brief: plainContent("Write the sea a poem."),
    audience: "class",
    latePolicy: "accept",
    submissionFormat: "online",
    points: 10,
    rubric: null,
    peer: { reviews: 1, anonymous: true, dueAt: reviewsDue },
  });
  await teacher.coursework.publish({
    id: saved.id,
    expectedVersion: saved.version,
  });
  for (const [email, words] of [
    ["student1008@northwind.example.com", "Waves carry shells to the shore."],
    [ACCOUNTS.student.email, "The sea sings at night."],
  ] as const) {
    const { api } = await signedInApi(email);
    const drafted = await api.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent(words),
    });
    await api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: drafted.version,
    });
  }
  await teacher.peer.start({ assignmentId: saved.id });

  const reviewerContext = await browser.newContext();
  const reviewer = await reviewerContext.newPage();
  await signInWith(
    reviewer,
    "student1008@northwind.example.com",
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await reviewer.goto(`/assignments/${saved.id}`);
  await untilHydrated(reviewer);
  const reviewing = reviewer.getByRole("region", { name: "Peer review" });
  await expect(reviewing.getByText(/Reviews are due /)).toBeVisible();
  await reviewing.getByText("sings").dblclick();
  await reviewing
    .getByRole("textbox", { name: /Your comment on/ })
    .fill("A sea that sings is a lovely picture.");
  await reviewing.getByRole("button", { name: "Add comment" }).click();
  await expect(
    reviewing.getByText("A sea that sings is a lovely picture."),
  ).toBeVisible();
  await reviewing
    .getByRole("textbox", { name: "What works well" })
    .fill("The night makes it calm.");
  await reviewing
    .getByRole("textbox", { name: "Even better if" })
    .fill("Say what the song sounds like.");
  await reviewing.getByRole("button", { name: "Send review" }).click();
  await expect(reviewer.getByText("Review sent.")).toBeVisible();
  await reviewerContext.close();

  await teacher.peer.release({ assignmentId: saved.id });
  const authorContext = await browser.newContext();
  const author = await authorContext.newPage();
  await signInWith(
    author,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await author.goto(`/assignments/${saved.id}`);
  await untilHydrated(author);
  const said = author.getByRole("region", { name: "What classmates said" });
  await expect(said.getByText("sings", { exact: true })).toBeVisible();
  await expect(
    said.getByText("A sea that sings is a lovely picture."),
  ).toBeVisible();
  const helpful = said.getByRole("button", { name: "Very helpful" });
  await helpful.click();
  await expect(helpful).toHaveAttribute("aria-pressed", "true");
  await authorContext.close();
});

test("a teacher sees at a glance which students uploaded their own version of the worksheet", async ({
  browser,
  page,
}) => {
  const { api: teacher, token } = await signedInApi(TEACHER);
  const { classes } = await teacher.coursework.options();
  const arabic = classes.find((row) => row.titleEn === "8A Arabic");
  if (!arabic) throw new Error("the seed has no 8A Arabic");
  const words = new TextEncoder().encode("Label the river.");
  const sheet = await teacher.files.initiate({
    purpose: "document_media",
    name: "worksheet.txt",
    mediaType: "text/plain",
    sizeBytes: words.byteLength,
  });
  const put = await fetch(`${API_ORIGIN}/v1/files/${sheet.id}/content`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "x-farida-school": "northwind",
    },
    body: words,
  });
  expect(put.ok).toBe(true);
  const title = `River sheet ${crypto.randomUUID().slice(0, 6)}`;
  const intro = plainContent("Fill in the sheet and hand it back.");
  const saved = await teacher.coursework.save({
    classId: arabic.id,
    title,
    brief: {
      root: {
        ...intro.root,
        children: [
          ...(intro.root.children ?? []),
          {
            type: "starter",
            version: 1,
            format: "",
            indent: 0,
            direction: null,
            children: [
              {
                type: "file",
                version: 1,
                format: "",
                fileId: sheet.id,
                name: "worksheet.txt",
                mime: "text/plain",
                bytes: words.byteLength,
              },
            ],
          },
        ],
      },
    },
    audience: "class",
    latePolicy: "accept",
    submissionFormat: "online",
    points: 10,
    rubric: null,
  });
  await teacher.coursework.publish({
    id: saved.id,
    expectedVersion: saved.version,
  });

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInWith(
    student,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  await student.goto(`/assignments/${saved.id}`);
  await untilHydrated(student);
  await student
    .getByRole("textbox", { name: "Your answer" })
    .getByText("worksheet.txt", { exact: true })
    .click();
  await student
    .getByRole("toolbar", { name: "File options" })
    .locator("input[type=file]")
    .setInputFiles({
      name: "my-worksheet.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("The Nile, the delta, the sea."),
    });
  await expect(student.getByText("my-worksheet.txt")).toBeVisible();
  await student.getByRole("button", { name: "Hand in", exact: true }).click();
  await student
    .getByRole("dialog")
    .getByRole("button", { name: "Hand in", exact: true })
    .click();
  await expect(
    student.getByRole("region", { name: "Handed in" }).getByText("Attempt 1"),
  ).toBeVisible();
  await studentContext.close();

  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto(`/assignments/${saved.id}?tab=work`);
  await untilHydrated(page);
  await expect(
    page.getByRole("columnheader", { name: "Their copy" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("tabpanel")
      .getByRole("row", { name: /Yasmin Sabry/ })
      .getByText(/^Uploaded /),
  ).toBeVisible();
  await expect(
    page
      .getByRole("tabpanel")
      .getByRole("row", { name: /^(?!.*Yasmin Sabry)/ })
      .getByText("Not uploaded yet")
      .first(),
  ).toBeVisible();
});

test("a brief written in two languages opens in the reader's own", async ({
  browser,
  page,
}) => {
  const title = `River ${crypto.randomUUID().slice(0, 6)}`;
  await signInWith(page, TEACHER, PASSWORD, "/today");
  await page.goto("/assignment-editor");
  await untilHydrated(page);
  await page.locator("#work-class").click();
  await page.getByRole("option", { name: "8A Arabic", exact: true }).click();
  await page.getByRole("textbox", { name: "Assignment title" }).fill(title);
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Write the Nile a letter.");
  await page.locator("#work-language").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.getByRole("checkbox", { name: "Also write it in Arabic" }).click();
  await expect(page.getByRole("tab", { name: "العربية" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page
    .getByRole("textbox", { name: "Assignment title" })
    .fill("رسالة إلى النيل");
  // The translation starts as a copy of the brief, rewritten in place.
  const body = page.locator("[contenteditable=true]").first();
  await body.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  // Text sent the instant the old words go reaches the editor before it
  // has drawn their going, which no hand can do; it waits for the drawing.
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );
  await page.keyboard.insertText("اكتب رسالة إلى النيل.");
  await expect(body).toHaveText("اكتب رسالة إلى النيل.");
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/assignments\/[a-f0-9-]+/);
  const address = new URL(page.url()).pathname;

  const context = await browser.newContext();
  const student = await context.newPage();
  await signInWith(
    student,
    ACCOUNTS.student.email,
    PASSWORD,
    ACCOUNTS.student.home,
  );
  // The student reads the school in Arabic.
  await context.addCookies([
    { name: "language-tag", value: "ar", url: portal() },
  ]);
  await student.goto(address);
  await untilHydrated(student);
  await expect(
    student.getByRole("heading", { level: 1, name: "رسالة إلى النيل" }),
  ).toBeVisible();
  await expect(student.getByText("اكتب رسالة إلى النيل.")).toBeVisible();
  await student.getByRole("tab", { name: "English" }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(student.getByText("Write the Nile a letter.")).toBeVisible();
  await context.close();
});

/**
 * Work for the seeded student: one piece handed in and returned with
 * feedback and a private note, another handed in and waiting.
 */
async function returnedAndWaiting(unique: string) {
  const { api: teacher } = await signedInApi(TEACHER);
  const { api: learner } = await signedInApi(ACCOUNTS.student.email);
  const me = await learner.identity.currentUser();
  const { classes } = await teacher.coursework.options();
  const rosters = await Promise.all(
    classes
      .filter((row) => row.classType === "scheduled")
      .map(async (row) => ({
        id: row.id,
        roster: (await teacher.coursework.groups({ classId: row.id })).roster,
      })),
  );
  const classId = rosters.find((row) =>
    row.roster.some((pupil) => pupil.id === me.id),
  )?.id;
  if (!classId) throw new Error("the seeded student takes no Arabic class");
  const set = async (title: string) => {
    const saved = await teacher.coursework.save({
      classId,
      title,
      brief: plainContent(`Instructions for ${title}.`),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "online",
      points: 10,
      rubric: null,
    });
    await teacher.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const drafted = await learner.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent(`My answer to ${title}.`),
    });
    await learner.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: drafted.version,
    });
    return saved.id;
  };
  const marked = `Marked letter ${unique}`;
  const waiting = `Waiting letter ${unique}`;
  const [markedId] = await Promise.all([set(marked), set(waiting)]);
  const grading = await teacher.coursework.grading({
    assignmentId: markedId,
    studentId: me.id,
  });
  const attempt = grading.attempts[0];
  if (!attempt) throw new Error("the attempt was not made");
  await teacher.coursework.assess({
    attemptId: attempt.id,
    score: 8,
    feedback: "A warm letter. Check your full stops.",
    privateNote: "Kept for the teacher.",
  });
  await teacher.coursework.act({
    assignmentId: markedId,
    action: "return",
    studentIds: [me.id],
  });
  return { studentId: me.id, marked, markedId, waiting };
}

const WAITING = {
  en: "Handed in, waiting to be marked",
  ar: "سُلِّم وينتظر التصحيح",
} as const;

for (const [locale, width] of [
  ["en", 1280],
  ["ar", 1280],
  ["en", 390],
  ["ar", 390],
] as const)
  test(`a family reads the feedback on returned work and sees what waits to be marked (${locale}, ${width}px)`, async ({
    browser,
  }, testInfo) => {
    const work = await returnedAndWaiting(crypto.randomUUID().slice(0, 6));
    const context = await browser.newContext({
      viewport: { width, height: 844 },
    });
    const family = await context.newPage();
    await signInWith(
      family,
      "parent1007@northwind.example.com",
      PASSWORD,
      "/family",
    );
    // The family reads the school in its own language once signed in.
    await context.addCookies([
      { name: "language-tag", value: locale, url: portal() },
    ]);
    await family.goto(`/family/assignments?studentId=${work.studentId}`);
    await untilHydrated(family);
    await expect(
      family
        .getByRole("region", { name: WAITING[locale] })
        .getByText(work.waiting),
    ).toBeVisible();
    await family.getByRole("button", { name: work.marked }).first().click();
    await expect(family).toHaveURL(new RegExp(`assignment=${work.markedId}`));
    const sheet = family.getByRole("dialog");
    await expect(
      sheet.getByText("A warm letter. Check your full stops."),
    ).toBeVisible();
    await expect(sheet.getByText("Kept for the teacher.")).toHaveCount(0);
    expect(
      await family.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await family.screenshot({
      path: testInfo.outputPath(
        `family-coursework-${locale}-${width < 768 ? "mobile" : "desktop"}.png`,
      ),
    });
    await context.close();
  });
