import type { LessonDocument } from "@faridalms/domain/learning";

import { plainContent } from "@faridalms/domain/content-conversion";
import {
  contentOfLesson,
  lessonOfContent,
} from "@faridalms/domain/lesson-content";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { login, raw, rejection, seeded, sessionFor, signedIn } from "./harness";

const student = () => signedIn("northwind", login("student"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

type Api = Awaited<ReturnType<typeof student>>;

const TITLE = "Reading stories together";
const id = () => crypto.randomUUID();

function written(blocks: LessonDocument["blocks"]) {
  const document = contentOfLesson({ version: 2, blocks });
  if (!document) throw new Error("the blocks could not become a document");
  return document;
}

/** The seeded teachers split into one who teaches the module and one who does not. */
async function teachers() {
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === "northwind");
  const names = (tenant?.logins ?? [])
    .filter((row) => row.role === "teacher" && row.schoolId === school?.id)
    .map((row) => row.loginName);
  let keeper: Api | null = null;
  let stranger: Api | null = null;
  for (const name of names) {
    const api = await signedIn("northwind", name);
    const { rows } = await api.learning.modules({});
    if (rows.some((row) => row.title === TITLE)) keeper ??= api;
    else stranger ??= api;
  }
  if (!keeper || !stranger)
    throw new Error("the seed lacks a teacher of the module and one without");
  return { keeper, stranger };
}

type Played = Awaited<ReturnType<Api["learning"]["playLesson"]>>;
type Shown = Played["blocks"][number];

function blockOf<T extends Shown["type"]>(
  lesson: Played,
  type: T,
): Extract<Shown, { type: T }> {
  const found = lesson.blocks.find(
    (block): block is Extract<Shown, { type: T }> => block.type === type,
  );
  if (!found) throw new Error(`no ${type} block`);
  return found;
}

async function lessonsOf(api: Api) {
  const { rows } = await api.learning.mine({});
  const module = rows.find((row) => row.title === TITLE);
  if (!module) throw new Error("the student is not in 8A");
  const outline = await api.learning.play({ id: module.id });
  const [reading, check, reflection] = outline.lessons;
  if (!reading || !check || !reflection) throw new Error("three lessons");
  return { module, outline, reading, check, reflection };
}

describe("learning a module", () => {
  test("a student opens the lessons in order", async () => {
    const api = await student();
    const { rows } = await api.learning.mine({});
    expect(rows.some((row) => row.title === "Poetry out loud")).toBe(false);
    const { module, outline, reading, check, reflection } =
      await lessonsOf(api);
    let lessons = outline.lessons;
    if (reading.state !== "done") {
      expect(check.state).toBe("locked");
      await api.learning.playLesson({ id: reading.id });
      lessons = (await api.learning.play({ id: module.id })).lessons;
    }
    expect(lessons[1]?.state).toBe("open");
    expect(lessons[2]?.state).toBe("locked");
    expect(
      await rejection(api.learning.playLesson({ id: reflection.id })),
    ).toMatchObject({ code: "CONFLICT", message: "learning.locked" });
  });

  test("a question keeps its answer back until it is right, revealed or out of tries", async () => {
    const api = await student();
    const { check } = await lessonsOf(api);
    const opened = await api.learning.playLesson({ id: check.id });
    const shown = JSON.stringify(opened.blocks);
    for (const secret of [
      "correctOptionIds",
      "without a problem",
      "The setting is where",
      "characters",
    ])
      expect(shown).not.toContain(secret);

    const choice = blockOf(opened, "choice");
    const wrong = choice.options.find((option) => option.text === "A dragon");
    const right = choice.options.find((option) =>
      option.text.startsWith("A problem"),
    );
    if (!wrong || !right) throw new Error("options changed");
    const miss = await api.learning.respond({
      lessonId: check.id,
      blockId: choice.id,
      response: { type: "choice", optionIds: [wrong.id] },
    });
    expect(miss.check).toMatchObject({
      tries: 1,
      correct: false,
      feedback: ["Some stories have dragons, but most do not."],
      hint: "Think about what makes the characters act.",
      key: null,
      explanation: null,
    });
    const hit = await api.learning.respond({
      lessonId: check.id,
      blockId: choice.id,
      response: { type: "choice", optionIds: [right.id] },
    });
    expect(hit.check).toMatchObject({
      tries: 2,
      correct: true,
      key: [right.id],
    });
    expect(
      await rejection(
        api.learning.respond({
          lessonId: check.id,
          blockId: choice.id,
          response: { type: "choice", optionIds: [right.id] },
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "learning.settled" });

    const typed = blockOf(opened, "text");
    const slip = await api.learning.respond({
      lessonId: check.id,
      blockId: typed.id,
      response: { type: "text", text: "plot" },
    });
    expect(slip.check).toMatchObject({
      correct: false,
      triesLeft: 2,
      hint: "It starts with s.",
    });
    const close = await api.learning.respond({
      lessonId: check.id,
      blockId: typed.id,
      response: { type: "text", text: "Settng" },
    });
    expect(close.check).toMatchObject({ correct: true, key: ["setting"] });

    const gaps = blockOf(opened, "gaps");
    const [first, second] = gaps.segments.flatMap((segment) =>
      segment.type === "gap" ? [segment.id] : [],
    );
    if (!first || !second) throw new Error("two blanks");
    const half = await api.learning.respond({
      lessonId: check.id,
      blockId: gaps.id,
      response: {
        type: "gaps",
        answers: { [first]: "Characters", [second]: "setting" },
      },
    });
    expect(half.check).toMatchObject({
      fraction: 0.5,
      parts: { [first]: true, [second]: false },
      key: null,
    });
    expect(half.completed).toBe(false);
    const shownAnswer = await api.learning.reveal({
      lessonId: check.id,
      blockId: gaps.id,
    });
    expect(shownAnswer.check).toMatchObject({
      revealed: true,
      key: ["characters", "problem"],
    });
    // Two questions right on the second try, each losing a third, and the
    // revealed one worth nothing: 4/3 of 4 points.
    expect(shownAnswer).toMatchObject({ completed: true, score: 33 });
  });

  test("starting again gives fresh questions and keeps the best score", async () => {
    const api = await student();
    const { check } = await lessonsOf(api);
    expect(await api.learning.retry({ lessonId: check.id })).toEqual({
      attempt: 2,
    });
    const fresh = await api.learning.playLesson({ id: check.id });
    expect(fresh.attempt).toBe(2);
    expect(Object.values(fresh.checks).every((view) => view.tries === 0)).toBe(
      true,
    );
    const choice = blockOf(fresh, "choice");
    const right = choice.options.find((option) =>
      option.text.startsWith("A problem"),
    );
    if (!right) throw new Error("options changed");
    const typed = blockOf(fresh, "text");
    const gaps = blockOf(fresh, "gaps");
    const [first, second] = gaps.segments.flatMap((segment) =>
      segment.type === "gap" ? [segment.id] : [],
    );
    if (!first || !second) throw new Error("two blanks");
    await api.learning.respond({
      lessonId: check.id,
      blockId: choice.id,
      response: { type: "choice", optionIds: [right.id] },
    });
    await api.learning.respond({
      lessonId: check.id,
      blockId: typed.id,
      response: { type: "text", text: "المكان و الزمان" },
    });
    const done = await api.learning.respond({
      lessonId: check.id,
      blockId: gaps.id,
      response: {
        type: "gaps",
        answers: { [first]: "characters", [second]: "problem" },
      },
    });
    expect(done).toMatchObject({ completed: true, score: 100 });
  });

  test("a written answer keeps to its word limit and waits for the teacher", async () => {
    const api = await student();
    const { reflection } = await lessonsOf(api);
    const opened = await api.learning.playLesson({ id: reflection.id });
    const prompt = blockOf(opened, "written");
    expect(
      await rejection(
        api.learning.respond({
          lessonId: reflection.id,
          blockId: prompt.id,
          response: { type: "written", text: "word ".repeat(201) },
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "learning.word_limit" });
    const sent = await api.learning.respond({
      lessonId: reflection.id,
      blockId: prompt.id,
      response: { type: "written", text: "Charlotte's Web: saving Wilbur." },
    });
    expect(sent.completed).toBe(true);
    expect(sent.check).toMatchObject({ tries: 1, marked: false, credit: null });
    const after = await api.learning.mine({});
    const finished = after.rows.find((row) => row.title === TITLE);
    expect(finished?.completed).toBe(finished?.lessons);
  });

  test("a student's next lessons hold the open lesson of each module, begun first", async () => {
    const api = await student();
    const { module, outline } = await lessonsOf(api);
    const open = outline.lessons.find((lesson) => lesson.state === "open");
    const { lessons } = await api.learning.nextLessons({});
    expect(lessons.find((lesson) => lesson.moduleId === module.id)).toEqual(
      open
        ? expect.objectContaining({
            lessonId: open.id,
            title: open.title,
            moduleTitle: TITLE,
          })
        : undefined,
    );
    const fresh = lessons.findIndex((lesson) => !lesson.begun);
    expect(
      fresh < 0 || lessons.slice(fresh).every((lesson) => !lesson.begun),
    ).toBe(true);
  });

  test("a family reads their child's progress", async () => {
    const family = await mother();
    const me = await (await student()).identity.currentUser();
    const { rows } = await family.learning.mine({ studentId: me.id });
    expect(rows.some((row) => row.title === TITLE)).toBe(true);
  });
});

describe("matching, ordering and sorting", () => {
  test("a student answers each kind in a new module and finishes with full marks", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Planets",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const common = {
      points: 1,
      hint: "",
      explanation: "",
      tries: null,
    };
    const pairs = [
      { id: id(), prompt: "Red planet", answer: "Mars" },
      { id: id(), prompt: "Ringed planet", answer: "Saturn" },
    ];
    const items = ["Mercury", "Venus", "Earth"].map((text) => ({
      id: id(),
      text,
    }));
    const groups = [
      { id: id(), name: "Rocky" },
      { id: id(), name: "Gas giant" },
    ];
    const sorted = [
      { id: id(), text: "Earth", groupId: groups[0]?.id ?? "" },
      { id: id(), text: "Jupiter", groupId: groups[1]?.id ?? "" },
    ];
    const blocks = [
      {
        ...common,
        id: id(),
        type: "matching" as const,
        prompt: "Match each planet.",
        pairs,
        distractors: [{ id: id(), text: "Pluto" }],
      },
      {
        ...common,
        id: id(),
        type: "ordering" as const,
        prompt: "Order them from the sun.",
        items,
        scoring: "all" as const,
      },
      {
        ...common,
        id: id(),
        type: "sorting" as const,
        prompt: "Sort the planets.",
        groups,
        items: sorted,
      },
    ];
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Order and sort",
      completion: "quiz",
      passScore: null,
      content: written(blocks),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const outline = await pupil.learning.play({ id: saved.id });
    const lessonId = outline.lessons[0]?.id ?? "";
    const opened = await pupil.learning.playLesson({ id: lessonId });
    const ordering = blockOf(opened, "ordering");
    expect(ordering.items.map((item) => item.id)).not.toEqual(
      items.map((item) => item.id),
    );
    expect(JSON.stringify(opened.blocks)).not.toContain("groupId");
    const [matching, , sorting] = blocks;
    if (!matching || !sorting) throw new Error("blocks");
    await pupil.learning.respond({
      lessonId,
      blockId: matching.id,
      response: {
        type: "matching",
        pairs: Object.fromEntries(pairs.map((pair) => [pair.id, pair.id])),
      },
    });
    await pupil.learning.respond({
      lessonId,
      blockId: ordering.id,
      response: { type: "ordering", order: items.map((item) => item.id) },
    });
    const done = await pupil.learning.respond({
      lessonId,
      blockId: sorting.id,
      response: {
        type: "sorting",
        groups: Object.fromEntries(
          sorted.map((item) => [item.id, item.groupId]),
        ),
      },
    });
    expect(done).toMatchObject({ completed: true, score: 100 });
  });
});

describe("marking written answers", () => {
  test("the teacher reads a class's answers and marks one, which the student then sees", async () => {
    const { keeper, stranger } = await teachers();
    const pupil = await student();
    const me = await pupil.identity.currentUser();
    const { rows } = await keeper.learning.modules({});
    const module = rows.find((row) => row.title === TITLE);
    if (!module) throw new Error("no module");
    let found: {
      classId: string;
      data: Awaited<ReturnType<Api["learning"]["answers"]>>;
    } | null = null;
    for (const item of module.classes) {
      const data = await keeper.learning.answers({
        moduleId: module.id,
        classId: item.id,
      });
      if (data.answers.some((answer) => answer.studentId === me.id))
        found = { classId: item.id, data };
    }
    if (!found) throw new Error("the student's answer is not listed");
    const [question] = found.data.questions;
    expect(question).toMatchObject({ points: 4 });
    const answer = found.data.answers.find((item) => item.studentId === me.id);
    expect(answer).toMatchObject({
      text: "Charlotte's Web: saving Wilbur.",
      marked: false,
    });
    if (!question) throw new Error("no question");
    const mark = {
      lessonId: question.lessonId,
      blockId: question.blockId,
      studentId: me.id,
      feedback: "A lovely choice. Say more about Wilbur's problem.",
    };
    expect(
      await rejection(keeper.learning.mark({ ...mark, points: 5 })),
    ).toMatchObject({ code: "BAD_REQUEST", message: "learning.points_over" });
    expect(await keeper.learning.mark({ ...mark, points: 3 })).toEqual({
      marked: true,
    });
    expect(
      await rejection(
        stranger.learning.answers({
          moduleId: module.id,
          classId: found.classId,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const seen = await pupil.learning.playLesson({ id: question.lessonId });
    expect(seen.checks[question.blockId]).toMatchObject({
      marked: true,
      credit: 3,
      markFeedback: mark.feedback,
    });
    expect(
      await rejection(
        pupil.learning.respond({
          lessonId: question.lessonId,
          blockId: question.blockId,
          response: { type: "written", text: "A rewrite after marking." },
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "learning.settled" });
  });
});

describe("teaching a module", () => {
  test("a teacher sees the class's progress and marks a lesson for a student", async () => {
    const { keeper, stranger } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const module = rows.find((row) => row.title === TITLE);
    const target = module?.classes[0];
    if (!module || !target) throw new Error("no module");
    const matrix = await keeper.learning.progress({
      moduleId: module.id,
      classId: target.id,
    });
    expect(matrix.lessons).toHaveLength(3);
    expect(matrix.students.length).toBeGreaterThan(0);
    const [someone] = matrix.students;
    const [first] = matrix.lessons;
    if (!someone || !first) throw new Error("empty matrix");
    await keeper.learning.override({
      lessonId: first.id,
      studentId: someone.id,
      completed: true,
    });
    const again = await keeper.learning.progress({
      moduleId: module.id,
      classId: target.id,
    });
    expect(
      again.cells.find(
        (cell) => cell.lessonId === first.id && cell.studentId === someone.id,
      )?.completedAt,
    ).not.toBeNull();

    expect(
      await rejection(stranger.learning.record({ id: module.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a teacher turns a class's lesson sounds off, and its students play quietly", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const module = rows.find((row) => row.title === TITLE);
    const target = module?.classes[0];
    if (!module || !target) throw new Error("no module");
    const pupil = await student();
    const { lessons } = await pupil.learning.play({ id: module.id });
    const lesson = lessons.find((row) => row.state !== "locked");
    if (!lesson) throw new Error("no open lesson");

    expect(await keeper.learning.classSounds({ classId: target.id })).toEqual({
      on: true,
    });
    expect((await pupil.learning.playLesson({ id: lesson.id })).sounds).toBe(
      true,
    );
    await keeper.learning.setClassSounds({ classId: target.id, on: false });
    expect((await pupil.learning.playLesson({ id: lesson.id })).sounds).toBe(
      false,
    );
    await keeper.learning.setClassSounds({ classId: target.id, on: true });
    expect(
      await rejection(pupil.learning.classSounds({ classId: target.id })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("a module opens only with a lesson that says something, and copies as a draft", async () => {
    const { keeper } = await teachers();
    const { classes } = await keeper.learning.options();
    const target = classes[0];
    if (!target) throw new Error("no class");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Fractions",
      summary: "",
      classIds: [target.id],
      prerequisiteId: "",
      sequential: true,
    });
    expect(
      await rejection(
        keeper.learning.publishModule({
          id: saved.id,
          expectedVersion: saved.version,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "learning.lesson_required" });
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Halves",
      completion: "view",
      passScore: null,
      content: plainContent("A half is one of two equal parts."),
      publish: false,
    });
    const published = await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(published.version).toBeGreaterThan(saved.version);

    const copy = await keeper.learning.duplicateModule({
      id: saved.id,
      classIds: [target.id],
    });
    const opened = await keeper.learning.record({ id: copy.id });
    expect(opened.state).toBe("draft");
    expect(opened.lessons.map((row) => row.title)).toEqual(["Halves"]);
  });
});

describe("publishing a lesson", () => {
  test("students keep the version last shown until the teacher shows the edit", async () => {
    const { keeper } = await teachers();
    const pupil = await student();
    const { reading } = await lessonsOf(pupil);
    const editing = await keeper.learning.lesson({ id: reading.id });
    expect(editing.published).toMatchObject({ changed: false });
    const draft = {
      id: editing.id,
      moduleId: editing.moduleId,
      title: editing.title,
      completion: editing.completion,
      passScore: editing.passScore,
      content: plainContent("Every story has a problem to solve."),
    };
    const saved = await keeper.learning.saveLesson({
      ...draft,
      expectedVersion: editing.version,
      publish: false,
    });
    expect(saved.published).toBe(false);
    expect(
      (await keeper.learning.lesson({ id: reading.id })).published,
    ).toMatchObject({ changed: true });
    const before = await pupil.learning.playLesson({ id: reading.id });
    expect(JSON.stringify(before.blocks)).not.toContain("problem to solve");

    const shown = await keeper.learning.saveLesson({
      ...draft,
      expectedVersion: saved.version,
      publish: true,
    });
    expect(shown.published).toBe(true);
    const after = await pupil.learning.playLesson({ id: reading.id });
    expect(JSON.stringify(after.blocks)).toContain("problem to solve");
  });
});

describe("lessons written as documents", () => {
  test("a lesson stored as blocks opens as one document with its question ids", async () => {
    const { keeper } = await teachers();
    const pupil = await student();
    const { check } = await lessonsOf(pupil);
    const editing = await keeper.learning.lesson({ id: check.id });
    expect(editing.content).toHaveProperty("root");
    const asked = lessonOfContent(editing.content)
      .blocks.filter((block) => block.type !== "content")
      .map((block) => block.id);
    const played = (await pupil.learning.playLesson({ id: check.id })).blocks
      .filter((block) => block.type !== "content")
      .map((block) => block.id);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked).toEqual(played);
  });

  test("a question without its answer keeps the edit from students", async () => {
    const { keeper } = await teachers();
    const pupil = await student();
    const { reading } = await lessonsOf(pupil);
    const editing = await keeper.learning.lesson({ id: reading.id });
    const draft = {
      id: editing.id,
      moduleId: editing.moduleId,
      title: editing.title,
      completion: editing.completion,
      passScore: editing.passScore,
      content: written([
        {
          id: id(),
          type: "choice",
          prompt: "Which is a noun?",
          points: 1,
          hint: "",
          explanation: "",
          tries: null,
          options: [
            { id: id(), text: "Tree", feedback: "" },
            { id: id(), text: "Run", feedback: "" },
          ],
          correctOptionIds: [],
          multiple: false,
          shuffle: false,
        },
      ]),
    };
    const saved = await keeper.learning.saveLesson({
      ...draft,
      expectedVersion: editing.version,
      publish: false,
    });
    expect(
      await rejection(
        keeper.learning.saveLesson({
          ...draft,
          expectedVersion: saved.version,
          publish: true,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "learning.correct_option" });
    expect(
      await rejection(keeper.learning.publishLesson({ id: reading.id })),
    ).toMatchObject({ code: "CONFLICT", message: "learning.correct_option" });
    const played = await pupil.learning.playLesson({ id: reading.id });
    expect(JSON.stringify(played.blocks)).not.toContain("Which is a noun?");
    await keeper.learning.saveLesson({
      ...draft,
      content: editing.published?.content ?? editing.content,
      expectedVersion: saved.version,
      publish: false,
    });
  });

  test("a teacher brings back a version students were shown", async () => {
    const { keeper } = await teachers();
    const pupil = await student();
    const { reading } = await lessonsOf(pupil);
    const host = { hostType: "lesson", hostId: reading.id };
    const { versions } = await keeper.documents.history(host);
    const shown = versions.find((row) => row.reason === "publish");
    if (!shown) throw new Error("no version was shown");
    const restored = await keeper.documents.restore({
      ...host,
      documentVersion: shown.documentVersion,
    });
    expect(restored.content).toHaveProperty("root");
    const after = await keeper.documents.history(host);
    expect(after.versions[0]?.reason).toBe("before_restore");
    expect(await rejection(pupil.documents.history(host))).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("students never watch a lesson's document live", async () => {
    const { keeper } = await teachers();
    const pupil = await student();
    const { reading } = await lessonsOf(pupil);
    const host = { hostType: "lesson", hostId: reading.id };
    expect(await rejection(pupil.documents.collaborate(host))).toMatchObject({
      code: "NOT_FOUND",
    });
    const ticket = await keeper.documents.collaborate(host);
    expect(ticket.access).toBe("write");
    const editing = await keeper.learning.lesson({ id: reading.id });
    expect(editing.content).toHaveProperty("root");
  });
});

describe("asking missed questions again", () => {
  test("a question missed first time comes back once at the end and leaves the score", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Review",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const right = id();
    const wrong = id();
    const missedOne = {
      id: id(),
      type: "choice" as const,
      prompt: "Which is a noun?",
      points: 1,
      hint: "",
      explanation: "A thing.",
      tries: null,
      options: [
        { id: right, text: "Tree", feedback: "" },
        { id: wrong, text: "Run", feedback: "" },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
    };
    const knownOne = {
      ...missedOne,
      id: id(),
      prompt: "Which is a verb?",
      options: [
        { id: right, text: "Jump", feedback: "" },
        { id: wrong, text: "Chair", feedback: "" },
      ],
    };
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Nouns and verbs",
      completion: "quiz",
      passScore: null,
      review: true,
      content: written([missedOne, knownOne]),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const outline = await pupil.learning.play({ id: saved.id });
    const lessonId = outline.lessons[0]?.id ?? "";
    const choose = (blockId: string, optionId: string) =>
      pupil.learning.respond({
        lessonId,
        blockId,
        response: { type: "choice", optionIds: [optionId] },
      });
    await choose(missedOne.id, wrong);
    const midway = await choose(missedOne.id, right);
    expect(midway.review).toBeNull();
    const last = await choose(knownOne.id, right);
    expect(last.review?.blocks.map((block) => block.id)).toEqual([
      missedOne.id,
    ]);
    const scored = last.score;

    const again = await pupil.learning.reviewAnswer({
      lessonId,
      blockId: missedOne.id,
      response: { type: "choice", optionIds: [right] },
    });
    expect(again.check).toMatchObject({
      correct: true,
      explanation: "A thing.",
    });
    expect(
      await rejection(
        pupil.learning.reviewAnswer({
          lessonId,
          blockId: missedOne.id,
          response: { type: "choice", optionIds: [right] },
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "learning.settled" });
    expect(
      await rejection(
        pupil.learning.reviewAnswer({
          lessonId,
          blockId: knownOne.id,
          response: { type: "choice", optionIds: [right] },
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const reopened = await pupil.learning.playLesson({ id: lessonId });
    expect(reopened.score).toBe(scored);
    expect(reopened.review?.checks[missedOne.id]).toMatchObject({
      correct: true,
    });

    // The teacher sees how the class did first time, and who chose what.
    const me = await pupil.identity.currentUser();
    const views = await Promise.all(
      source.classes.map((item) =>
        keeper.learning.questions({ moduleId: saved.id, classId: item.id }),
      ),
    );
    const asked = views
      .flatMap((view) => view.lessons)
      .flatMap((lesson) => lesson.questions)
      .filter((question) => me.id in question.standings);
    const first = asked.find((question) => question.id === missedOne.id);
    // Older students' lessons and classes are not young, so the teacher
    // reads the question cards rather than the young grid.
    expect(views.flatMap((view) => view.lessons).some((row) => row.young)).toBe(
      false,
    );
    expect(
      (await keeper.learning.record({ id: saved.id })).classes.some(
        (row) => row.young,
      ),
    ).toBe(false);
    expect(first?.standings[me.id]).toBe("later");
    expect(first?.firstChoices[me.id]).toEqual([wrong]);
    expect(
      asked.find((question) => question.id === knownOne.id)?.standings[me.id],
    ).toBe("first");
    expect(
      await rejection(
        pupil.learning.questions({
          moduleId: saved.id,
          classId: source.classes[0]?.id ?? "",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("a module's file area", () => {
  test("keeps a lesson's pictures for the module, open to its classes once shown", async () => {
    const tenant = seeded().tenants[0];
    const school = tenant?.schools.find((row) => row.slug === "northwind");
    let keeper: Awaited<ReturnType<typeof sessionFor>> | null = null;
    for (const row of tenant?.logins ?? []) {
      if (row.role !== "teacher" || row.schoolId !== school?.id) continue;
      const session = await sessionFor("northwind", row.loginName);
      const { rows } = await session.api.learning.modules({});
      if (rows.some((item) => item.title === TITLE)) {
        keeper = session;
        break;
      }
    }
    if (!keeper) throw new Error("no teacher of the module");
    const { rows } = await keeper.api.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.api.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Leaves",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const body = new Blob(["a drawing of a leaf"]);
    const file = await keeper.api.files.initiate({
      purpose: "document_media",
      name: "leaf.txt",
      mediaType: "text/plain",
      sizeBytes: body.size,
    });
    await raw("northwind", keeper.token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body,
    });
    const content = plainContent("Look at the leaf.");
    content.root.children?.push({
      type: "file",
      version: 1,
      format: "",
      fileId: file.id,
      name: "leaf.txt",
      mime: "text/plain",
      bytes: body.size,
    });
    await keeper.api.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Leaf shapes",
      completion: "view",
      passScore: null,
      content,
      publish: false,
    });
    const pupil = await sessionFor("northwind", login("student"));
    const path = `/v1/files/${file.id}/content`;
    expect((await raw("northwind", pupil.token, path)).status).toBe(404);
    await keeper.api.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect((await raw("northwind", pupil.token, path)).status).toBe(200);
    const { cell } = seeded();
    const tenantId = tenant?.tenantId ?? "";
    const [row] = await cell.withWorker(
      { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
      "read",
      (tx) =>
        tx.execute<{ host_type: string; host_id: string }>(
          sql`select host_type, host_id from core.files
            where tenant_id = ${tenantId}::uuid and id = ${file.id}::uuid`,
        ),
    );
    expect(row).toEqual({ host_type: "module", host_id: saved.id });
  });
});

describe("templates", () => {
  test("a teacher keeps a lesson as a template the school starts from", async () => {
    const { keeper, stranger } = await teachers();
    const saved = await keeper.templates.save({
      kind: "lesson",
      title: "Read, check, reflect",
      content: plainContent("Read the passage, then answer."),
    });
    const listed = await stranger.templates.list({ kind: "lesson" });
    const found = listed.find((row) => row.id === saved.id);
    expect(found).toMatchObject({ title: "Read, check, reflect", mine: false });
    const opened = await stranger.templates.open({ id: saved.id });
    expect(JSON.stringify(opened.content)).toContain("Read the passage");
    expect(
      await rejection(stranger.templates.remove({ id: saved.id })),
    ).toMatchObject({ code: "FORBIDDEN" });
    const pupil = await student();
    expect(
      await rejection(pupil.templates.list({ kind: "lesson" })),
    ).toMatchObject({ code: "FORBIDDEN" });
    await keeper.templates.remove({ id: saved.id });
    expect(
      (await keeper.templates.list({ kind: "lesson" })).some(
        (row) => row.id === saved.id,
      ),
    ).toBe(false);
  });
});

describe("spoken answers", () => {
  test("a child answers by recording, which only the module's teachers hear", async () => {
    const tenant = seeded().tenants[0];
    const school = tenant?.schools.find((row) => row.slug === "northwind");
    let keeper: Awaited<ReturnType<typeof sessionFor>> | null = null;
    let stranger: Awaited<ReturnType<typeof sessionFor>> | null = null;
    for (const row of tenant?.logins ?? []) {
      if (row.role !== "teacher" || row.schoolId !== school?.id) continue;
      const session = await sessionFor("northwind", row.loginName);
      const { rows } = await session.api.learning.modules({});
      if (rows.some((item) => item.title === TITLE)) keeper ??= session;
      else stranger ??= session;
    }
    if (!keeper || !stranger) throw new Error("two teachers needed");
    const { rows } = await keeper.api.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.api.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Animal sounds",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const question = id();
    const lesson = await keeper.api.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Say it",
      completion: "view",
      passScore: null,
      content: written([
        {
          id: question,
          type: "written",
          prompt: "Make the sound a cat makes.",
          points: 0,
          hint: "",
          explanation: "",
          tries: null,
          wordLimit: null,
          recordSeconds: 45,
        },
      ]),
      publish: false,
    });
    await keeper.api.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    // A WebM file's first bytes, which is all the upload check reads.
    const sound = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])]);
    const upload = async (session: typeof keeper) => {
      const file = await session.api.files.initiate({
        purpose: "document_media",
        name: "answer.webm",
        mediaType: "audio/webm",
        sizeBytes: sound.size,
      });
      await raw("northwind", session.token, `/v1/files/${file.id}/content`, {
        method: "PUT",
        body: sound,
      });
      return file.id;
    };
    const pupil = await sessionFor("northwind", login("student"));
    const answer = (fileId?: string) =>
      pupil.api.learning.respond({
        lessonId: lesson.id,
        blockId: question,
        response: {
          type: "written",
          text: fileId ? "" : "Meow",
          ...(fileId ? { recording: { fileId, seconds: 3 } } : {}),
        },
      });
    expect(await rejection(answer())).toMatchObject({
      code: "BAD_REQUEST",
      message: "learning.response",
    });
    const theirs = await upload(keeper);
    expect(await rejection(answer(theirs))).toMatchObject({
      code: "CONFLICT",
      message: "files.not_linkable",
    });
    const mine = await upload(pupil);
    await answer(mine);

    const me = await pupil.api.identity.currentUser();
    const listed = [];
    for (const item of source.classes) {
      const data = await keeper.api.learning.answers({
        moduleId: saved.id,
        classId: item.id,
      });
      listed.push(...data.answers.filter((row) => row.studentId === me.id));
    }
    expect(listed).toMatchObject([
      { recording: { fileId: mine, seconds: 3 }, marked: false },
    ]);
    const path = `/v1/files/${mine}/content`;
    expect((await raw("northwind", keeper.token, path)).status).toBe(200);
    expect((await raw("northwind", pupil.token, path)).status).toBe(200);
    expect((await raw("northwind", stranger.token, path)).status).toBe(404);
  });
});

describe("drawn answers", () => {
  test("a child answers with a drawing, which the teacher sees beside their name", async () => {
    const tenant = seeded().tenants[0];
    const school = tenant?.schools.find((row) => row.slug === "northwind");
    let keeper: Awaited<ReturnType<typeof sessionFor>> | null = null;
    for (const row of tenant?.logins ?? []) {
      if (row.role !== "teacher" || row.schoolId !== school?.id) continue;
      const session = await sessionFor("northwind", row.loginName);
      const { rows } = await session.api.learning.modules({});
      if (rows.some((item) => item.title === TITLE)) keeper ??= session;
    }
    if (!keeper) throw new Error("a teacher of the module needed");
    const { rows } = await keeper.api.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.api.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "My home",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const question = id();
    const lesson = await keeper.api.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Draw it",
      completion: "view",
      passScore: null,
      content: written([
        {
          id: question,
          type: "written",
          prompt: "Draw your home.",
          points: 0,
          hint: "",
          explanation: "",
          tries: null,
          wordLimit: null,
          answerWith: "drawing",
        },
      ]),
      publish: false,
    });
    await keeper.api.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    // A PNG's signature, which is all the upload check reads.
    const png = new Blob([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
    ]);
    const pupil = await sessionFor("northwind", login("student"));
    const file = await pupil.api.files.initiate({
      purpose: "document_media",
      name: "drawing.png",
      mediaType: "image/png",
      sizeBytes: png.size,
    });
    await raw("northwind", pupil.token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body: png,
    });
    const answer = (picture: boolean) =>
      pupil.api.learning.respond({
        lessonId: lesson.id,
        blockId: question,
        response: {
          type: "written",
          text: picture ? "" : "A house",
          ...(picture ? { picture: { fileId: file.id } } : {}),
        },
      });
    expect(await rejection(answer(false))).toMatchObject({
      code: "BAD_REQUEST",
      message: "learning.response",
    });
    await answer(true);

    const me = await pupil.api.identity.currentUser();
    const listed = [];
    for (const item of source.classes) {
      const data = await keeper.api.learning.answers({
        moduleId: saved.id,
        classId: item.id,
      });
      listed.push(...data.answers.filter((row) => row.studentId === me.id));
    }
    expect(listed).toMatchObject([
      { picture: { fileId: file.id }, recording: null, marked: false },
    ]);
    const path = `/v1/files/${file.id}/content`;
    expect((await raw("northwind", keeper.token, path)).status).toBe(200);
  });
});
