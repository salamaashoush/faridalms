import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, raw, rejection, sessionFor, signedIn } from "./harness";

// The seed's second teacher teaches Arabic to every grade, the third English.
const arabicTeacher = () => sessionFor("northwind", login("teacher", 0, 1));
const englishTeacher = () => signedIn("northwind", login("teacher", 0, 2));

const draft = (classId: string, title: string, extra: object = {}) => ({
  classId,
  title,
  brief: plainContent(`Instructions for ${title}.`),
  audience: "class" as const,
  latePolicy: "accept" as const,
  submissionFormat: "both" as const,
  points: 10,
  rubric: null,
  ...extra,
});

/** The Arabic class the seeded student sits in, so work set there reaches them. */
async function classOfStudent(
  api: Awaited<ReturnType<typeof arabicTeacher>>["api"],
  studentId: string,
) {
  const { classes } = await api.coursework.options();
  for (const row of classes.filter((item) => item.classType === "scheduled")) {
    const { roster } = await api.coursework.groups({ classId: row.id });
    if (roster.some((pupil) => pupil.id === studentId)) return row;
  }
  throw new Error("the seeded student takes no Arabic class");
}

async function upload(
  session: Awaited<ReturnType<typeof arabicTeacher>>,
  purpose: "attachment" | "submission",
  name: string,
) {
  const body = new Blob([`contents of ${name}`]);
  const file = await session.api.files.initiate({
    purpose,
    name,
    mediaType: "text/plain",
    sizeBytes: body.size,
  });
  const put = await raw(
    "northwind",
    session.token,
    `/v1/files/${file.id}/content`,
    {
      method: "PUT",
      body,
    },
  );
  expect(put.status).toBe(200);
  return file.id;
}

describe("coursework for a teacher", () => {
  test("the list counts what waits for grading, what is out and what is drafted", async () => {
    const { api } = await arabicTeacher();
    const { counts, rows } = await api.coursework.list({ tab: "to_grade" });
    expect(counts.drafts).toBeGreaterThanOrEqual(3);
    expect(counts.assigned).toBeGreaterThanOrEqual(3);
    expect(counts.past).toBeGreaterThanOrEqual(3);
    const review = rows.find((row) => row.title === "Chapter 1 review");
    expect(review).toMatchObject({ handedIn: 3, toGrade: 2 });
    expect(review?.recipients).toBeGreaterThan(3);
    expect(review?.missing).toBe((review?.recipients ?? 0) - 3);
  });

  test("another teacher reaches none of it", async () => {
    const { api } = await arabicTeacher();
    const { rows } = await api.coursework.list({ tab: "drafts" });
    const mine = rows[0];
    if (!mine) throw new Error("seed draft");
    const other = await englishTeacher();
    expect(
      await rejection(other.coursework.record({ id: mine.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a draft for part of a class goes only to the group chosen", async () => {
    const { api } = await arabicTeacher();
    const { classes } = await api.coursework.options();
    const target = classes.find((row) => row.classType === "scheduled");
    if (!target) throw new Error("seed class");
    const { groups } = await api.coursework.groups({ classId: target.id });
    const group = groups[0];
    if (!group) throw new Error("seed group");
    const saved = await api.coursework.save(
      draft(target.id, "Group reading", {
        audience: "selected",
        groupIds: [group.id],
      }),
    );
    const published = await api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(published.recipients).toBe(group.studentIds.length);
    const record = await api.coursework.record({ id: saved.id });
    expect(record.work.map((row) => row.studentId).toSorted()).toEqual(
      group.studentIds.toSorted(),
    );
    expect(record.phase).toBe("assigned");
  });

  test("an assignment with nothing to read cannot go out", async () => {
    const { api } = await arabicTeacher();
    const { classes } = await api.coursework.options();
    const target = classes[0];
    if (!target) throw new Error("seed class");
    const saved = await api.coursework.save(
      draft(target.id, "Empty brief", { brief: plainContent("") }),
    );
    expect(
      await rejection(
        api.coursework.publish({
          id: saved.id,
          expectedVersion: saved.version,
        }),
      ),
    ).toMatchObject({ message: "coursework.brief_empty" });
  });
});

describe("handing in and returning work", () => {
  test("a student hands in, the grade stays private until returned, then the family sees it", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Poem analysis", {
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const listed = await student.api.coursework.mine();
    expect(
      listed.rows.find((row) => row.assignmentId === saved.id)?.state,
    ).toBe("to_do");
    const open = await student.api.coursework.work({ id: saved.id });
    expect(open.canHandIn).toBe(true);
    const drafted = await student.api.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent("The poem is about home."),
      fileIds: [],
    });
    const handed = await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: drafted.version,
    });
    expect(
      await rejection(
        student.api.coursework.handIn({
          assignmentId: saved.id,
          expectedVersion: handed.version,
        }),
      ),
    ).toMatchObject({ message: "coursework.closed" });

    const grading = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    const attempt = grading.attempts[0];
    if (!attempt) throw new Error("attempt missing");
    expect(attempt.isLate).toBe(false);
    await teacher.api.coursework.assess({
      attemptId: attempt.id,
      score: 9,
      feedback: "Thoughtful.",
      privateNote: "Check spelling next time.",
    });
    const hidden = await student.api.coursework.work({ id: saved.id });
    expect(hidden.state).toBe("handed_in");
    expect(hidden.attempts[0]?.assessment).toBeNull();
    expect(hidden.canUndo).toBe(false);

    await teacher.api.coursework.act({
      assignmentId: saved.id,
      action: "return",
      studentIds: [me.id],
    });
    const returned = await student.api.coursework.work({ id: saved.id });
    expect(returned.state).toBe("returned");
    expect(returned.attempts[0]?.assessment).toMatchObject({
      score: 9,
      feedback: "Thoughtful.",
      privateNote: null,
    });

    // The seeded student's mother signs in with the same number.
    const parent = await signedIn(
      "northwind",
      login("student").replace("student", "parent"),
    );
    const family = await parent.coursework.child({ studentId: me.id });
    expect(
      family.rows.find((row) => row.assignmentId === saved.id),
    ).toMatchObject({ state: "returned", effectiveScore: 9 });
  });

  test("late work under a deduction policy loses its share, and an unassessed attempt can be taken back", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const pupil = { id: me.id };
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Late essay", {
        dueAt: new Date(Date.now() - 86_400_000).toISOString(),
        latePolicy: "deduct",
        lateDeductionPercent: 10,
        submissionFormat: "online",
        audience: "selected",
        studentIds: [pupil.id],
      }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const record = await teacher.api.coursework.record({ id: saved.id });
    expect(record.work[0]?.learnerState).toBe("missing");

    const drafted = await student.api.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent("Sorry it is late."),
      fileIds: [],
    });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: drafted.version,
    });
    await student.api.coursework.undoHandIn({ assignmentId: saved.id });
    expect((await student.api.coursework.work({ id: saved.id })).state).toBe(
      "missing",
    );
    const again = await student.api.coursework.work({ id: saved.id });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: again.submission.version,
    });
    const grading = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    const attempt = grading.attempts.at(-1);
    if (!attempt) throw new Error("attempt missing");
    expect(attempt.isLate).toBe(true);
    const assessed = await teacher.api.coursework.assess({
      attemptId: attempt.id,
      score: 10,
    });
    expect(assessed.id).toBeTruthy();
    const after = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    expect(after.attempts.at(-1)?.assessment?.effectiveScore).toBe(9);
  });

  test("resources reach recipients, drafts stay the student's, attempts reach the teacher", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const resource = await upload(teacher, "attachment", "worksheet.txt");
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Worksheet", { resourceFileIds: [resource] }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(
      (await raw("northwind", student.token, `/v1/files/${resource}/content`))
        .status,
    ).toBe(200);

    const answer = await upload(student, "submission", "answers.txt");
    const drafted = await student.api.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: null,
      fileIds: [answer],
    });
    expect(
      (await raw("northwind", teacher.token, `/v1/files/${answer}/content`)).status,
    ).toBe(404);
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: drafted.version,
    });
    expect(
      (await raw("northwind", teacher.token, `/v1/files/${answer}/content`)).status,
    ).toBe(200);
  });
});
