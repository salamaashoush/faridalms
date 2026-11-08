import type { LessonDocument } from "@faridalms/domain/learning";

import { plainContent } from "@faridalms/domain/content-conversion";
import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { describe, expect, test } from "bun:test";

import { login, rejection, seeded, sessionFor, signedIn } from "./harness";

const TITLE = "Reading stories together";
const id = () => crypto.randomUUID();
const student = () => signedIn("northwind", login("student"));

function written(blocks: LessonDocument["blocks"]) {
  const document = contentOfLesson({ version: 2, blocks });
  if (!document) throw new Error("the blocks could not become a document");
  return document;
}

const yesNo = (prompt: string) => {
  const right = id();
  const wrong = id();
  return {
    right,
    wrong,
    block: {
      id: id(),
      type: "choice" as const,
      prompt,
      points: 1,
      hints: [],
      explanation: "",
      tries: 1,
      options: [
        { id: right, text: "Yes", feedback: "" },
        { id: wrong, text: "No", feedback: "" },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
    },
  };
};

/** The seeded teacher of the reading module, and the class of theirs the seeded student is in. */
async function teacherAndClass() {
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === "northwind");
  const names = (tenant?.logins ?? [])
    .filter((row) => row.role === "teacher" && row.schoolId === school?.id)
    .map((row) => row.loginName);
  const pupil = await student();
  const me = await pupil.identity.currentUser();
  for (const name of names) {
    const { api } = await sessionFor("northwind", name);
    const { rows } = await api.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) continue;
    for (const item of source.classes) {
      const { roster } = await api.coursework.groups({ classId: item.id });
      if (roster.some((row) => row.id === me.id))
        return { keeper: api, classId: item.id, pupil, me };
    }
  }
  throw new Error("the seed lacks a teacher of the student's class");
}

describe("routing across modules", () => {
  test("a score in one module's lesson opens a lesson of another module the class takes", async () => {
    const { keeper, classId, pupil, me } = await teacherAndClass();
    const module = (title: string, classIds: string[]) =>
      keeper.learning.saveModule({
        id: "",
        expectedVersion: 0,
        title,
        summary: "",
        classIds,
        prerequisiteId: "",
        sequential: false,
      });
    const lesson = (
      moduleId: string,
      title: string,
      content: ReturnType<typeof written>,
      condition?: {
        lessonId: string;
        atLeast: number | null;
        below: number | null;
      },
    ) =>
      keeper.learning.saveLesson({
        id: "",
        moduleId,
        expectedVersion: 0,
        title,
        completion: "view",
        passScore: null,
        content,
        publish: false,
        ...(condition ? { condition } : {}),
      });

    const checking = await module("Fractions diagnostic", [classId]);
    const asked = [
      yesNo("Is a half two quarters?"),
      yesNo("Is a third a half?"),
    ];
    const diagnostic = await keeper.learning.saveLesson({
      id: "",
      moduleId: checking.id,
      expectedVersion: 0,
      title: "Diagnostic",
      completion: "quiz",
      passScore: null,
      content: written(asked.map((item) => item.block)),
      publish: false,
    });
    const helping = await module("Fractions help", [classId]);
    // The other module offers the diagnostic for its lessons' routing settings.
    expect(
      (await keeper.learning.routeChoices({ moduleId: helping.id })).lessons,
    ).toContainEqual({
      lessonId: diagnostic.id,
      title: "Diagnostic",
      position: 0,
      moduleId: checking.id,
      moduleTitle: "Fractions diagnostic",
    });
    await lesson(helping.id, "Warm up", plainContent("Fold a paper strip."));
    const halves = await lesson(
      helping.id,
      "Halves again",
      plainContent("Cut it in two."),
      { lessonId: diagnostic.id, atLeast: null, below: 60 },
    );
    const challenge = yesNo("Is two thirds more than a half?");
    const thirds = await lesson(
      helping.id,
      "Thirds challenge",
      written([challenge.block]),
      { lessonId: diagnostic.id, atLeast: 60, below: null },
    );
    // A module that shares no class with the diagnostic cannot read its score.
    const other = (await keeper.learning.options()).classes.find(
      (row) => row.id !== classId,
    );
    if (!other) throw new Error("the teacher writes for one class only");
    const apart = await module("Fractions elsewhere", [other.id]);
    expect(
      await rejection(
        lesson(apart.id, "Elsewhere", plainContent("Apart."), {
          lessonId: diagnostic.id,
          atLeast: 50,
          below: null,
        }),
      ),
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "learning.condition_module",
    });
    // Nor may the diagnostic read the score of a lesson its own score routes.
    const stored = await keeper.learning.record({ id: checking.id });
    expect(
      await rejection(
        keeper.learning.saveLesson({
          id: diagnostic.id,
          moduleId: checking.id,
          expectedVersion: diagnostic.version,
          title: "Diagnostic",
          completion: "quiz",
          passScore: null,
          content: written(asked.map((item) => item.block)),
          publish: false,
          condition: { lessonId: thirds.id, atLeast: 50, below: null },
        }),
      ),
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "learning.condition_loop",
    });
    expect(stored.routes.map((row) => row.lessonId)).toEqual([
      halves.id,
      thirds.id,
    ]);
    expect(
      await rejection(keeper.learning.removeLesson({ id: diagnostic.id })),
    ).toMatchObject({ code: "CONFLICT", message: "learning.condition_in_use" });
    const helpRecord = await keeper.learning.record({ id: helping.id });
    expect(helpRecord.sources).toEqual([
      {
        lessonId: diagnostic.id,
        title: "Diagnostic",
        moduleId: checking.id,
        moduleTitle: "Fractions diagnostic",
      },
    ]);
    for (const opened of [checking, helping])
      await keeper.learning.publishModule({
        id: opened.id,
        expectedVersion: opened.version,
      });

    const titles = async () =>
      (await pupil.learning.play({ id: helping.id })).lessons.map(
        (row) => row.title,
      );
    // Until the diagnostic is done, both routed lessons wait.
    expect(await titles()).toEqual(["Warm up"]);
    await pupil.learning.playLesson({ id: diagnostic.id });
    for (const [index, item] of asked.entries())
      await pupil.learning.respond({
        lessonId: diagnostic.id,
        blockId: item.block.id,
        response: {
          type: "choice",
          optionIds: [index === 0 ? item.right : item.wrong],
        },
      });
    // Half right sends the student to the halves, past the challenge.
    const outline = await pupil.learning.play({ id: helping.id });
    expect(outline.lessons.map((row) => row.title)).toEqual([
      "Warm up",
      "Halves again",
    ]);
    expect(outline.lessons[1]?.from).toEqual({
      lessonId: diagnostic.id,
      title: "Diagnostic",
      moduleId: checking.id,
      moduleTitle: "Fractions diagnostic",
    });
    expect(
      await rejection(pupil.learning.playLesson({ id: thirds.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    const sent = {
      lessonId: halves.id,
      title: "Halves again",
      moduleId: helping.id,
      moduleTitle: "Fractions help",
      fromLessonId: diagnostic.id,
      done: false,
    };
    expect((await pupil.learning.play({ id: checking.id })).sent).toEqual([
      sent,
    ]);
    expect(
      (await pupil.learning.playLesson({ id: diagnostic.id })).sent,
    ).toEqual([sent]);
    expect(
      (await pupil.learning.mine({})).rows.find((row) => row.id === helping.id),
    ).toMatchObject({ lessons: 2, completed: 0 });

    // The teacher's progress shows the challenge off the student's path,
    // and names the lesson its rule reads.
    const matrix = await keeper.learning.progress({
      moduleId: helping.id,
      classId,
    });
    expect(matrix.paths.filter((row) => row.studentId === me.id)).toEqual([
      { lessonId: thirds.id, studentId: me.id, state: "off" },
    ]);
    expect(matrix.sources.map((row) => row.lessonId)).toEqual([diagnostic.id]);
    expect(
      matrix.cells.every((cell) =>
        matrix.lessons.some((item) => item.id === cell.lessonId),
      ),
    ).toBe(true);

    // A copy keeps no rule on a lesson of another module.
    const copy = await keeper.learning.duplicateModule({
      id: helping.id,
      classIds: [classId],
    });
    expect(
      (await keeper.learning.record({ id: copy.id })).lessons.map(
        (row) => row.condition,
      ),
    ).toEqual([null, null, null]);
  });
});
