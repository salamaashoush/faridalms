import type { ContentDocument, ContentNode } from "@faridalms/domain/content";

import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, raw, rejection, sessionFor, signedIn } from "./harness";

const teacherSession = () => sessionFor("northwind", login("teacher", 0, 1));
type Session = Awaited<ReturnType<typeof teacherSession>>;

async function classOfStudent(api: Session["api"], studentId: string) {
  const { classes } = await api.coursework.options();
  for (const row of classes.filter((item) => item.classType === "scheduled")) {
    const { roster } = await api.coursework.groups({ classId: row.id });
    if (roster.some((pupil) => pupil.id === studentId)) return row;
  }
  throw new Error("the seeded student takes no class of this teacher");
}

async function upload(session: Session, name: string) {
  const body = new Blob([`contents of ${name}`]);
  const file = await session.api.files.initiate({
    purpose: "document_media",
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
  return { fileId: file.id, name, mime: "text/plain", bytes: body.size };
}

function withAiUse(text: string, use: Partial<ContentNode>): ContentDocument {
  const document = plainContent(text);
  return {
    root: {
      ...document.root,
      children: [
        ...(document.root.children ?? []),
        { type: "ai-use", version: 1, ...use },
      ],
    },
  };
}

/** A session of the school's own board, made fresh so tests do not meet. */
async function ownSession(title: string) {
  const officer = await signedIn("northwind", login("principal"));
  const board = await officer.exams.saveBoard({
    titleEn: `${title} board`,
    titleAr: null,
  });
  const session = await officer.exams.saveSession({
    boardId: board.id,
    titleEn: title,
    titleAr: null,
    sitsIn: "2027-06-01",
    keepUntil: "2027-12-31",
    declarationRequired: true,
    aiEvidenceRequired: true,
    reason: "",
  });
  return { officer, session };
}

async function assessedAssignment(title: string, sessionId: string) {
  const teacher = await teacherSession();
  const student = await sessionFor("northwind", login("student"));
  const me = await student.api.identity.currentUser();
  const target = await classOfStudent(teacher.api, me.id);
  const saved = await teacher.api.coursework.save({
    classId: target.id,
    title,
    brief: plainContent(`Instructions for ${title}.`),
    audience: "class",
    latePolicy: "accept",
    submissionFormat: "online",
    points: 20,
    rubric: null,
  });
  await teacher.api.coursework.publish({
    id: saved.id,
    expectedVersion: saved.version,
  });
  await teacher.api.exams.setCoursework({
    assignmentId: saved.id,
    sessionId,
    component: "Component 2: Investigation",
  });
  return { teacher, student, me, assignmentId: saved.id };
}

describe("assessed coursework", () => {
  test("a student declares at hand-in, AI use is acknowledged in the work, and only confirmed work returns", async () => {
    const { officer, session } = await ownSession("Assessed investigation");
    const { teacher, student, me, assignmentId } = await assessedAssignment(
      "River investigation",
      session.id,
    );
    expect(await teacher.api.exams.coursework({ assignmentId })).toMatchObject({
      sessionId: session.id,
      component: "Component 2: Investigation",
    });
    expect(await student.api.exams.myStanding({ assignmentId })).toMatchObject({
      declarationRequired: true,
      aiEvidenceRequired: true,
      latestAttemptId: null,
    });

    const save = async (content: ContentDocument, version: number) =>
      student.api.coursework.saveDraft({
        assignmentId,
        expectedVersion: version,
        content,
      });
    const handIn = (version: number, aiUsed?: boolean) =>
      student.api.coursework.handIn({
        assignmentId,
        expectedVersion: version,
        ...(aiUsed === undefined
          ? {}
          : { declaration: { agreed: true as const, aiUsed } }),
      });

    let draft = await save(plainContent("The river floods each spring."), 0);
    expect(await rejection(handIn(draft.version))).toMatchObject({
      message: "coursework.declaration_needed",
    });
    expect(await rejection(handIn(draft.version, true))).toMatchObject({
      message: "coursework.ai_use_missing",
    });
    draft = await save(
      withAiUse("The river floods each spring.", {
        aiTool: "ChatGPT (GPT-5)",
        aiDate: "2026-09-30",
        aiUse: "An outline I rewrote in my own words",
      }),
      draft.version,
    );
    expect(await rejection(handIn(draft.version, false))).toMatchObject({
      message: "coursework.ai_use_in_work",
    });
    expect(await rejection(handIn(draft.version, true))).toMatchObject({
      message: "coursework.ai_use_incomplete",
    });
    const evidence = await upload(student, "chat.txt");
    draft = await save(
      withAiUse("The river floods each spring.", {
        aiTool: "ChatGPT (GPT-5)",
        aiDate: "2026-09-30",
        aiUse: "An outline I rewrote in my own words",
        aiEvidence: [evidence],
      }),
      draft.version,
    );
    await handIn(draft.version, true);

    const standing = await teacher.api.exams.workStanding({ assignmentId });
    const mine = standing?.students.find((row) => row.studentId === me.id);
    expect(mine).toMatchObject({
      declaration: { kind: "student", aiUsed: true },
      authentication: null,
    });
    const attemptId = mine?.attemptId;
    if (!attemptId) throw new Error("attempt missing");

    const giveBack = (action: "return" | "revise") =>
      teacher.api.coursework.act({
        assignmentId,
        action,
        studentIds: [me.id],
      });
    expect(await giveBack("return")).toEqual({ changed: 0, held: 1 });
    expect(
      await rejection(
        teacher.api.exams.authenticate({
          attemptId,
          outcome: "not_confirmed",
          note: null,
        }),
      ),
    ).toBeDefined();
    await teacher.api.exams.authenticate({
      attemptId,
      outcome: "not_confirmed",
      note: "The method section reads unlike the student's other work.",
    });
    expect(await giveBack("return")).toEqual({ changed: 0, held: 1 });
    const flagged = (await officer.exams.courseworkList()).find(
      (row) => row.assignmentId === assignmentId,
    );
    expect(flagged).toMatchObject({
      handedIn: 1,
      declared: 1,
      notConfirmed: 1,
      confirmed: 0,
    });

    await teacher.api.exams.authenticate({
      attemptId,
      outcome: "confirmed",
      note: "Discussed with the student, who explained each step.",
    });
    expect(await giveBack("revise")).toEqual({ changed: 0, held: 1 });
    expect(await giveBack("return")).toEqual({ changed: 1 });
    expect(
      await rejection(
        teacher.api.exams.authenticate({
          attemptId,
          outcome: "confirmed",
          note: null,
        }),
      ),
    ).toMatchObject({ message: "coursework.final" });

    const detail = await officer.exams.courseworkStudents({ assignmentId });
    expect(
      detail.students.find((row) => row.studentId === me.id)?.authentication,
    ).toMatchObject({ outcome: "confirmed" });
  });

  test("work a teacher hands in waits for the student's declaration, online or on paper", async () => {
    const { session } = await ownSession("Assessed fieldwork");
    const { teacher, student, me, assignmentId } = await assessedAssignment(
      "Fieldwork notebook",
      session.id,
    );
    const record = await teacher.api.coursework.record({ id: assignmentId });
    const other = record.work.find((row) => row.studentId !== me.id);
    if (!other) throw new Error("a second student");
    await teacher.api.coursework.act({
      assignmentId,
      action: "hand_in",
      studentIds: [me.id, other.studentId],
    });
    const standing = await teacher.api.exams.workStanding({ assignmentId });
    const attemptOf = (studentId: string) => {
      const found = standing?.students.find(
        (row) => row.studentId === studentId,
      )?.attemptId;
      if (!found) throw new Error("attempt missing");
      return found;
    };
    expect(
      await rejection(
        teacher.api.exams.authenticate({
          attemptId: attemptOf(me.id),
          outcome: "confirmed",
          note: null,
        }),
      ),
    ).toMatchObject({ message: "coursework.declaration_outstanding" });

    expect(await student.api.exams.myStanding({ assignmentId })).toMatchObject({
      latestDeclared: false,
    });
    await student.api.exams.declare({
      attemptId: attemptOf(me.id),
      agreed: true,
      aiUsed: false,
    });
    expect(await student.api.exams.myStanding({ assignmentId })).toMatchObject({
      latestDeclared: true,
    });

    const scan = await upload(teacher, "declaration-scan.txt");
    await teacher.api.exams.recordPaperDeclaration({
      attemptId: attemptOf(other.studentId),
      scanFileId: scan.fileId,
    });
    expect(
      await rejection(
        teacher.api.exams.recordPaperDeclaration({
          attemptId: attemptOf(other.studentId),
        }),
      ),
    ).toMatchObject({ message: "coursework.declared_already" });
    const after = await teacher.api.exams.workStanding({ assignmentId });
    expect(
      after?.students.find((row) => row.studentId === other.studentId)
        ?.declaration,
    ).toMatchObject({ kind: "paper", aiUsed: null, scan: { name: scan.name } });
    for (const studentId of [me.id, other.studentId])
      await teacher.api.exams.authenticate({
        attemptId: attemptOf(studentId),
        outcome: "confirmed",
        note: null,
      });
  });
});
