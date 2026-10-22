import type { LessonResponse } from "@faridalms/domain/learning";

import { plainContent } from "@faridalms/domain/content-conversion";
import {
  briefWithQuiz,
  contentOfLesson,
} from "@faridalms/domain/lesson-content";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";

import { handInTimedOut } from "../src/core/quiz-clock";
import { login, raw, rejection, seeded, sessionFor, signedIn } from "./harness";

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
  purpose: "document_media",
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

  test("a draft may move to another class, work already out may not", async () => {
    const { api } = await arabicTeacher();
    const { classes } = await api.coursework.options();
    const [first, second] = classes.filter(
      (row) => row.classType === "scheduled",
    );
    if (!first || !second) throw new Error("two seed classes");
    const saved = await api.coursework.save(draft(first.id, "Moving draft"));
    const moved = await api.coursework.save({
      ...draft(second.id, "Moving draft"),
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect((await api.coursework.editor({ id: saved.id })).classId).toBe(
      second.id,
    );
    const published = await api.coursework.publish({
      id: saved.id,
      expectedVersion: moved.version,
    });
    expect(
      await rejection(
        api.coursework.save({
          ...draft(first.id, "Moving draft"),
          id: saved.id,
          expectedVersion: published.version,
        }),
      ),
    ).toMatchObject({ message: "coursework.class_fixed" });
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

  test("comments on a passage stay with the teacher until the work is returned, and only their writer changes them", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Letter to a friend"),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const drafted = await student.api.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent("Dear Salama, I hope you are well."),
    });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: drafted.version,
    });
    const grading = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    const attempt = grading.attempts[0];
    if (!attempt) throw new Error("attempt missing");
    const anchor = {
      start: { block: "letter01", offset: 0 },
      end: { block: "letter01", offset: 11 },
    };
    const made = await teacher.api.coursework.comment({
      attemptId: attempt.id,
      expectedVersion: 0,
      anchor,
      body: "A warm opening.",
      kind: "think",
      criterionId: "opening",
    });

    // A comment picked from the bank counts as a use of it.
    const kept = await teacher.api.coursework.saveBankComment({
      expectedVersion: 0,
      body: "Start a new paragraph here.",
      shared: false,
    });
    const picked = await teacher.api.coursework.comment({
      attemptId: attempt.id,
      expectedVersion: 0,
      anchor,
      body: "Start a new paragraph here.",
      bankId: kept.id,
    });
    const ranked = await teacher.api.coursework.commentBank();
    expect(ranked[0]).toMatchObject({ id: kept.id, uses: 1 });
    await teacher.api.coursework.uncomment({
      id: picked.id,
      expectedVersion: picked.version,
    });

    const shown = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    expect(shown.attempts[0]?.comments).toMatchObject([
      {
        id: made.id,
        anchor,
        body: "A warm opening.",
        kind: "think",
        criterionId: "opening",
        editedAt: null,
      },
    ]);
    expect(
      (await student.api.coursework.work({ id: saved.id })).attempts[0]
        ?.comments,
    ).toEqual([]);
    expect(
      await rejection(
        student.api.coursework.comment({
          attemptId: attempt.id,
          expectedVersion: 0,
          anchor,
          body: "Mine.",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    const other = await englishTeacher();
    expect(
      await rejection(
        other.coursework.comment({
          attemptId: attempt.id,
          expectedVersion: 0,
          anchor,
          body: "Not my class.",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const edited = await teacher.api.coursework.comment({
      id: made.id,
      attemptId: attempt.id,
      expectedVersion: made.version,
      anchor,
      body: "A warm opening; keep it.",
    });
    expect(
      await rejection(
        teacher.api.coursework.comment({
          id: made.id,
          attemptId: attempt.id,
          expectedVersion: made.version,
          anchor,
          body: "Stale.",
        }),
      ),
    ).toMatchObject({ message: "conflict.version" });

    expect(
      await rejection(
        student.api.coursework.answerComment({
          commentId: made.id,
          state: "unclear",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    await teacher.api.coursework.assess({
      attemptId: attempt.id,
      score: 8,
      rubricComments: { opening: "A warm, clear opening.", ending: "" },
    });
    await teacher.api.coursework.act({
      assignmentId: saved.id,
      action: "return",
      studentIds: [me.id],
    });
    // Returned, the student answers the comment and the teacher replies.
    await student.api.coursework.answerComment({
      commentId: made.id,
      state: "unclear",
    });
    await student.api.coursework.replyToComment({
      commentId: made.id,
      body: "Which part is warm?",
    });
    const waiting = async () =>
      (
        await teacher.api.coursework.grading({
          assignmentId: saved.id,
          studentId: me.id,
        })
      ).queue.find((row) => row.studentId === me.id)?.awaiting;
    expect(await waiting()).toBe(1);
    await teacher.api.coursework.replyToComment({
      commentId: made.id,
      body: "The first line, where you greet her.",
    });
    expect(await waiting()).toBe(0);
    const answered = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    expect(answered.attempts[0]?.comments[0]).toMatchObject({
      studentState: "unclear",
      replies: [
        { body: "Which part is warm?" },
        { body: "The first line, where you greet her." },
      ],
    });
    const returned = await student.api.coursework.work({ id: saved.id });
    expect(returned.attempts[0]?.assessment?.rubricComments).toEqual({
      opening: "A warm, clear opening.",
    });
    expect(returned.attempts[0]?.comments).toMatchObject([
      { id: made.id, body: "A warm opening; keep it." },
    ]);
    expect(returned.attempts[0]?.comments[0]?.editedAt).not.toBeNull();

    await teacher.api.coursework.uncomment({
      id: made.id,
      expectedVersion: edited.version,
    });
    expect(
      (await student.api.coursework.work({ id: saved.id })).attempts[0]
        ?.comments,
    ).toEqual([]);
    // Undo brings it back with its answer and replies.
    expect(
      await rejection(other.coursework.restoreWorkComment({ id: made.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    await teacher.api.coursework.restoreWorkComment({ id: made.id });
    expect(
      (await student.api.coursework.work({ id: saved.id })).attempts[0]
        ?.comments[0],
    ).toMatchObject({ id: made.id, studentState: "unclear" });
  });

  test("a held grade waits until the student answers every comment", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Comments first", { gradeAfterAnswers: true }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const drafted = await student.api.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent("Plants need light. They also need water."),
    });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: drafted.version,
    });
    const grading = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    const attempt = grading.attempts[0];
    if (!attempt) throw new Error("attempt missing");
    const anchor = {
      start: { block: "plants01", offset: 0 },
      end: { block: "plants01", offset: 6 },
    };
    const [first, second] = [
      await teacher.api.coursework.comment({
        attemptId: attempt.id,
        expectedVersion: 0,
        anchor,
        body: "Which kind of light?",
        kind: "think",
      }),
      await teacher.api.coursework.comment({
        attemptId: attempt.id,
        expectedVersion: 0,
        anchor,
        body: "Add one more need.",
        kind: "next",
      }),
    ];
    await teacher.api.coursework.assess({ attemptId: attempt.id, score: 7 });
    await teacher.api.coursework.act({
      assignmentId: saved.id,
      action: "return",
      studentIds: [me.id],
    });

    const held = await student.api.coursework.work({ id: saved.id });
    expect(held.state).toBe("returned");
    expect(held.attempts[0]?.comments).toHaveLength(2);
    expect(held.attempts[0]?.assessment).toMatchObject({
      gradeHeld: true,
      score: null,
      effectiveScore: null,
    });
    expect(
      (await student.api.coursework.mine()).rows.find(
        (row) => row.assignmentId === saved.id,
      ),
    ).toMatchObject({ state: "returned", effectiveScore: null });
    const queued = (
      await teacher.api.coursework.grading({
        assignmentId: saved.id,
        studentId: me.id,
      })
    ).queue.find((row) => row.studentId === me.id);
    expect(queued).toMatchObject({ needsGrading: false, held: true });

    await student.api.coursework.answerComment({
      commentId: first.id,
      state: "fixed",
    });
    expect(
      (await student.api.coursework.work({ id: saved.id })).attempts[0]
        ?.assessment?.gradeHeld,
    ).toBe(true);
    await student.api.coursework.answerComment({
      commentId: second.id,
      state: "unclear",
    });
    expect(
      (await student.api.coursework.work({ id: saved.id })).attempts[0]
        ?.assessment,
    ).toMatchObject({ gradeHeld: false, score: 7 });
  });

  test("a teacher may show a held grade before the comments are answered", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Shown early", { gradeAfterAnswers: true }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const drafted = await student.api.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent("A short answer."),
    });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: drafted.version,
    });
    const attempt = (
      await teacher.api.coursework.grading({
        assignmentId: saved.id,
        studentId: me.id,
      })
    ).attempts[0];
    if (!attempt) throw new Error("attempt missing");
    await teacher.api.coursework.comment({
      attemptId: attempt.id,
      expectedVersion: 0,
      anchor: {
        start: { block: "short001", offset: 0 },
        end: { block: "short001", offset: 5 },
      },
      body: "Say more.",
    });
    await teacher.api.coursework.assess({ attemptId: attempt.id, score: 5 });
    await teacher.api.coursework.act({
      assignmentId: saved.id,
      action: "return",
      studentIds: [me.id],
    });
    await teacher.api.coursework.showGrade({ attemptId: attempt.id });
    expect(
      (await student.api.coursework.work({ id: saved.id })).attempts[0]
        ?.assessment,
    ).toMatchObject({ gradeHeld: false, score: 5 });
  });

  test("voice feedback is heard by the student only once the work is returned", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Spoken reflection"),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const drafted = await student.api.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent("I learned to plan before writing."),
    });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: drafted.version,
    });
    const grading = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    const attempt = grading.attempts[0];
    if (!attempt) throw new Error("attempt missing");
    const voice = await upload(teacher, "document_media", "voice-note.txt");
    await teacher.api.coursework.addFeedbackRecording({
      attemptId: attempt.id,
      fileId: voice,
    });
    expect(
      (
        await teacher.api.coursework.grading({
          assignmentId: saved.id,
          studentId: me.id,
        })
      ).attempts[0]?.recordings.map((file) => file.id),
    ).toEqual([voice]);
    const hear = (token: string) =>
      raw("northwind", token, `/v1/files/${voice}/content?download`);
    expect((await hear(student.token)).status).toBe(404);
    expect(
      (await student.api.coursework.work({ id: saved.id })).attempts[0]
        ?.recordings,
    ).toEqual([]);

    await teacher.api.coursework.act({
      assignmentId: saved.id,
      action: "return",
      studentIds: [me.id],
    });
    expect((await hear(student.token)).status).toBe(200);
    expect(
      (
        await student.api.coursework.work({ id: saved.id })
      ).attempts[0]?.recordings.map((file) => file.id),
    ).toEqual([voice]);

    await teacher.api.coursework.removeFeedbackRecording({
      attemptId: attempt.id,
      fileId: voice,
    });
    expect(
      (await student.api.coursework.work({ id: saved.id })).attempts[0]
        ?.recordings,
    ).toEqual([]);
  });

  test("a comment bank keeps a teacher's comments, and colleagues pick only the shared ones", async () => {
    const teacher = await arabicTeacher();
    const colleague = await englishTeacher();
    const mine = await teacher.api.coursework.saveBankComment({
      expectedVersion: 0,
      body: "Read the question twice before you answer.",
      shared: false,
    });
    const shared = await teacher.api.coursework.saveBankComment({
      expectedVersion: 0,
      body: "Show your working, not only the answer.",
      shared: true,
    });
    const own = await teacher.api.coursework.commentBank();
    expect(own.find((row) => row.id === mine.id)).toMatchObject({
      mine: true,
      shared: false,
    });
    const theirs = await colleague.coursework.commentBank();
    expect(theirs.some((row) => row.id === mine.id)).toBe(false);
    expect(theirs.find((row) => row.id === shared.id)).toMatchObject({
      mine: false,
      body: "Show your working, not only the answer.",
    });
    expect(
      await rejection(
        colleague.coursework.removeFromBank({
          id: shared.id,
          expectedVersion: shared.version,
        }),
      ),
    ).toMatchObject({ message: "coursework.comment_author" });
    const student = await signedIn("northwind", login("student"));
    expect(await rejection(student.coursework.commentBank())).toMatchObject({
      code: "FORBIDDEN",
    });

    await teacher.api.coursework.removeFromBank({
      id: mine.id,
      expectedVersion: mine.version,
    });
    expect(
      (await teacher.api.coursework.commentBank()).some(
        (row) => row.id === mine.id,
      ),
    ).toBe(false);
  });

  test("each student starts from their own copy of the worksheet in the brief", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const intro = plainContent("Fill in the table about your town.");
    const sheet = plainContent("Population: ... Rivers: ...");
    const saved = await teacher.api.coursework.save(
      draft(target.id, "My town", {
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
                children: sheet.root.children ?? [],
              },
            ],
          },
        },
      }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const open = await student.api.coursework.work({ id: saved.id });
    expect(JSON.stringify(open.brief)).toContain("Fill in the table");
    expect(JSON.stringify(open.brief)).not.toContain("Population");
    expect(JSON.stringify(open.submission.content)).toContain("Population");
    const record = await teacher.api.coursework.record({ id: saved.id });
    expect(JSON.stringify(record.brief)).toContain("Population");
  });

  test("a student given more time is no longer missing, and the class keeps its date", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Extended essay", {
        dueAt: new Date(Date.now() - 86_400_000).toISOString(),
        latePolicy: "refuse",
        submissionFormat: "online",
      }),
    );
    expect(
      await rejection(
        teacher.api.coursework.extend({
          assignmentId: saved.id,
          studentIds: [me.id],
          dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ),
    ).toMatchObject({ message: "coursework.not_assigned" });
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect((await student.api.coursework.work({ id: saved.id })).state).toBe(
      "missing",
    );

    const later = new Date(Date.now() + 86_400_000).toISOString();
    expect(
      await teacher.api.coursework.extend({
        assignmentId: saved.id,
        studentIds: [me.id],
        dueAt: later,
      }),
    ).toEqual({ changed: 1 });
    const work = await student.api.coursework.work({ id: saved.id });
    expect(work.state).toBe("to_do");
    expect(work.canHandIn).toBe(true);
    const record = await teacher.api.coursework.record({ id: saved.id });
    expect(record.work.find((row) => row.studentId === me.id)).toMatchObject({
      extended: true,
      learnerState: "to_do",
    });
    expect(
      record.work.find((row) => row.studentId !== me.id)?.learnerState,
    ).toBe("missing");

    await teacher.api.coursework.extend({
      assignmentId: saved.id,
      studentIds: [me.id],
      dueAt: "",
    });
    expect((await student.api.coursework.work({ id: saved.id })).state).toBe(
      "missing",
    );
  });

  test("a teacher hands in work done on paper, once, and the student sees who did", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Poster on paper", { submissionFormat: "online" }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const handIn = () =>
      teacher.api.coursework.act({
        assignmentId: saved.id,
        action: "hand_in",
        studentIds: [me.id],
      });
    expect(await handIn()).toEqual({ changed: 1 });
    expect(await handIn()).toEqual({ changed: 0 });
    const record = await teacher.api.coursework.record({ id: saved.id });
    expect(
      record.work.find((row) => row.studentId === me.id)?.learnerState,
    ).toBe("handed_in");
    const work = await student.api.coursework.work({ id: saved.id });
    expect(work.attempts).toHaveLength(1);
    expect(work.attempts[0]).toMatchObject({ number: 1, byTeacher: true });
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

  test("a file in the brief reaches recipients, drafts stay the student's, attempts reach the teacher", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const resource = await upload(teacher, "document_media", "worksheet.txt");
    const brief = plainContent("Fill in the worksheet.");
    brief.root.children?.push({
      type: "file",
      version: 1,
      format: "",
      fileId: resource,
      name: "worksheet.txt",
      mime: "text/plain",
      bytes: 25,
    });
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Worksheet", { brief }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(
      (await raw("northwind", student.token, `/v1/files/${resource}/content`))
        .status,
    ).toBe(200);

    const answer = await upload(student, "document_media", "answers.txt");
    const work = plainContent("My answers are attached.");
    work.root.children?.push({
      type: "file",
      version: 1,
      format: "",
      fileId: answer,
      name: "answers.txt",
      mime: "text/plain",
      bytes: 23,
    });
    const drafted = await student.api.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: work,
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

    // Opening a student's work is recorded against that student.
    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const opened = await cell.withWorker(
      { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
      "read",
      (tx) =>
        tx.execute<{ student_user_id: string; details: { download: boolean } }>(
          sql`select student_user_id, details from audit.log
            where tenant_id = ${tenantId}::uuid and action = 'file.opened'
              and object_id = ${answer}::uuid`,
        ),
    );
    expect(opened.length).toBeGreaterThan(0);
    expect(opened[0]?.student_user_id).toBe(me.id);

    // Download all: one folder per student, the answer and its files.
    const zipped = await raw(
      "northwind",
      teacher.token,
      `/v1/assignments/${saved.id}/work.zip`,
    );
    expect(zipped.status).toBe(200);
    expect(zipped.headers.get("content-type")).toBe("application/zip");
    const archive = unzipSync(new Uint8Array(await zipped.arrayBuffer()));
    const paths = Object.keys(archive);
    expect(paths.some((path) => path.endsWith("/answers.txt"))).toBe(true);
    const answerPath = paths.find((path) => path.endsWith("/answer.txt"));
    expect(strFromU8(archive[answerPath ?? ""] ?? new Uint8Array())).toContain(
      "My answers are attached.",
    );
    expect(
      (
        await raw(
          "northwind",
          student.token,
          `/v1/assignments/${saved.id}/work.zip`,
        )
      ).status,
    ).toBe(404);

    // The student's portfolio holds this work too, theirs to take.
    const portfolio = await raw(
      "northwind",
      student.token,
      `/v1/students/${me.id}/portfolio.zip`,
    );
    expect(portfolio.status).toBe(200);
    const kept = unzipSync(new Uint8Array(await portfolio.arrayBuffer()));
    const answers = Object.entries(kept)
      .filter(([path]) => path.endsWith("/answer.txt"))
      .map(([, bytes]) => strFromU8(bytes));
    expect(
      answers.some((text) => text.includes("My answers are attached.")),
    ).toBe(true);
    // Families see handed-in work only once a teacher shares it.
    const family = await signedIn(
      "northwind",
      login("student").replace("student", "parent"),
    );
    const attemptId = (
      await teacher.api.coursework.record({ id: saved.id })
    ).work.find((row) => row.studentId === me.id)?.attemptId;
    if (!attemptId) throw new Error("no attempt handed in");
    expect(
      await rejection(family.coursework.sharedPiece({ attemptId })),
    ).toMatchObject({ code: "NOT_FOUND" });
    await teacher.api.coursework.act({
      assignmentId: saved.id,
      action: "share",
      studentIds: [me.id],
    });
    const piece = await family.coursework.sharedPiece({ attemptId });
    expect(JSON.stringify(piece.content)).toContain("My answers are attached.");
    expect(
      (await family.coursework.shared({ studentId: me.id })).pieces.map(
        (row) => row.attemptId,
      ),
    ).toContain(attemptId);
    await teacher.api.coursework.act({
      assignmentId: saved.id,
      action: "unshare",
      studentIds: [me.id],
    });
    expect(
      await rejection(family.coursework.sharedPiece({ attemptId })),
    ).toMatchObject({ code: "NOT_FOUND" });

    const office = await sessionFor("northwind", login("principal"));
    expect(
      (await raw("northwind", office.token, `/v1/students/${me.id}/portfolio.zip`))
        .status,
    ).toBe(200);
    const parent = await sessionFor(
      "northwind",
      login("student").replace("student", "parent"),
    );
    expect(
      (await raw("northwind", parent.token, `/v1/students/${me.id}/portfolio.zip`))
        .status,
    ).toBe(404);
  });
});

const briefWithMap = (fileId: string) => {
  const brief = plainContent("Use the map.");
  brief.root.children?.push({
    type: "file",
    version: 1,
    format: "",
    fileId,
    name: "map.txt",
    mime: "text/plain",
    bytes: 20,
  });
  return brief;
};
const fileHost = async (fileId: string) => {
  const { cell, tenants } = seeded();
  const tenantId = tenants[0]?.tenantId ?? "";
  const [row] = await cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "read",
    (tx) =>
      tx.execute<{ host_type: string; host_id: string }>(
        sql`select host_type, host_id from core.files
          where tenant_id = ${tenantId}::uuid and id = ${fileId}::uuid`,
      ),
  );
  return row;
};

describe("a class's file area", () => {
  test("keeps a brief's files for the class, shown again without a copy and copied for another class", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const other = (await teacher.api.coursework.options()).classes.find(
      (row) => row.classType === "scheduled" && row.id !== target.id,
    );
    if (!other) throw new Error("the Arabic teacher teaches one class only");
    const map = await upload(teacher, "document_media", "map.txt");

    const first = await teacher.api.coursework.save(
      draft(target.id, "Map work", { brief: briefWithMap(map) }),
    );
    expect(await fileHost(map)).toEqual({
      host_type: "class",
      host_id: target.id,
    });

    const again = await teacher.api.coursework.save(
      draft(target.id, "Map work again", { brief: briefWithMap(map) }),
    );
    const reopened = await teacher.api.coursework.editor({ id: again.id });
    expect(JSON.stringify(reopened.brief)).toContain(map);

    const elsewhere = await teacher.api.coursework.save(
      draft(other.id, "Map work elsewhere", { brief: briefWithMap(map) }),
    );
    const copied = await teacher.api.coursework.editor({ id: elsewhere.id });
    expect(JSON.stringify(copied.brief)).not.toContain(map);
    const copy = /"fileId":"([0-9a-f-]{36})"/.exec(
      JSON.stringify(copied.brief),
    )?.[1];
    expect(copy && (await fileHost(copy))).toEqual({
      host_type: "class",
      host_id: other.id,
    });

    // A student reads the area only through a brief they have been given;
    // a teacher of other classes not at all.
    const read = () => raw("northwind", student.token, `/v1/files/${map}/content`);
    expect((await read()).status).toBe(404);
    await teacher.api.coursework.publish({
      id: first.id,
      expectedVersion: first.version,
    });
    expect((await read()).status).toBe(200);
    const outsider = await sessionFor("northwind", login("teacher", 0, 2));
    expect(
      (await raw("northwind", outsider.token, `/v1/files/${map}/content`)).status,
    ).toBe(404);

    // Cards read a file's current name: a rename in the area shows to the
    // brief's readers, and nothing at all to people who may not open it.
    await teacher.api.files.renameInArea({
      area: { type: "class", id: target.id },
      id: map,
      name: "Map of the Nile.txt",
    });
    expect(
      (await student.api.files.facts({ ids: [map] })).files.map(
        (file) => file.name,
      ),
    ).toEqual(["Map of the Nile.txt"]);
    expect((await outsider.api.files.facts({ ids: [map] })).files).toEqual([]);
  });
});

describe("coursework on the student record", () => {
  test("staff who reach a student read their work; families keep to their own pages", async () => {
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const office = await signedIn("northwind", login("principal"));
    const record = await office.coursework.student({ studentId: me.id });
    const own = await student.api.coursework.mine();
    expect(record.rows.map((row) => row.assignmentId).toSorted()).toEqual(
      own.rows.map((row) => row.assignmentId).toSorted(),
    );
    const parent = await signedIn(
      "northwind",
      login("student").replace("student", "parent"),
    );
    expect(
      await rejection(parent.coursework.student({ studentId: me.id })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

const uuid = () => crypto.randomUUID();

describe("quizzes", () => {
  const common = { hints: [], explanation: "Because.", tries: null };

  async function quizFor(
    reveal: "answers" | "feedback" | "marks" | "returned",
  ) {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const right = uuid();
    const choice = {
      ...common,
      id: uuid(),
      type: "choice" as const,
      prompt: "Which is a noun?",
      points: 2,
      options: [
        { id: right, text: "Book", feedback: "" },
        { id: uuid(), text: "Run", feedback: "A verb." },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
    };
    const typed = {
      ...common,
      id: uuid(),
      type: "text" as const,
      prompt: "The capital of Egypt?",
      points: 2,
      answers: ["القاهرة"],
      caseSensitive: false,
      closeEnough: false,
      tehMarbuta: true,
    };
    const written = {
      ...common,
      id: uuid(),
      type: "written" as const,
      prompt: "Describe your street.",
      points: 4,
      wordLimit: null,
    };
    const saved = await teacher.api.coursework.save(
      draft(target.id, `Quiz ${reveal}`, {
        submissionFormat: "quiz",
        points: null,
        brief: briefWithQuiz(plainContent("Answer every question."), {
          version: 2,
          blocks: [choice, typed, written],
        }),
        quiz: { attempts: 2, keep: "highest", reveal, shuffle: false },
      }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    return { teacher, student, me, saved, choice, typed, written, right };
  }

  test("a quiz is marked at hand-in, its written answer waits for the teacher, and the best attempt counts", async () => {
    const { teacher, student, me, saved, choice, typed, written, right } =
      await quizFor("answers");
    const editor = await teacher.api.coursework.editor({ id: saved.id });
    expect(editor.points).toBe(8);
    expect(editor.quiz?.started).toBe(false);

    const open = await student.api.coursework.work({ id: saved.id });
    expect(open.quiz?.open).toBe(true);
    // The brief holds the questions and their keys; students read only the
    // words before the first question, and cannot watch the brief live.
    expect(JSON.stringify(open.brief)).toContain("Answer every question.");
    expect(JSON.stringify(open.brief)).not.toContain("Which is a noun?");
    expect(
      await rejection(
        student.api.documents.collaborate({
          hostType: "assignment",
          hostId: saved.id,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(open.quiz?.blocks.map((block) => block.type)).toEqual([
      "choice",
      "text",
      "written",
    ]);
    expect(JSON.stringify(open.quiz?.blocks)).not.toContain("correctOptionIds");
    expect(JSON.stringify(open.quiz?.blocks)).not.toContain("القاهرة");
    const answer = (blockId: string, response: LessonResponse) =>
      student.api.coursework.saveQuizAnswer({
        assignmentId: saved.id,
        blockId,
        response,
      });
    await answer(choice.id, { type: "choice", optionIds: [right] });
    await answer(typed.id, { type: "text", text: "Giza" });
    await answer(written.id, { type: "written", text: "Trees and a bakery." });
    expect(
      await rejection(
        teacher.api.coursework.save(
          draft(editor.classId, "Quiz answers", {
            id: saved.id,
            expectedVersion: editor.version,
            submissionFormat: "quiz",
            points: null,
            brief: briefWithQuiz(plainContent("Answer every question."), {
              version: 2,
              blocks: [choice],
            }),
            quiz: editor.quiz,
          }),
        ),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "coursework.quiz_started" });

    const first = await student.api.coursework.work({ id: saved.id });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: first.submission.version,
    });
    const after = await student.api.coursework.work({ id: saved.id });
    expect(after.quiz?.results[0]).toMatchObject({ score: 2, pending: true });
    expect(after.quiz?.results[0]?.checks?.[typed.id]).toMatchObject({
      correct: false,
      key: ["القاهرة"],
    });
    expect(after.state).toBe("handed_in");
    expect(after.quiz?.attempt).toBe(2);
    expect(after.quiz?.open).toBe(true);

    const grading = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    const attempt = grading.quiz?.attempts[0];
    if (!attempt) throw new Error("no attempt");
    expect(attempt.checks[written.id]).toMatchObject({ marked: false });
    expect(
      await rejection(
        teacher.api.coursework.markQuizAnswer({
          attemptIds: [attempt.attemptId],
          blockId: written.id,
          points: 5,
        }),
      ),
    ).toMatchObject({ message: "learning.points_over" });
    const toMark = await teacher.api.coursework.quizAnswers({
      assignmentId: saved.id,
    });
    expect(toMark.questions.map((question) => question.blockId)).toEqual([
      written.id,
    ]);
    expect(
      toMark.answers.filter((each) => each.blockId === written.id),
    ).toMatchObject([
      { attemptId: attempt.attemptId, studentId: me.id, marked: false },
    ]);
    await teacher.api.coursework.markQuizAnswer({
      attemptIds: [attempt.attemptId],
      blockId: written.id,
      points: 3,
      feedback: "Name the bakery.",
    });
    expect(
      (
        await teacher.api.coursework.quizAnswers({ assignmentId: saved.id })
      ).answers.find((each) => each.attemptId === attempt.attemptId),
    ).toMatchObject({
      marked: true,
      fraction: Math.round((3 / written.points) * 10000) / 10000,
      feedback: "Name the bakery.",
    });
    const marked = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    expect(marked.attempts[0]?.assessment).toMatchObject({ score: 5 });

    await answer(choice.id, { type: "choice", optionIds: [right] });
    await answer(typed.id, { type: "text", text: "القاهره" });
    const second = await student.api.coursework.work({ id: saved.id });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: second.submission.version,
    });
    const done = await student.api.coursework.work({ id: saved.id });
    // Attempt one earned 5 once marked, attempt two 4 with no written answer.
    expect(done.quiz?.results.map((result) => result.score)).toEqual([5, 4]);
    expect(done.quiz?.open).toBe(false);
    expect(done.state).toBe("returned");
    expect(done.attempts[1]?.assessment).toMatchObject({ score: 5 });
    expect(
      await rejection(
        student.api.coursework.saveQuizAnswer({
          assignmentId: saved.id,
          blockId: choice.id,
          response: { type: "choice", optionIds: [right] },
        }),
      ),
    ).toMatchObject({ message: "coursework.closed" });
  });

  test("a quiz's code exercise is run when kept and marked at hand-in, its results kept back till then", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const exercise = {
      ...common,
      id: uuid(),
      type: "program" as const,
      prompt: "Print the number doubled.",
      points: 4,
      language: "python" as const,
      starter: "",
      tests: [
        { id: uuid(), input: "2", expected: "4", hidden: false },
        { id: uuid(), input: "5", expected: "10", hidden: true },
      ],
    };
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Code quiz", {
        submissionFormat: "quiz",
        points: null,
        brief: briefWithQuiz(plainContent("Write the program."), {
          version: 2,
          blocks: [exercise],
        }),
        quiz: {
          attempts: 1,
          keep: "highest",
          reveal: "answers",
          shuffle: false,
        },
      }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(
      await rejection(
        student.api.coursework.saveQuizAnswer({
          assignmentId: saved.id,
          blockId: exercise.id,
          response: { type: "program", code: "print(4)" },
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    await student.api.coursework.saveQuizProgram({
      assignmentId: saved.id,
      blockId: exercise.id,
      code: "print(4)",
    });
    const open = await student.api.coursework.work({ id: saved.id });
    expect(open.quiz?.drafts[exercise.id]).toEqual({
      type: "program",
      code: "print(4)",
    });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: open.submission.version,
    });
    const after = await student.api.coursework.work({ id: saved.id });
    // print(4) passes the test it was written for and fails the hidden one.
    expect(after.quiz?.results[0]?.score).toBe(2);
    expect(after.quiz?.results[0]?.checks?.[exercise.id]).toMatchObject({
      fraction: 0.5,
    });
  });

  test("a quiz draws its questions from the bank for each attempt and marks what it drew", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const tag = `drawn ${uuid().slice(0, 8)}`;
    const map = await upload(teacher, "document_media", "map.txt");
    const keep = async (
      prompt: string,
      scope: "mine" | "school",
      picture: boolean,
    ) => {
      const yes = uuid();
      const content = contentOfLesson({
        version: 2,
        blocks: [
          {
            ...common,
            id: uuid(),
            type: "choice",
            prompt,
            points: 1,
            options: [
              {
                id: yes,
                text: "Yes",
                feedback: "",
                ...(picture ? { picture: { fileId: map, alt: "A map" } } : {}),
              },
              { id: uuid(), text: "No", feedback: "" },
            ],
            correctOptionIds: [yes],
            multiple: false,
            shuffle: false,
          },
        ],
      });
      if (!content) throw new Error("question could not become a document");
      return teacher.api.bank.save({
        id: "",
        expectedVersion: 0,
        scope,
        tags: [tag],
        content,
      });
    };
    await keep("Is two even?", "mine", true);
    await keep("Is four even?", "school", false);
    expect(await teacher.api.bank.tags()).toContainEqual({
      tag,
      questions: 2,
    });
    const typed = {
      ...common,
      id: uuid(),
      type: "text" as const,
      prompt: "The capital of Egypt?",
      points: 2,
      answers: ["القاهرة"],
      caseSensitive: false,
      closeEnough: false,
      tehMarbuta: true,
    };
    const draw = { id: uuid(), type: "draw" as const, tag, points: 3 };
    const quiz = (count: number, extra: object) =>
      draft(target.id, "Drawn quiz", {
        submissionFormat: "quiz",
        points: null,
        brief: briefWithQuiz(plainContent("Answer every question."), {
          version: 2,
          blocks: [typed, { ...draw, count }],
        }),
        quiz: {
          attempts: 2,
          keep: "highest",
          reveal: "answers",
          shuffle: false,
        },
        ...extra,
      });
    const saved = await teacher.api.coursework.save(quiz(3, {}));
    expect(
      await rejection(
        teacher.api.coursework.publish({
          id: saved.id,
          expectedVersion: saved.version,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "coursework.draw_short" });
    const fewer = await teacher.api.coursework.save(
      quiz(2, { id: saved.id, expectedVersion: saved.version }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: fewer.version,
    });
    const editor = await teacher.api.coursework.editor({ id: saved.id });
    expect(editor.points).toBe(2 + 2 * 3);

    // Nothing is drawn, nor its pictures open, until the attempt opens.
    const picture = (token: string) =>
      raw("northwind", token, `/v1/files/${map}/content`);
    expect((await picture(student.token)).status).toBe(404);
    const unopened = await student.api.coursework.work({ id: saved.id });
    expect(unopened.quiz).toMatchObject({ undrawn: true, total: 8 });
    expect(unopened.quiz?.blocks.map((block) => block.id)).toEqual([typed.id]);
    await student.api.coursework.startQuiz({ assignmentId: saved.id });
    await student.api.coursework.startQuiz({ assignmentId: saved.id });
    const open = await student.api.coursework.work({ id: saved.id });
    expect(open.quiz?.undrawn).toBe(false);
    const drawn = (open.quiz?.blocks ?? []).flatMap((block) =>
      block.type === "choice" ? [block] : [],
    );
    expect(drawn.map((block) => block.points)).toEqual([3, 3]);
    expect(new Set(drawn.map((block) => block.id)).size).toBe(2);
    expect(JSON.stringify(open.quiz?.blocks)).not.toContain("correctOptionIds");
    expect((await picture(student.token)).status).toBe(200);
    const outsider = await sessionFor("northwind", login("teacher", 0, 2));
    expect((await picture(outsider.token)).status).toBe(404);
    expect(
      (await teacher.api.coursework.editor({ id: saved.id })).quiz?.started,
    ).toBe(true);
    expect(
      await rejection(
        teacher.api.coursework.save(
          quiz(1, { id: saved.id, expectedVersion: editor.version }),
        ),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "coursework.quiz_started" });

    for (const block of drawn)
      await student.api.coursework.saveQuizAnswer({
        assignmentId: saved.id,
        blockId: block.id,
        response: {
          type: "choice",
          optionIds: block.options
            .filter((option) => option.text === "Yes")
            .map((option) => option.id),
        },
      });
    await student.api.coursework.saveQuizAnswer({
      assignmentId: saved.id,
      blockId: typed.id,
      response: { type: "text", text: "القاهرة" },
    });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: open.submission.version,
    });
    const after = await student.api.coursework.work({ id: saved.id });
    const asked = open.quiz?.blocks.map((block) => block.id);
    expect(after.quiz?.results[0]).toMatchObject({ score: 8 });
    expect(after.quiz?.results[0]?.blocks.map((block) => block.id)).toEqual(
      asked,
    );
    expect(after.quiz?.undrawn).toBe(true);
    const grading = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    expect(grading.quiz?.attempts[0]).toMatchObject({ score: 8 });
    expect(grading.quiz?.attempts[0]?.blocks.map((block) => block.id)).toEqual(
      asked,
    );

    // The next attempt draws again; the same question keeps its id.
    await student.api.coursework.startQuiz({ assignmentId: saved.id });
    const again = await student.api.coursework.work({ id: saved.id });
    expect(again.quiz?.attempt).toBe(2);
    expect(again.quiz?.blocks.map((block) => block.id).toSorted()).toEqual(
      asked?.toSorted(),
    );
  });

  test("a timed quiz shows its questions once begun, stops taking answers when time runs out, and hands itself in", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const right = uuid();
    const choice = {
      ...common,
      id: uuid(),
      type: "choice" as const,
      prompt: "Which is a noun?",
      points: 2,
      options: [
        { id: right, text: "Book", feedback: "" },
        { id: uuid(), text: "Run", feedback: "" },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
    };
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Timed quiz", {
        submissionFormat: "quiz",
        points: null,
        brief: briefWithQuiz(plainContent("Answer in time."), {
          version: 2,
          blocks: [choice],
        }),
        quiz: {
          attempts: 2,
          keep: "highest",
          reveal: "answers",
          shuffle: false,
          timeLimit: 10,
        },
      }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(
      (await teacher.api.coursework.editor({ id: saved.id })).quiz?.timeLimit,
    ).toBe(10);

    const before = await student.api.coursework.work({ id: saved.id });
    expect(before.quiz?.timing).toMatchObject({
      minutes: 10,
      startedAt: null,
      endsAt: null,
    });
    expect(before.quiz?.blocks).toEqual([]);
    await student.api.coursework.startQuiz({ assignmentId: saved.id });
    const begun = await student.api.coursework.work({ id: saved.id });
    const { startedAt, endsAt } = begun.quiz?.timing ?? {};
    if (!startedAt || !endsAt) throw new Error("the clock did not begin");
    expect(Date.parse(endsAt) - Date.parse(startedAt)).toBe(10 * 60_000);
    expect(begun.quiz?.blocks.map((block) => block.id)).toEqual([choice.id]);
    // Beginning again keeps the clock it began with.
    await student.api.coursework.startQuiz({ assignmentId: saved.id });
    expect(
      (await student.api.coursework.work({ id: saved.id })).quiz?.timing
        ?.endsAt,
    ).toBe(endsAt);
    const answer = () =>
      student.api.coursework.saveQuizAnswer({
        assignmentId: saved.id,
        blockId: choice.id,
        response: { type: "choice", optionIds: [right] },
      });
    await answer();

    // Eleven minutes on, the attempt takes no more answers and the worker
    // hands it in as it stood.
    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const rewind = () =>
      cell.withWorker(
        { tenantId, requestId: uuid(), actor: { kind: "system" } },
        "write",
        (tx) =>
          tx.execute(sql`
            update core.quiz_sittings
            set started_at = started_at - interval '11 minutes',
                ends_at = ends_at - interval '11 minutes'
            where tenant_id = ${tenantId}::uuid and closed_at is null
              and submission_id in (select id from core.submissions
                where tenant_id = ${tenantId}::uuid and assignment_id = ${saved.id}::uuid)`),
      );
    await rewind();
    expect(await rejection(answer())).toMatchObject({
      code: "CONFLICT",
      message: "coursework.time_up",
    });
    expect(
      (await student.api.coursework.work({ id: saved.id })).quiz?.timing
        ?.timeUp,
    ).toBe(true);
    expect(await handInTimedOut(cell, tenantId, new Date())).toBeGreaterThan(0);
    const handed = await student.api.coursework.work({ id: saved.id });
    expect(handed.quiz?.results[0]).toMatchObject({ score: 2 });
    expect(handed.quiz?.timing).toMatchObject({ startedAt: null });
    expect(await handInTimedOut(cell, tenantId, new Date())).toBe(0);

    // A student may still hand in an attempt whose time ran out themselves.
    await student.api.coursework.startQuiz({ assignmentId: saved.id });
    await rewind();
    const second = await student.api.coursework.work({ id: saved.id });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: second.submission.version,
    });
    const done = await student.api.coursework.work({ id: saved.id });
    expect(done.quiz?.results.map((result) => result.score)).toEqual([2, 0]);
    expect(done.quiz?.open).toBe(false);
  });

  test("a student's access arrangements give them extra time, a reader, a choice fewer and later due dates", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const none = await principal.records.arrangements({ studentId: me.id });
    expect(none).toMatchObject({ version: 0, canWrite: true });
    const arrange = (
      expectedVersion: number,
      changes: Partial<typeof none.arrangements>,
    ) =>
      principal.records.saveArrangements({
        studentId: me.id,
        expectedVersion,
        arrangements: { ...none.arrangements, ...changes },
      });
    const first = await arrange(0, {
      extraTime: 50,
      readAloud: true,
      fewerChoices: true,
      extensionDays: 2,
    });
    const seen = await teacher.api.records.arrangements({ studentId: me.id });
    expect(seen).toMatchObject({
      canWrite: false,
      arrangements: { extraTime: 50, readAloud: true, extensionDays: 2 },
    });
    expect(
      await rejection(
        teacher.api.records.saveArrangements({
          studentId: me.id,
          expectedVersion: first.version,
          arrangements: seen.arrangements,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    const right = uuid();
    const choice = {
      ...common,
      id: uuid(),
      type: "choice" as const,
      prompt: "Which is a noun?",
      points: 2,
      options: [
        { id: right, text: "Book", feedback: "" },
        { id: uuid(), text: "Run", feedback: "" },
        { id: uuid(), text: "Quickly", feedback: "" },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
    };
    // Due times are kept to the second.
    const due = new Date(
      Math.floor(Date.now() / 1000) * 1000 + 7 * 86_400_000,
    ).toISOString();
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Arranged quiz", {
        submissionFormat: "quiz",
        points: null,
        dueAt: due,
        brief: briefWithQuiz(plainContent("Answer in time."), {
          version: 2,
          blocks: [choice],
        }),
        quiz: {
          attempts: 2,
          keep: "highest",
          reveal: "answers",
          shuffle: false,
          timeLimit: 10,
        },
      }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const before = await student.api.coursework.work({ id: saved.id });
    expect(before.quiz).toMatchObject({
      readAloud: true,
      timing: { minutes: 15, extra: true },
    });
    // Their own due date is two days on from everyone else's.
    expect(Date.parse(before.assignment.dueAt ?? "") - Date.parse(due)).toBe(
      2 * 86_400_000,
    );
    await student.api.coursework.startQuiz({ assignmentId: saved.id });
    const begun = await student.api.coursework.work({ id: saved.id });
    const { startedAt, endsAt } = begun.quiz?.timing ?? {};
    expect(Date.parse(endsAt ?? "") - Date.parse(startedAt ?? "")).toBe(
      15 * 60_000,
    );
    const [asked] = begun.quiz?.blocks ?? [];
    if (asked?.type !== "choice") throw new Error("no choice question");
    expect(asked.options).toHaveLength(2);
    expect(asked.options.map((option) => option.id)).toContain(right);

    // A teacher's own date for the student stands; taking it back gives the
    // arranged one again.
    await teacher.api.coursework.extend({
      assignmentId: saved.id,
      studentIds: [me.id],
      dueAt: new Date(Date.parse(due) + 5 * 86_400_000).toISOString(),
    });
    const extended = await student.api.coursework.work({ id: saved.id });
    expect(Date.parse(extended.assignment.dueAt ?? "") - Date.parse(due)).toBe(
      5 * 86_400_000,
    );
    await teacher.api.coursework.extend({
      assignmentId: saved.id,
      studentIds: [me.id],
      dueAt: "",
    });
    const arranged = await student.api.coursework.work({ id: saved.id });
    expect(Date.parse(arranged.assignment.dueAt ?? "") - Date.parse(due)).toBe(
      2 * 86_400_000,
    );

    // As long as they need: the clock already running keeps its time, and
    // the next attempt runs without one.
    await arrange(first.version, { unlimitedTime: true });
    const unlimited = await student.api.coursework.work({ id: saved.id });
    expect(unlimited.quiz?.timing?.minutes).toBe(15);
    expect(Date.parse(unlimited.assignment.dueAt ?? "") - Date.parse(due)).toBe(
      0,
    );
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: unlimited.submission.version,
    });
    const next = await student.api.coursework.work({ id: saved.id });
    expect(next.quiz?.timing).toBe(null);
    expect(next.quiz?.blocks.map((block) => block.id)).toEqual([choice.id]);
  });

  test("a quiz that shows which were wrong gives the feedback on each choice but not the answers", async () => {
    const { student, saved, choice, typed } = await quizFor("feedback");
    const wrong = choice.options[1]?.id ?? "";
    await student.api.coursework.saveQuizAnswer({
      assignmentId: saved.id,
      blockId: choice.id,
      response: { type: "choice", optionIds: [wrong] },
    });
    await student.api.coursework.saveQuizAnswer({
      assignmentId: saved.id,
      blockId: typed.id,
      response: { type: "text", text: "Giza" },
    });
    const open = await student.api.coursework.work({ id: saved.id });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: open.submission.version,
    });
    const after = await student.api.coursework.work({ id: saved.id });
    const checks = after.quiz?.results[0]?.checks;
    expect(checks?.[choice.id]).toMatchObject({
      correct: false,
      feedback: ["A verb."],
      key: null,
      explanation: null,
    });
    expect(checks?.[typed.id]).toMatchObject({ correct: false, key: null });
    expect(JSON.stringify(checks)).not.toContain("القاهرة");
  });

  test("a practice quiz checks each answer at once with its tries and hints, and marks what they left", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const right = uuid();
    const wrong = uuid();
    const choice = {
      id: uuid(),
      type: "choice" as const,
      prompt: "Which is a noun?",
      points: 3,
      hints: ["A thing you can touch."],
      explanation: "A book is a thing.",
      tries: 2,
      options: [
        { id: right, text: "Book", feedback: "" },
        { id: wrong, text: "Run", feedback: "A verb." },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
    };
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Practice nouns", {
        submissionFormat: "quiz",
        points: null,
        brief: briefWithQuiz(plainContent("Try each one."), {
          version: 2,
          blocks: [choice],
        }),
        quiz: {
          attempts: null,
          keep: "highest",
          reveal: "answers",
          shuffle: false,
          practice: true,
        },
      }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const opened = await student.api.coursework.work({ id: saved.id });
    expect(opened.quiz).toMatchObject({
      practice: true,
      practised: { [choice.id]: { tries: 0, askable: 1, key: null } },
    });
    const step = (
      kind: { kind: "hint" } | { kind: "answer"; response: LessonResponse },
    ) =>
      student.api.coursework.practiseQuiz({
        assignmentId: saved.id,
        blockId: choice.id,
        step: kind,
      });
    const missed = await step({
      kind: "answer",
      response: { type: "choice", optionIds: [wrong] },
    });
    expect(missed.check).toMatchObject({
      correct: false,
      feedback: ["A verb."],
      hints: ["A thing you can touch."],
      triesLeft: 1,
      key: null,
    });
    const found = await step({
      kind: "answer",
      response: { type: "choice", optionIds: [right] },
    });
    expect(found.check).toMatchObject({ correct: true, key: [right] });
    expect(await rejection(step({ kind: "hint" }))).toMatchObject({
      message: "learning.settled",
    });
    const before = await student.api.coursework.work({ id: saved.id });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: before.submission.version,
    });
    const after = await student.api.coursework.work({ id: saved.id });
    // Right on the second try keeps two thirds of its three points.
    expect(after.quiz?.results[0]?.score).toBeCloseTo(2, 1);
  });

  test("a quiz shown only when returned keeps its results back until then", async () => {
    const { teacher, student, me, saved, choice, right } =
      await quizFor("returned");
    await student.api.coursework.saveQuizAnswer({
      assignmentId: saved.id,
      blockId: choice.id,
      response: { type: "choice", optionIds: [right] },
    });
    const open = await student.api.coursework.work({ id: saved.id });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: open.submission.version,
    });
    const hidden = await student.api.coursework.work({ id: saved.id });
    expect(hidden.quiz?.results[0]).toMatchObject({
      score: null,
      checks: null,
    });
    await teacher.api.coursework.act({
      assignmentId: saved.id,
      action: "return",
      studentIds: [me.id],
    });
    const shown = await student.api.coursework.work({ id: saved.id });
    expect(shown.quiz?.results[0]?.score).toBe(2);
    expect(shown.quiz?.results[0]?.checks?.[choice.id]).toMatchObject({
      correct: true,
    });
  });
});

describe("standards a quiz gives evidence on", () => {
  test("a quiz's marked answers count toward the standards its questions carry, and marking again replaces them", async () => {
    const office = await signedIn("northwind", login("principal"));
    const framework = await office.standards.saveFramework({
      id: "",
      expectedVersion: 0,
      title: `Evidence ${uuid()}`,
      description: "",
    });
    const tag = (code: string) =>
      office.standards.saveStandard({
        frameworkId: framework.id,
        id: "",
        expectedVersion: 0,
        parentId: "",
        code,
        statement: `Standard ${code}.`,
        itemType: "",
      });
    const nouns = await tag("EV.1");
    const writing = await tag("EV.2");

    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const right = uuid();
    const common = { hints: [], explanation: "", tries: null };
    const choice = {
      ...common,
      id: uuid(),
      type: "choice" as const,
      prompt: "Which is a noun?",
      points: 1,
      options: [
        { id: right, text: "Book", feedback: "" },
        { id: uuid(), text: "Run", feedback: "" },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
      standards: [nouns.id],
    };
    const written = {
      ...common,
      id: uuid(),
      type: "written" as const,
      prompt: "Write a sentence with two nouns.",
      points: 4,
      wordLimit: null,
      // One the school does not have is left out rather than refused.
      standards: [nouns.id, writing.id, uuid()],
    };
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Nouns quiz", {
        submissionFormat: "quiz",
        points: null,
        brief: briefWithQuiz(plainContent("Answer both."), {
          version: 2,
          blocks: [choice, written],
        }),
        quiz: {
          attempts: 1,
          keep: "highest",
          reveal: "answers",
          shuffle: false,
        },
      }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    await student.api.coursework.saveQuizAnswer({
      assignmentId: saved.id,
      blockId: choice.id,
      response: { type: "choice", optionIds: [right] },
    });
    await student.api.coursework.saveQuizAnswer({
      assignmentId: saved.id,
      blockId: written.id,
      response: { type: "written", text: "The cat sat on the mat." },
    });
    const work = await student.api.coursework.work({ id: saved.id });
    await student.api.coursework.handIn({
      assignmentId: saved.id,
      expectedVersion: work.submission.version,
    });

    const progress = async () => {
      const shown = await teacher.api.standards.classProgress({
        classId: target.id,
      });
      return Object.fromEntries(
        shown.mastery
          .filter((row) => row.studentId === me.id)
          .map((row) => [row.standardId, row]),
      );
    };
    // The written answer waits for its teacher, so only the choice counts.
    expect(await progress()).toEqual({
      [nouns.id]: {
        studentId: me.id,
        standardId: nouns.id,
        level: "developing",
        score: 1,
        occasions: 1,
      },
    });

    const grading = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    const attempt = grading.quiz?.attempts[0];
    if (!attempt) throw new Error("no attempt");
    const mark = (points: number) =>
      teacher.api.coursework.markQuizAnswer({
        attemptIds: [attempt.attemptId],
        blockId: written.id,
        points,
      });
    await mark(2);
    const marked = await progress();
    // One sitting: its two answers on nouns make one occasion.
    expect(marked[nouns.id]).toMatchObject({ score: 0.75, occasions: 1 });
    expect(marked[writing.id]).toMatchObject({
      level: "developing",
      score: 0.5,
    });
    await mark(4);
    expect((await progress())[writing.id]).toMatchObject({ score: 1 });

    const own = await student.api.standards.studentProgress({});
    expect(own.standards.map((row) => row.code)).toEqual(["EV.1", "EV.2"]);
    expect(
      await rejection(
        student.api.standards.classProgress({ classId: target.id }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    await office.standards.removeFramework({ id: framework.id });
    expect((await progress())[nouns.id]).toBeUndefined();
  });
});

describe("using an assignment again", () => {
  test("an assignment is set again as a fresh draft, its brief and marking kept and its dates left to set", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Map your street", {
        brief: plainContent("Draw your street and label three places."),
        dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        points: 12,
      }),
    );
    // Found among the teacher's work by its title, whatever its year.
    expect(
      (await teacher.api.coursework.reusable({ q: "map your" })).map(
        (row) => row.id,
      ),
    ).toContain(saved.id);
    const again = await teacher.api.coursework.reuse({
      id: saved.id,
      classId: target.id,
    });
    expect(again.id).not.toBe(saved.id);
    const editor = await teacher.api.coursework.editor({ id: again.id });
    expect(editor).toMatchObject({
      title: "Map your street",
      state: "draft",
      points: 12,
      dueAt: null,
      audience: "class",
    });
    expect(JSON.stringify(editor.brief)).toContain("label three places");
    const stranger = await englishTeacher();
    expect(
      await rejection(
        stranger.coursework.reuse({ id: saved.id, classId: target.id }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("discussions", () => {
  test("students answer first, then read and reply; posting hands the work in and the teacher moderates and marks", async () => {
    const teacher = await arabicTeacher();
    const first = await sessionFor("northwind", login("student"));
    const me = await first.api.identity.currentUser();
    const target = await classOfStudent(teacher.api, me.id);
    const { roster } = await teacher.api.coursework.groups({
      classId: target.id,
    });
    let second: Awaited<ReturnType<typeof sessionFor>> | null = null;
    let classmate = "";
    for (let index = 1; index < 40 && !second; index++) {
      const session = await sessionFor("northwind", login("student", 0, index));
      const who = await session.api.identity.currentUser();
      if (who.id !== me.id && roster.some((pupil) => pupil.id === who.id)) {
        second = session;
        classmate = who.id;
      }
    }
    if (!second) throw new Error("no classmate signs in");
    const saved = await teacher.api.coursework.save(
      draft(target.id, "Is the river a friend?", {
        submissionFormat: "discussion",
        discussion: { postFirst: true, replies: 1 },
      }),
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const opening = await teacher.api.coursework.post({
      assignmentId: saved.id,
      content: plainContent("Think of the Nile in your answer."),
    });
    const sketch = await upload(second, "document_media", "delta.txt");
    const floods = plainContent("A friend that floods.");
    floods.root.children?.push({
      type: "file",
      version: 1,
      format: "",
      fileId: sketch,
      name: "delta.txt",
      mime: "text/plain",
      bytes: 22,
    });
    const theirs = await second.api.coursework.post({
      assignmentId: saved.id,
      content: floods,
    });
    const opens = async (token: string) =>
      (await raw("northwind", token, `/v1/files/${sketch}/content`)).status;
    expect(await opens(first.token)).toBe(404);
    expect(await opens(teacher.token)).toBe(200);
    // Before answering, the student sees the teacher's post but no classmate's.
    const waiting = await first.api.coursework.discussion({
      assignmentId: saved.id,
    });
    expect(waiting.waiting).toBe(true);
    expect(waiting.posts.map((item) => item.id)).toEqual([opening.id]);
    expect(
      await rejection(
        first.api.coursework.post({
          assignmentId: saved.id,
          parentId: opening.id,
          content: plainContent("Replying first."),
        }),
      ),
    ).toMatchObject({ message: "coursework.post_first" });
    expect(
      await rejection(
        first.api.coursework.post({
          assignmentId: saved.id,
          content: plainContent("   "),
        }),
      ),
    ).toMatchObject({ message: "coursework.post_empty" });

    const mine = await first.api.coursework.post({
      assignmentId: saved.id,
      content: plainContent("It gives us water and farms."),
    });
    expect((await first.api.coursework.work({ id: saved.id })).state).toBe(
      "handed_in",
    );
    expect(await opens(first.token)).toBe(200);
    const reply = await first.api.coursework.post({
      assignmentId: saved.id,
      parentId: theirs.id,
      content: plainContent("Floods made the soil rich."),
    });
    const after = await first.api.coursework.discussion({
      assignmentId: saved.id,
    });
    expect(after).toMatchObject({ waiting: false, posted: 1, replied: 1 });
    expect(after.posts.find((item) => item.id === reply.id)?.parentId).toBe(
      theirs.id,
    );
    expect(
      await rejection(
        second.api.coursework.editPost({
          id: mine.id,
          content: plainContent("Not mine to change."),
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    // A hidden post leaves the class's view; its author still reads it.
    await teacher.api.coursework.hidePost({ id: theirs.id, hidden: true });
    const hidden = (
      await first.api.coursework.discussion({ assignmentId: saved.id })
    ).posts.find((item) => item.id === theirs.id);
    expect(hidden).toMatchObject({ hidden: true, content: null });
    expect(await opens(first.token)).toBe(404);
    const own = (
      await second.api.coursework.discussion({ assignmentId: saved.id })
    ).posts.find((item) => item.id === theirs.id);
    expect(own?.content).not.toBeNull();

    const marking = await teacher.api.coursework.grading({
      assignmentId: saved.id,
      studentId: me.id,
    });
    expect(marking.discussion).toMatchObject({
      replies: 1,
      posted: 1,
      replied: 1,
    });
    expect(
      marking.discussion?.posts.find((item) => item.id === reply.id)?.answers
        ?.excerpt,
    ).toBe("A friend that floods. delta.txt");
    expect(marking.attempts).toHaveLength(1);
    const record = await teacher.api.coursework.editor({ id: saved.id });
    expect(
      await rejection(
        teacher.api.coursework.save({
          ...draft(target.id, "Is the river a friend?"),
          id: saved.id,
          expectedVersion: record.version,
        }),
      ),
    ).toMatchObject({ message: "coursework.format_fixed" });
    expect(classmate).not.toBe("");
  });
});
