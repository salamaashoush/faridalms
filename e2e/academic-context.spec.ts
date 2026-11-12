import { plainContent } from "@faridalms/domain/content-conversion";
import { expect, test } from "@playwright/test";

import { apiAs, signedInApi } from "./fixtures/api";
import { newClass, newStudent, workingYear } from "./fixtures/school";
import { ACCOUNTS } from "./fixtures/sign-in";

test("a notice about an assignment still opens it after the student moves to another class", async () => {
  const unique = crypto.randomUUID().slice(0, 6);
  const admin = await apiAs("admin");
  const { api: teacher } = await signedInApi(ACCOUNTS.teacher.email);
  const teacherId = (await teacher.identity.currentUser()).id;
  const options = await admin.classes.options();
  const arabic = options.subjects.find((row) => row.code === "arabic");
  if (!arabic) throw new Error("the school has no Arabic");
  const year = await workingYear(admin);
  const subjects = [{ subjectId: arabic.id, teacherIds: [teacherId] }];
  const [first, second] = await Promise.all([
    newClass(admin, {
      yearId: year.id,
      title: `Salama first ${unique}`,
      subjects,
    }),
    newClass(admin, {
      yearId: year.id,
      title: `Salama second ${unique}`,
      subjects,
    }),
  ]);

  const pupil = await newStudent(admin, `Pupil ${unique}`);
  const loginName = `pupil-${unique}@northwind.example.com`;
  const password = "pupil-passphrase-2026";
  await admin.people.saveSignIn({ userId: pupil.id, loginName, password });
  await admin.homerooms.place({ studentId: pupil.id, classId: first.id });

  const of = await admin.homerooms.ofClass({ classId: first.id });
  const lessons =
    of.kind === "homeroom"
      ? of.subjects.find((row) => row.subjectId === arabic.id)
      : undefined;
  if (!lessons) throw new Error("the class has no Arabic lessons");
  const title = `Salama pupil task ${unique}`;
  const saved = await teacher.coursework.save({
    classId: lessons.id,
    title,
    brief: plainContent("Read the first chapter, then say what you found."),
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

  expect(
    await admin.homerooms.place({ studentId: pupil.id, classId: second.id }),
  ).toMatchObject({ moved: true });

  // Publishing the work is what told the student about it.
  const { api: learner } = await signedInApi(loginName, password);
  const notices = await learner.notifications.list({ tab: "all" });
  expect(
    notices.rows.some(
      (row) =>
        row.kind === "assignment" &&
        row.subjectType === "assignment" &&
        row.subjectId === saved.id,
    ),
  ).toBe(true);
  const opened = await learner.coursework.work({ id: saved.id });
  expect(opened.assignment).toMatchObject({
    id: saved.id,
    title,
    class: { id: lessons.id },
  });
});
