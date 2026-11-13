import { plainContent } from "@faridalms/domain/content-conversion";
import { addDays } from "@faridalms/domain/school";
import { expect, test } from "@playwright/test";

import { signedInApi } from "./fixtures/api";
import { freshSchool, signInTo } from "./fixtures/fresh-school";
import { PASSWORD, portal, signIn, untilHydrated } from "./fixtures/sign-in";

test("at a school without years a teacher shows running grades and the learner reads theirs with what it is made of", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const school = await freshSchool(browser, { without: ["school_years"] });
  const at = portal(school.slug);
  const { api } = await signedInApi(school.admin, PASSWORD, school.slug);
  const teacher = (await signedInApi(school.teacher, PASSWORD, school.slug))
    .api;
  const learner = (await signedInApi(school.student, PASSWORD, school.slug))
    .api;
  const { today } = await api.identity.currentUser();
  const [{ id: teacherId }, { id: learnerId }] = await Promise.all([
    teacher.identity.currentUser(),
    learner.identity.currentUser(),
  ]);
  const klass = await api.classes.save({
    code: "PY-101",
    titleEn: "Python from scratch",
    titleAr: "بايثون من البداية",
    teacherIds: [teacherId],
    startsOn: addDays(today, -7),
    endsOn: addDays(today, 90),
  });
  await api.classes.enrol({ studentId: learnerId, classId: klass.id });

  // Two pieces of work: one marked and returned, one marked and kept back.
  const work = async (title: string) => {
    const saved = await teacher.coursework.save({
      classId: klass.id,
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
    const draft = await learner.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent(`My answer to ${title}.`),
    });
    await learner.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: draft.version,
    });
    const [attempt] = (
      await teacher.coursework.grading({
        assignmentId: saved.id,
        studentId: learnerId,
      })
    ).attempts;
    return { id: saved.id, attemptId: attempt?.id ?? "" };
  };
  const returned = await work("Hello, world");
  await teacher.coursework.assess({
    attemptId: returned.attemptId,
    score: 9,
    feedback: "It greets everyone.",
  });
  await teacher.coursework.act({
    assignmentId: returned.id,
    action: "return",
    studentIds: [learnerId],
  });
  const kept = await work("Loops");
  await teacher.coursework.assess({
    attemptId: kept.attemptId,
    score: 2,
    feedback: "",
  });

  // Nothing shows until the teacher shows it.
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signInTo(student, school, "student");
  await student.goto(`${at}/me/grades`);
  await untilHydrated(student);
  await expect(
    student.getByRole("heading", { name: "No running grades yet" }),
  ).toBeVisible();

  await signInTo(page, school, "teacher");
  await page.goto(`${at}/gradebook?classId=${klass.id}`);
  await untilHydrated(page);
  const choice = page.getByRole("checkbox", {
    name: "Show students their running grade",
  });
  await expect(choice).not.toBeChecked();
  await choice.click();
  await expect(
    page.getByText("Students now see their running grade"),
  ).toBeVisible();
  await expect(choice).toBeChecked();

  // The learner reads it at a phone's width, made of the returned work alone.
  await student.setViewportSize({ width: 390, height: 844 });
  await student.reload();
  await untilHydrated(student);
  const section = student.getByRole("region", { name: "Python from scratch" });
  await expect(section).toContainText(
    "Provisional: worked out from the work returned so far",
  );
  await expect(section).toContainText("90%");
  await expect(section).toContainText("Hello, world");
  await expect(section).toContainText("9 / 10");
  await expect(section).toContainText("100% of the grade");
  await expect(section).not.toContainText("Loops");
  expect(
    await student.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  // In Arabic, right to left.
  await studentContext.addCookies([
    { name: "language-tag", value: "ar", url: at },
  ]);
  await student.goto(`${at}/me/grades`);
  await untilHydrated(student);
  await expect(student.locator("html")).toHaveAttribute("dir", "rtl");
  const arabic = student.getByRole("region", { name: "بايثون من البداية" });
  await expect(arabic).toContainText("مؤقت");
  await expect(arabic).toContainText("من التقدير");
  expect(
    await student.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await studentContext.close();
});

test("at Northwind the released term grade reads as before and the running grade is marked provisional", async ({
  page,
}) => {
  const { api } = await signedInApi("student1007@northwind.example.com");
  const released = (await api.gradebook.student({})).rows.find(
    (row) => row.classCode === "8-A-ARAB",
  );
  if (!released) throw new Error("the seed releases an 8A Arabic term grade");
  await signIn(page, "student");
  await page.goto("/me/grades");
  await untilHydrated(page);

  const term = page.getByRole("region", {
    name: released.periodTitleEn ?? "",
    exact: true,
  });
  await expect(
    term.getByRole("listitem").filter({ hasText: "8A Arabic" }),
  ).toContainText(String(released.score));

  const running = page.getByRole("region", { name: "8A Arabic", exact: true });
  await expect(running).toContainText(
    "Provisional: worked out from this term's work returned so far. The term grade the school releases is the official one.",
  );
  await expect(running).toContainText(
    `This term so far: ${released.periodTitleEn}`,
  );
  await expect(running).toContainText("Chapter 1 review");
});
