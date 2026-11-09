import { plainContent } from "@faridalms/domain/content-conversion";
import {
  briefWithQuiz,
  contentOfLesson,
} from "@faridalms/domain/lesson-content";
import { describe, expect, test } from "bun:test";

import { login, raw, rejection, sessionFor, signedIn } from "./harness";

type Session = Awaited<ReturnType<typeof sessionFor>>;

const passage = "The Nile is long.\nBoats sail on it to Cairo.";

const readingQuestion = (id: string) => ({
  id,
  type: "written" as const,
  prompt: "Read this passage aloud.",
  points: 2,
  hints: [],
  explanation: "",
  tries: null,
  wordLimit: null,
  recordSeconds: 180 as const,
  passage,
});

async function recording(session: Session) {
  const sound = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])]);
  const file = await session.api.files.initiate({
    purpose: "document_media",
    name: "reading.webm",
    mediaType: "audio/webm",
    sizeBytes: sound.size,
  });
  await raw("northwind", session.token, `/v1/files/${file.id}/content`, {
    method: "PUT",
    body: sound,
  });
  return file.id;
}

/** The Arabic class the seeded student sits in. */
async function classOfStudent(teacher: Session, studentId: string) {
  const { classes } = await teacher.api.coursework.options();
  for (const row of classes.filter((item) => item.classType === "scheduled")) {
    const { roster } = await teacher.api.coursework.groups({ classId: row.id });
    if (roster.some((pupil) => pupil.id === studentId)) return row.id;
  }
  throw new Error("the seeded student takes no Arabic class");
}

describe("reading norms", () => {
  test("a school starts from the published English norms, writes its own, and goes back to them", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const start = await principal.reading.norms();
    expect(start.en).toMatchObject({ own: false, version: 0 });
    expect(start.en.rows).toHaveLength(18);
    expect(start.ar).toEqual({ rows: [], own: false, version: 0 });
    const row = {
      grade: "grade_2",
      season: "spring" as const,
      p10: 30,
      p25: 45,
      p50: 60,
      p75: 75,
      p90: 90,
    };
    const rows = [row];
    expect(
      await rejection(
        principal.reading.saveNorms({
          language: "ar",
          rows: [row, row],
          expectedVersion: 0,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await rejection(
        principal.reading.saveNorms({
          language: "ar",
          rows: [{ ...row, p75: 40 }],
          expectedVersion: 0,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    const saved = await principal.reading.saveNorms({
      language: "ar",
      rows,
      expectedVersion: 0,
    });
    expect(
      await rejection(
        principal.reading.saveNorms({
          language: "ar",
          rows,
          expectedVersion: 0,
        }),
      ),
    ).toMatchObject({ message: "conflict.version" });
    expect((await principal.reading.norms()).ar).toEqual({
      rows,
      own: true,
      version: saved.version,
    });
    await principal.reading.resetNorms({ language: "ar" });
    expect((await principal.reading.norms()).ar.own).toBe(false);
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    expect(await rejection(teacher.api.reading.norms())).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("reading aloud over the year", () => {
  test("readings marked in lessons and quizzes come together, against the grade's norm, with the words to practise", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const classId = await classOfStudent(teacher, me.id);

    // A lesson's reading, marked word by word with its prosody.
    const module = await teacher.api.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Reading the river",
      summary: "",
      classIds: [classId],
      prerequisiteId: "",
      sequential: false,
    });
    const inLesson = crypto.randomUUID();
    const content = contentOfLesson({
      version: 2,
      blocks: [readingQuestion(inLesson)],
    });
    if (!content) throw new Error("no lesson");
    const lesson = await teacher.api.learning.saveLesson({
      id: "",
      moduleId: module.id,
      expectedVersion: 0,
      title: "Read it",
      completion: "view",
      passScore: null,
      content,
      publish: false,
    });
    await teacher.api.learning.publishModule({
      id: module.id,
      expectedVersion: module.version,
    });
    await student.api.learning.playLesson({ id: lesson.id });
    await student.api.learning.respond({
      lessonId: lesson.id,
      blockId: inLesson,
      response: {
        type: "written",
        text: "",
        recording: { fileId: await recording(student), seconds: 12 },
      },
    });
    const prosody = { expression: 3, phrasing: 2, smoothness: 3, pace: 3 };
    await teacher.api.learning.mark({
      lessonId: lesson.id,
      blockId: inLesson,
      studentIds: [me.id],
      points: 1.5,
      feedback: "",
      fluency: { errors: [3, 6], lastWord: 7, seconds: 12, prosody },
    });

    // A quiz's reading, marked the same way for the one attempt.
    const inQuiz = crypto.randomUUID();
    const quiz = await teacher.api.coursework.save({
      classId,
      title: "Reading check",
      brief: briefWithQuiz(plainContent("Read aloud."), {
        version: 2,
        blocks: [readingQuestion(inQuiz)],
      }),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "quiz",
      points: null,
      rubric: null,
      quiz: {
        attempts: 1,
        keep: "highest",
        reveal: "returned",
        shuffle: false,
      },
    });
    await teacher.api.coursework.publish({
      id: quiz.id,
      expectedVersion: quiz.version,
    });
    await student.api.coursework.saveQuizAnswer({
      assignmentId: quiz.id,
      blockId: inQuiz,
      response: {
        type: "written",
        text: "",
        recording: { fileId: await recording(student), seconds: 10 },
      },
    });
    const work = await student.api.coursework.work({ id: quiz.id });
    await student.api.coursework.handIn({
      assignmentId: quiz.id,
      expectedVersion: work.submission.version,
    });
    const board = await teacher.api.coursework.quizAnswers({
      assignmentId: quiz.id,
    });
    expect(board.questions[0]?.passage).toBe(passage);
    const attemptId =
      board.answers.find((answer) => answer.studentId === me.id)?.attemptId ??
      "";
    expect(
      await rejection(
        teacher.api.coursework.markQuizAnswer({
          attemptIds: [attemptId],
          blockId: inQuiz,
          points: 2,
          fluency: { errors: [12], lastWord: null, seconds: 10 },
        }),
      ),
    ).toMatchObject({ message: "learning.fluency" });
    const quizMark = { errors: [5], lastWord: null, seconds: 10 };
    await teacher.api.coursework.markQuizAnswer({
      attemptIds: [attemptId],
      blockId: inQuiz,
      points: 2,
      fluency: quizMark,
    });
    expect(
      (
        await teacher.api.coursework.quizAnswers({ assignmentId: quiz.id })
      ).answers.find((answer) => answer.studentId === me.id)?.fluency,
    ).toEqual(quizMark);

    // Other suites mark readings for the same seeded student, so only this
    // lesson's and this quiz's are counted.
    const ours = <T extends { sourceId: string }>(readings: T[]) =>
      readings.filter(
        (reading) =>
          reading.sourceId === lesson.id || reading.sourceId === quiz.id,
      );

    // The student reads their own figures and words to practise.
    const mine = await student.api.reading.mine();
    expect(ours(mine.readings)).toMatchObject([
      // Eight words read, two wrong, in twelve seconds.
      { source: "lesson", perMinute: 30, practise: ["long", "on"] },
      // Ten words read, one wrong, in ten seconds.
      { source: "quiz", perMinute: 54, practise: ["sail"] },
    ]);
    expect(JSON.stringify(mine)).not.toContain("norm");

    // Staff read them against the norm for the student's grade, once the
    // school writes one for it.
    const before = ours(
      (await teacher.api.reading.student({ studentId: me.id })).readings,
    );
    const grade = before[0]?.grade;
    if (!grade) throw new Error("the student has no grade");
    expect(before[0]).toMatchObject({
      prosody,
      prosodyTotal: 11,
      language: "en",
    });
    const principal = await signedIn("northwind", login("principal"));
    const norms = await principal.reading.norms();
    await principal.reading.saveNorms({
      language: "en",
      rows: [
        ...norms.en.rows.filter((row) => row.grade !== grade),
        ...(["fall", "winter", "spring"] as const).map((season) => ({
          grade,
          season,
          p10: 20,
          p25: 35,
          p50: 50,
          p75: 65,
          p90: 80,
        })),
      ],
      expectedVersion: norms.en.version,
    });
    const after = ours(
      (await teacher.api.reading.student({ studentId: me.id })).readings,
    );
    expect(
      after.map((reading) => [reading.norm?.p50, reading.standing]),
    ).toEqual([
      [50, "below"],
      [50, "near"],
    ]);
    await principal.reading.resetNorms({ language: "en" });
    // Another student's reading is not the student's to read.
    const other = await sessionFor("northwind", login("student", 0, 1));
    expect(
      await rejection(other.api.reading.student({ studentId: me.id })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
