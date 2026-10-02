import type { LessonResponse } from "@faridalms/domain/learning";

import { plainContent } from "@faridalms/domain/content-conversion";
import { briefWithQuiz } from "@faridalms/domain/lesson-content";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";

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
      { id: made.id, anchor, body: "A warm opening.", editedAt: null },
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
  const common = { hint: "", explanation: "Because.", tries: null };

  async function quizFor(reveal: "answers" | "marks" | "returned") {
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
          attemptId: attempt.attemptId,
          blockId: written.id,
          points: 5,
        }),
      ),
    ).toMatchObject({ message: "learning.points_over" });
    await teacher.api.coursework.markQuizAnswer({
      attemptId: attempt.attemptId,
      blockId: written.id,
      points: 3,
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
