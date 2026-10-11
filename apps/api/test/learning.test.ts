import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { LessonDocument } from "@faridalms/domain/learning";

import { plainContent } from "@faridalms/domain/content-conversion";
import {
  contentOfLesson,
  lessonOfContent,
} from "@faridalms/domain/lesson-content";
import { blankProject } from "@faridalms/makecode/project";
import { PACKS } from "@faridalms/puzzles/levels";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";

import { sweepTenantFiles } from "../src/files/sweep";
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

/** Uploads bytes as a session's own file, ready to answer or build with. */
async function uploadAs(
  session: Awaited<ReturnType<typeof sessionFor>>,
  name: string,
  mediaType: string,
  body: Blob,
) {
  const file = await session.api.files.initiate({
    purpose: "document_media",
    name,
    mediaType,
    sizeBytes: body.size,
  });
  await raw("northwind", session.token, `/v1/files/${file.id}/content`, {
    method: "PUT",
    body,
  });
  return file.id;
}

type Session = Awaited<ReturnType<typeof sessionFor>>;

/** The seeded teachers split into one who teaches the module and one who does not. */
async function teacherSessions() {
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === "northwind");
  const names = (tenant?.logins ?? [])
    .filter((row) => row.role === "teacher" && row.schoolId === school?.id)
    .map((row) => row.loginName);
  let keeper: Session | null = null;
  let stranger: Session | null = null;
  for (const name of names) {
    const session = await sessionFor("northwind", name);
    const { rows } = await session.api.learning.modules({});
    if (rows.some((row) => row.title === TITLE)) keeper ??= session;
    else stranger ??= session;
  }
  if (!keeper || !stranger)
    throw new Error("the seed lacks a teacher of the module and one without");
  return { keeper, stranger };
}

/** How the files host answers a session asking for a file. */
const opens = async (session: Session, fileId: string) =>
  (await raw("northwind", session.token, `/v1/files/${fileId}/content`)).status;

async function teachers() {
  const { keeper, stranger } = await teacherSessions();
  return { keeper: keeper.api, stranger: stranger.api };
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
      hints: ["Think about what makes the characters act."],
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
      hints: ["It starts with s."],
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

describe("matching, ordering, sorting and code puzzles", () => {
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
      hints: [],
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
    const program = [
      { id: id(), code: "for planet in planets:", indent: 0 },
      { id: id(), code: "print(planet)", indent: 1 },
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
      {
        ...common,
        id: id(),
        type: "parsons" as const,
        prompt: "Print every planet.",
        language: "python" as const,
        lines: program,
        distractors: [{ id: id(), code: "print planet" }],
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
    expect(JSON.stringify(opened.blocks)).not.toContain("indent");
    const [matching, , sorting, puzzle] = blocks;
    if (!matching || !sorting || !puzzle) throw new Error("blocks");
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
    await pupil.learning.respond({
      lessonId,
      blockId: sorting.id,
      response: {
        type: "sorting",
        groups: Object.fromEntries(
          sorted.map((item) => [item.id, item.groupId]),
        ),
      },
    });
    const done = await pupil.learning.respond({
      lessonId,
      blockId: puzzle.id,
      response: {
        type: "parsons",
        lines: program.map(({ id: lineId, indent }) => ({
          id: lineId,
          indent,
        })),
      },
    });
    expect(done).toMatchObject({ completed: true, score: 100 });
  });
});

describe("blocks puzzles", () => {
  test("a puzzle is marked by running the student's program, and its answer is kept back until it is settled", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Stairs",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const staircase = PACKS[2].levels[1];
    const blockId = id();
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Down the stairs",
      completion: "quiz",
      passScore: null,
      content: written([
        {
          id: blockId,
          type: "puzzle",
          prompt: "Climb down to the star.",
          points: 1,
          hints: ["What do the first four blocks do, again and again?"],
          explanation: "",
          tries: null,
          level: staircase,
        },
      ]),
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
    const shown = blockOf(opened, "puzzle");
    expect(shown.level).not.toHaveProperty("solution");
    expect(shown.level.ideal).toBe(6);

    // Reaching the star is all that counts, so a program that says it did
    // is run again here and found short.
    const short = await pupil.learning.respond({
      lessonId,
      blockId,
      response: { type: "puzzle", program: [{ op: "forward" }] },
    });
    expect(short.check).toMatchObject({
      correct: false,
      tries: 1,
      hints: ["What do the first four blocks do, again and again?"],
      key: null,
    });
    expect(short.check).not.toHaveProperty("keyProgram");
    // A walk built from a block the puzzle does not offer is no answer.
    const walked = await pupil.learning.respond({
      lessonId,
      blockId,
      response: {
        type: "puzzle",
        program: [
          "east",
          "south",
          "east",
          "south",
          "east",
          "south",
          "east",
        ].map((to) => ({ op: "go" as const, to: to as "east" | "south" })),
      },
    });
    expect(walked.check).toMatchObject({ correct: false, tries: 2 });
    expect(
      await rejection(
        pupil.learning.respond({
          lessonId,
          blockId,
          response: {
            type: "puzzle",
            program: [{ op: "jump" }],
          } as never,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });

    const done = await pupil.learning.respond({
      lessonId,
      blockId,
      response: { type: "puzzle", program: staircase.solution },
    });
    expect(done).toMatchObject({ completed: true });
    expect(done.check).toMatchObject({
      correct: true,
      tries: 3,
      keyProgram: staircase.solution,
    });
  });
});

describe("code exercises", () => {
  test("a program is marked by running it, with its hidden tests kept from the student", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Squares",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const shown = { id: id(), input: "3", expected: "9", hidden: false };
    const hidden = { id: id(), input: "-4", expected: "16", hidden: true };
    const exercise = {
      id: id(),
      type: "program" as const,
      prompt: "Print the square of the number you are given.",
      points: 2,
      hints: [],
      explanation: "",
      tries: null,
      language: "python" as const,
      starter: "n = int(input())",
      tests: [shown, hidden],
    };
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Squares",
      completion: "quiz",
      passScore: null,
      content: written([exercise]),
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
    const block = blockOf(opened, "program");
    expect(block.tests).toEqual([{ id: shown.id, input: "3", expected: "9" }]);
    expect(block.hiddenTests).toEqual([hidden.id]);
    expect(JSON.stringify(opened.blocks)).not.toMatch(/"-4"|"16"/);

    // Results come only from running the program, never from the student.
    expect(
      await rejection(
        pupil.learning.respond({
          lessonId,
          blockId: exercise.id,
          response: {
            type: "program",
            code: "",
            results: {
              [shown.id]: {
                passed: true,
                output: null,
                error: null,
                stopped: null,
              },
            },
          },
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });

    // Runs in the browser are kept for the teacher, a repeat of the last
    // one once only.
    const tried = {
      lessonId,
      blockId: exercise.id,
      code: "n = int(input())\nprint(n)",
      input: "3",
      outcome: "done" as const,
      error: null,
      output: "3\n",
    };
    expect(await pupil.learning.run(tried)).toEqual({ kept: true });
    expect(await pupil.learning.run(tried)).toEqual({ kept: false });
    expect(
      await pupil.learning.run({
        ...tried,
        code: "n = int(input())\nprint(m)",
        outcome: "error",
        error: "NameError: name 'm' is not defined",
        output: "",
      }),
    ).toEqual({ kept: true });

    const half = await pupil.learning.respondProgram({
      lessonId,
      blockId: exercise.id,
      code: "n = int(input())\nprint(n * abs(n))",
    });
    expect(half.check).toMatchObject({ correct: false, fraction: 0.5 });
    const kept = half.check.response;
    if (kept?.type !== "program") throw new Error("program expected");
    expect(kept.results?.[shown.id]).toMatchObject({
      passed: true,
      output: "9\n",
    });
    expect(kept.results?.[hidden.id]).toEqual({
      passed: false,
      output: null,
      error: null,
      stopped: null,
    });

    const broken = await pupil.learning.respondProgram({
      lessonId,
      blockId: exercise.id,
      code: "n = int(input())\nprint(m * m)",
    });
    const failed = broken.check.response;
    if (failed?.type !== "program") throw new Error("program expected");
    expect(failed.results?.[shown.id]?.error).toBe(
      "NameError: name 'm' is not defined",
    );
    expect(failed.results?.[hidden.id]?.error).toBe("NameError");

    const done = await pupil.learning.respondProgram({
      lessonId,
      blockId: exercise.id,
      code: "n = int(input('A number? '))\nprint(n * n)",
    });
    expect(done.check).toMatchObject({ correct: true, fraction: 1 });
    expect(done.completed).toBe(true);

    // The teacher replays the runs and checks in order, and only they can.
    const me = await pupil.identity.currentUser();
    const asked = {
      moduleId: saved.id,
      lessonId,
      blockId: exercise.id,
      studentId: me.id,
    };
    const replays = await Promise.all(
      source.classes.map((item) =>
        keeper.learning.runs({ ...asked, classId: item.id }).catch(() => null),
      ),
    );
    const replay = replays.find((item) => item !== null);
    expect(replay?.runs.map((item) => [item.outcome, item.error])).toEqual([
      ["done", null],
      ["error", "NameError: name 'm' is not defined"],
    ]);
    expect(
      replay?.checks.map((item) =>
        item.kind === "checked" ? [item.passed, item.total] : item.kind,
      ),
    ).toEqual([
      [1, 2],
      [0, 2],
      [2, 2],
    ]);
    const classId =
      source.classes[replays.findIndex((item) => item !== null)]?.id ?? "";
    const view = await keeper.learning.questions({
      moduleId: saved.id,
      classId,
    });
    expect(
      view.lessons
        .flatMap((lesson) => lesson.questions)
        .find((question) => question.id === exercise.id)?.runs[me.id],
    ).toBe(2);
    const { stranger } = await teachers();
    for (const outsider of [stranger, pupil])
      expect(
        await rejection(outsider.learning.runs({ ...asked, classId })),
      ).toMatchObject({ code: "NOT_FOUND" });
  });
});

/** A lesson page with one runnable Python block. */
function runnablePage(program: string): ContentDocument {
  const text = plainContent("Run it, then change it.");
  const code: ContentNode = {
    type: "code",
    language: "python",
    version: 1,
    $: { id: "loopcode1", run: "run" },
    children: [
      { type: "code-highlight", text: program, format: 0, version: 1 },
    ],
  };
  return {
    root: { ...text.root, children: [...(text.root.children ?? []), code] },
  };
}

describe("runnable code", () => {
  test("a student's changes to a code block come back, saying when the teacher's code changed", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Loops",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const lesson = await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Loops",
      completion: "view",
      passScore: null,
      content: runnablePage("for i in range(3): print(i)"),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const lessonId = lesson.id;
    expect((await pupil.learning.playLesson({ id: lessonId })).codes).toEqual(
      {},
    );
    const mine = "for i in range(5): print(i * i)";
    await pupil.learning.keepCode({
      lessonId,
      blockId: "loopcode1",
      code: mine,
    });
    expect((await pupil.learning.playLesson({ id: lessonId })).codes).toEqual({
      loopcode1: { code: mine, changed: false },
    });
    expect(
      await rejection(
        pupil.learning.keepCode({
          lessonId,
          blockId: "nosuchblock",
          code: mine,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const editing = await keeper.learning.lesson({ id: lessonId });
    await keeper.learning.saveLesson({
      id: lessonId,
      moduleId: saved.id,
      expectedVersion: editing.version,
      title: "Loops",
      completion: "view",
      passScore: null,
      content: runnablePage("for i in range(4): print(i)"),
      publish: true,
    });
    expect((await pupil.learning.playLesson({ id: lessonId })).codes).toEqual({
      loopcode1: { code: mine, changed: true },
    });
  });
});

describe("javascript exercises", () => {
  test("a JavaScript program is marked by running it in a sandbox of its own", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Doubling",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const exercise = {
      id: id(),
      type: "program" as const,
      prompt: "Print the number doubled.",
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      language: "javascript" as const,
      starter: "",
      tests: [
        { id: id(), input: "4", expected: "8", hidden: false },
        { id: id(), input: "-3", expected: "-6", hidden: true },
      ],
    };
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Doubling",
      completion: "quiz",
      passScore: null,
      content: written([exercise]),
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
    expect(blockOf(opened, "program").language).toBe("javascript");
    const reaching = await pupil.learning.respondProgram({
      lessonId,
      blockId: exercise.id,
      code: "console.log(typeof fetch, typeof process)",
    });
    const kept = reaching.check.response;
    if (kept?.type !== "program") throw new Error("program expected");
    expect(kept.results?.[exercise.tests[0]?.id ?? ""]?.output).toBe(
      "undefined undefined\n",
    );
    const done = await pupil.learning.respondProgram({
      lessonId,
      blockId: exercise.id,
      code: "const n = Number(prompt('A number?'));\nconsole.log(n * 2);",
    });
    expect(done.check).toMatchObject({ correct: true, fraction: 1 });
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
          hints: [],
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
      hints: [],
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
          hints: [],
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
          hints: [],
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

describe("coding projects", () => {
  test("a student builds on the teacher's starter, and the teacher plays and marks it", async () => {
    const tenant = seeded().tenants[0];
    const school = tenant?.schools.find((row) => row.slug === "northwind");
    let teacher: Awaited<ReturnType<typeof sessionFor>> | null = null;
    for (const row of tenant?.logins ?? []) {
      if (row.role !== "teacher" || row.schoolId !== school?.id) continue;
      const session = await sessionFor("northwind", row.loginName);
      const { rows } = await session.api.learning.modules({});
      if (rows.some((item) => item.title === TITLE)) teacher ??= session;
    }
    if (!teacher) throw new Error("a teacher of the module needed");
    const keeper = teacher.api;
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "First game",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    // A zip's signature and a PNG's, which are all the upload check reads.
    const sb3 = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0])]);
    const png = new Blob([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
    ]);

    const starter = await uploadAs(
      teacher,
      "starter.sb3",
      "application/x.scratch.sb3",
      sb3,
    );
    const question = id();
    const lesson = await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Make the cat dance",
      completion: "view",
      passScore: null,
      content: written([
        {
          id: question,
          type: "scratch",
          prompt: "Make the cat dance when the flag is clicked.",
          points: 4,
          hints: [],
          explanation: "",
          tries: null,
          starter: { fileId: starter },
          gallery: false,
          checks: [],
        },
      ]),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await sessionFor("northwind", login("student"));
    const played = await pupil.api.learning.playLesson({ id: lesson.id });
    expect(played.blocks).toContainEqual(
      expect.objectContaining({
        id: question,
        type: "scratch",
        starter: { fileId: starter },
      }),
    );
    const starterPath = `/v1/files/${starter}/content`;
    expect((await raw("northwind", pupil.token, starterPath)).status).toBe(200);

    const project = await uploadAs(
      pupil,
      "project.sb3",
      "application/x.scratch.sb3",
      sb3,
    );
    const stage = await uploadAs(pupil, "stage.png", "image/png", png);
    expect(
      await rejection(
        pupil.api.learning.respond({
          lessonId: lesson.id,
          blockId: question,
          response: { type: "written", text: "I made it dance." },
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "learning.response" });
    await pupil.api.learning.respond({
      lessonId: lesson.id,
      blockId: question,
      response: {
        type: "scratch",
        project: { fileId: project },
        thumbnail: { fileId: stage },
      },
    });

    const me = await pupil.api.identity.currentUser();
    const listed = [];
    for (const item of source.classes) {
      const data = await keeper.learning.answers({
        moduleId: saved.id,
        classId: item.id,
      });
      expect(data.questions).toContainEqual(
        expect.objectContaining({ blockId: question, kind: "scratch" }),
      );
      listed.push(...data.answers.filter((row) => row.studentId === me.id));
    }
    expect(listed).toMatchObject([
      {
        project: { fileId: project },
        thumbnail: { fileId: stage },
        marked: false,
      },
    ]);
    const projectPath = `/v1/files/${project}/content`;
    expect((await raw("northwind", teacher.token, projectPath)).status).toBe(200);

    // Each save keeps the whole project, so only the last few stay.
    const saves = [project];
    for (let save = 0; save < 4; save += 1) {
      const next = await uploadAs(
        pupil,
        `project-${save}.sb3`,
        "application/x.scratch.sb3",
        sb3,
      );
      await pupil.api.learning.respond({
        lessonId: lesson.id,
        blockId: question,
        response: { type: "scratch", project: { fileId: next } },
      });
      saves.push(next);
    }
    const { cell, files, tenants } = seeded();
    const swept = await sweepTenantFiles(
      cell,
      files,
      tenants[0]?.tenantId ?? "",
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    );
    expect(swept.superseded).toBeGreaterThanOrEqual(3);
    const served = async (fileId: string) =>
      (await raw("northwind", teacher.token, `/v1/files/${fileId}/content`)).status;
    expect(await served(project)).toBe(404);
    expect(await served(stage)).toBe(404);
    expect(await served(saves[1] ?? "")).toBe(404);
    for (const kept of saves.slice(2)) expect(await served(kept)).toBe(200);

    expect(
      await keeper.learning.mark({
        lessonId: lesson.id,
        blockId: question,
        studentId: me.id,
        points: 3,
        feedback: "The cat dances. Try a loop for the steps.",
      }),
    ).toEqual({ marked: true });
    const seen = await pupil.api.learning.playLesson({ id: lesson.id });
    expect(seen.checks[question]).toMatchObject({ marked: true, credit: 3 });
  });
});

/** A saved project whose one sprite runs these blocks from the flag. */
const savedProject = (blocks: Record<string, unknown>) =>
  new Blob([
    zipSync({
      "project.json": strToU8(
        JSON.stringify({
          targets: [
            { isStage: true, name: "Stage", blocks: {} },
            { isStage: false, name: "Sprite1", blocks },
          ],
        }),
      ),
    }),
  ]);
const flag = {
  opcode: "event_whenflagclicked",
  next: "loop",
  inputs: {},
  fields: {},
  topLevel: true,
};
const forever = {
  opcode: "control_forever",
  next: null,
  inputs: { SUBSTACK: [2, "step"] },
  fields: {},
  topLevel: false,
};
const step = {
  opcode: "motion_movesteps",
  next: null,
  inputs: {},
  fields: {},
  topLevel: false,
};

describe("what a coding project should do", () => {
  test("each save is read for what the teacher asked for, whatever the student says of it", async () => {
    const { keeper } = await teacherSessions();
    const { rows } = await keeper.api.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.api.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "A walking cat",
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
      title: "Make the cat walk",
      completion: "view",
      passScore: null,
      content: written([
        {
          id: question,
          type: "scratch",
          prompt: "Make the cat walk for ever.",
          points: 2,
          hints: [],
          explanation: "",
          tries: null,
          starter: null,
          gallery: false,
          checks: ["flag", "loop", "sound"],
        },
      ]),
      publish: false,
    });
    await keeper.api.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const ref = { lessonId: lesson.id, blockId: question };
    const classId = source.classes[0]?.id ?? "";

    const pupil = await sessionFor("northwind", login("student"));
    const me = await pupil.api.identity.currentUser();
    const played = await pupil.api.learning.playLesson({ id: lesson.id });
    expect(played.blocks).toContainEqual(
      expect.objectContaining({
        id: question,
        checks: ["flag", "loop", "sound"],
      }),
    );
    const save = async (file: Blob, claim?: ("flag" | "loop" | "sound")[]) => {
      const project = await uploadAs(
        pupil,
        "project.sb3",
        "application/x.scratch.sb3",
        file,
      );
      await pupil.api.learning.respond({
        ...ref,
        response: {
          type: "scratch",
          project: { fileId: project },
          ...(claim ? { has: claim } : {}),
        },
      });
      const seen = await pupil.api.learning.playLesson({ id: lesson.id });
      const answers = await keeper.api.learning.answers({
        moduleId: saved.id,
        classId,
      });
      return {
        mine: seen.checks[question]?.response,
        theirs: answers.answers.find((answer) => answer.studentId === me.id),
      };
    };

    // The flag alone starts nothing that repeats.
    const first = await save(
      savedProject({ start: { ...flag, next: "step" }, step }),
    );
    expect(first.mine).toMatchObject({ type: "scratch", has: ["flag"] });
    expect(first.theirs).toMatchObject({ has: ["flag"] });

    // A loop with something in it counts; a claim to more does not.
    const second = await save(
      savedProject({ start: flag, loop: forever, step }),
      ["flag", "loop", "sound"],
    );
    expect(second.mine).toMatchObject({ has: ["flag", "loop"] });
    expect(second.theirs).toMatchObject({ has: ["flag", "loop"] });

    // A file that is no project has none of it.
    const third = await save(
      new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0])]),
      ["flag"],
    );
    expect(third.mine).toMatchObject({ has: [] });

    const asked = await keeper.api.learning.answers({
      moduleId: saved.id,
      classId,
    });
    expect(asked.questions).toContainEqual(
      expect.objectContaining({
        blockId: question,
        checks: ["flag", "loop", "sound"],
      }),
    );
  });
});

describe("web projects", () => {
  test("a student's project is kept as they build, and reaches the teacher when handed in", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "My first page",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const starter = [
      { name: "index.html", code: "<h1>My pet</h1>" },
      { name: "style.css", code: "" },
    ];
    const question = id();
    const asking = (files: typeof starter) =>
      written([
        {
          id: question,
          type: "project",
          prompt: "Make a page about a pet.",
          points: 4,
          hints: [],
          explanation: "",
          tries: null,
          files,
          gallery: false,
          language: "web" as const,
        },
      ]);
    const lesson = await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "A page about a pet",
      completion: "view",
      passScore: null,
      content: asking(starter),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const me = await pupil.identity.currentUser();
    const lessonId = lesson.id;
    const played = await pupil.learning.playLesson({ id: lessonId });
    expect(played.blocks).toContainEqual(
      expect.objectContaining({
        id: question,
        type: "project",
        files: starter,
      }),
    );
    expect(played.projects).toEqual({});

    const mine = [
      {
        name: "index.html",
        code: '<h1>Biscuit</h1><script src="say.js"></script>',
      },
      { name: "style.css", code: "h1 { color: teal; }" },
      { name: "say.js", code: 'console.log("woof");' },
    ];
    await pupil.learning.keepProject({
      lessonId,
      blockId: question,
      files: mine,
    });
    const kept = await pupil.learning.playLesson({ id: lessonId });
    expect(kept.projects).toEqual({
      [question]: { files: mine, changed: false },
    });
    // Keeping is not handing in: nothing is sent, nothing waits for a mark.
    expect(kept.checks[question]).toMatchObject({ tries: 0, response: null });
    // The teacher in the room sees the project as it stands, unsent.
    const walls = await Promise.all(
      source.classes.map((item) =>
        keeper.learning.live({ moduleId: saved.id, classId: item.id }),
      ),
    );
    expect(walls.flatMap((wall) => wall.projects)).toEqual([
      expect.objectContaining({
        studentId: me.id,
        lessonId,
        blockId: question,
        prompt: "Make a page about a pet.",
        files: mine,
      }),
    ]);
    expect(
      await rejection(
        pupil.learning.keepProject({
          lessonId,
          blockId: id(),
          files: mine,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    // A project with no page to open is no project.
    expect(
      await rejection(
        pupil.learning.keepProject({
          lessonId,
          blockId: question,
          files: [{ name: "style.css", code: "" }],
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });

    const sent = await pupil.learning.respond({
      lessonId,
      blockId: question,
      response: { type: "project", files: mine },
    });
    expect(sent.check).toMatchObject({
      tries: 1,
      marked: false,
      response: { type: "project", files: mine },
    });
    const listed = [];
    for (const item of source.classes) {
      const data = await keeper.learning.answers({
        moduleId: saved.id,
        classId: item.id,
      });
      expect(data.questions).toContainEqual(
        expect.objectContaining({ blockId: question, kind: "project" }),
      );
      listed.push(...data.answers.filter((row) => row.studentId === me.id));
    }
    expect(listed).toMatchObject([{ files: mine, marked: false }]);

    // The teacher's later edit of the starter shows on the student's copy.
    const editing = await keeper.learning.lesson({ id: lessonId });
    await keeper.learning.saveLesson({
      id: lessonId,
      moduleId: saved.id,
      expectedVersion: editing.version,
      title: "A page about a pet",
      completion: "view",
      passScore: null,
      content: asking([{ name: "index.html", code: "<h1>My pet</h1><p></p>" }]),
      publish: true,
    });
    expect(
      (await pupil.learning.playLesson({ id: lessonId })).projects[question],
    ).toEqual({ files: mine, changed: true });

    expect(
      await keeper.learning.mark({
        lessonId,
        blockId: question,
        studentId: me.id,
        points: 3,
        feedback: "Biscuit has a page. Give the heading a picture.",
      }),
    ).toEqual({ marked: true });
    const seen = await pupil.learning.playLesson({ id: lessonId });
    expect(seen.checks[question]).toMatchObject({ marked: true, credit: 3 });
    expect(
      await rejection(
        pupil.learning.respond({
          lessonId,
          blockId: question,
          response: { type: "project", files: mine },
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "learning.settled" });
  });
});

/** A project question, with a class gallery or without. */
const projectAsked = (blockId: string, gallery: boolean) => ({
  id: blockId,
  type: "project" as const,
  prompt: "Make a page.",
  points: 2,
  hints: [],
  explanation: "",
  tries: null,
  files: [],
  gallery,
  language: "web" as const,
});

/** A project of one page. */
const onePage = (heading: string) => [
  { name: "index.html", code: `<h1>${heading}</h1>` },
];

describe("micro:bit projects", () => {
  test("a project built in the board's editor is kept and handed in as its files", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Boards",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const question = id();
    const lesson = await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Show a number",
      completion: "view",
      passScore: null,
      content: written([
        {
          id: question,
          type: "project",
          prompt: "Show your lucky number.",
          points: 2,
          hints: [],
          explanation: "",
          tries: null,
          files: [],
          gallery: false,
          language: "microbit" as const,
        },
      ]),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const lessonId = lesson.id;
    const played = await pupil.learning.playLesson({ id: lessonId });
    expect(played.blocks).toContainEqual(
      expect.objectContaining({ id: question, language: "microbit" }),
    );
    const mine = blankProject().map((file) =>
      file.name === "main.ts"
        ? { ...file, code: "basic.showNumber(7)\n" }
        : file,
    );
    await pupil.learning.keepProject({
      lessonId,
      blockId: question,
      files: mine,
    });
    expect(
      (await pupil.learning.playLesson({ id: lessonId })).projects,
    ).toEqual({ [question]: { files: mine, changed: false } });
    // What the editor keeps for itself is no file of a project.
    expect(
      await rejection(
        pupil.learning.keepProject({
          lessonId,
          blockId: question,
          files: [...mine, { name: "_history", code: "[]" }],
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    const sent = await pupil.learning.respond({
      lessonId,
      blockId: question,
      response: { type: "project", files: mine },
    });
    expect(sent.check).toMatchObject({ tries: 1, marked: false });
  });
});

describe("the class gallery", () => {
  test("a student offers a project, classmates see it once the teacher shows it, and one builds on it", async () => {
    const { keeper, stranger } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Pages to share",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const shared = id();
    const kept = id();
    const lesson = await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "A page to show",
      completion: "view",
      passScore: null,
      content: written([projectAsked(shared, true), projectAsked(kept, false)]),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const lessonId = lesson.id;
    const ref = { lessonId, blockId: shared };

    // The seed's two students who can sign in sit in one class.
    const first = await student();
    const me = await first.identity.currentUser();
    const second = await signedIn("northwind", login("student", 0, 1));
    const mate = { api: second, id: (await second.identity.currentUser()).id };

    expect(await first.learning.gallery(ref)).toEqual({
      handedIn: false,
      mine: null,
      students: [],
      projects: [],
    });
    // Only what a teacher has been sent can be offered to the class.
    expect(await rejection(first.learning.offerShare(ref))).toMatchObject({
      code: "CONFLICT",
      message: "learning.share_unsent",
    });
    await first.learning.respond({
      ...ref,
      // Whose project it builds on is not a student's to say.
      response: { type: "project", files: onePage("Mine"), remixOf: mate.id },
    });
    expect(await first.learning.offerShare(ref)).toEqual({ state: "offered" });
    expect(await first.learning.gallery(ref)).toMatchObject({
      handedIn: true,
      mine: { state: "offered", latest: true },
      projects: [],
    });

    // A classmate sees nothing before handing in, and nothing not yet shown.
    expect((await mate.api.learning.gallery(ref)).projects).toEqual([]);
    await mate.api.learning.respond({
      ...ref,
      response: { type: "project", files: onePage("Theirs") },
    });
    expect((await mate.api.learning.gallery(ref)).projects).toEqual([]);

    const classId = source.classes[0]?.id ?? "";
    const offered = await keeper.learning.answers({
      moduleId: saved.id,
      classId,
    });
    expect(offered.questions).toContainEqual(
      expect.objectContaining({ blockId: shared, gallery: true }),
    );
    expect(offered.questions).toContainEqual(
      expect.objectContaining({ blockId: kept, gallery: false }),
    );
    // What was offered is the answer the teacher is looking at.
    expect(
      offered.answers.find(
        (answer) => answer.studentId === me.id && answer.blockId === shared,
      ),
    ).toMatchObject({ share: "offered", offered: null });
    const decision = { ...ref, studentId: me.id, show: true };
    expect(
      await rejection(stranger.learning.decideShare(decision)),
    ).toMatchObject({ code: "NOT_FOUND" });
    // A module is not a student's to teach, so to them it is not there.
    expect(await rejection(first.learning.decideShare(decision))).toMatchObject(
      { code: "NOT_FOUND" },
    );
    expect(await keeper.learning.decideShare(decision)).toEqual({
      state: "shown",
    });
    // Nothing was offered by the classmate, so there is nothing to show.
    expect(
      await rejection(
        keeper.learning.decideShare({ ...decision, studentId: mate.id }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const seen = await mate.api.learning.gallery(ref);
    expect(seen.projects).toEqual([
      { studentId: me.id, files: onePage("Mine"), studio: null, remixOf: null },
    ]);
    expect(seen.students.map((person) => person.id)).toEqual([me.id]);
    expect(await first.learning.gallery(ref)).toMatchObject({
      mine: { state: "shown", latest: true },
      projects: [],
    });
    // A newer hand-in is not what the class sees until it is offered too.
    await first.learning.respond({
      ...ref,
      response: { type: "project", files: onePage("Mine, improved") },
    });
    expect(await first.learning.gallery(ref)).toMatchObject({
      mine: { state: "shown", latest: false },
    });
    expect((await mate.api.learning.gallery(ref)).projects).toEqual([
      { studentId: me.id, files: onePage("Mine"), studio: null, remixOf: null },
    ]);
    // The teacher is looking at the newer one, and is shown what the class sees.
    const apart = await keeper.learning.answers({
      moduleId: saved.id,
      classId,
    });
    expect(
      apart.answers.find(
        (answer) => answer.studentId === me.id && answer.blockId === shared,
      ),
    ).toMatchObject({
      files: onePage("Mine, improved"),
      share: "shown",
      offered: { files: onePage("Mine") },
    });
    expect(
      await rejection(first.learning.gallery({ lessonId, blockId: kept })),
    ).toMatchObject({ code: "NOT_FOUND" });

    // The classmate begins again from the shown project, and says so on hand-in.
    const item = { ...ref, studentId: me.id };
    expect(await mate.api.learning.remixShare(item)).toEqual({
      files: onePage("Mine"),
    });
    expect(
      (await mate.api.learning.playLesson({ id: lessonId })).projects[shared],
    ).toMatchObject({ files: onePage("Mine") });
    expect(
      await rejection(first.learning.remixShare({ ...ref, studentId: me.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    await mate.api.learning.respond({
      ...ref,
      response: { type: "project", files: onePage("Mine, with more") },
    });
    const answers = async () => {
      const found = [];
      for (const row of source.classes) {
        const data = await keeper.learning.answers({
          moduleId: saved.id,
          classId: row.id,
        });
        found.push(
          ...data.answers.filter((answer) => answer.blockId === shared),
        );
      }
      return found;
    };
    const marked = await answers();
    expect(marked.find((answer) => answer.studentId === mate.id)).toMatchObject(
      { remixOf: me.id, share: null },
    );
    expect(marked.find((answer) => answer.studentId === me.id)).toMatchObject({
      remixOf: null,
      share: "shown",
    });

    // Beginning again from the starter builds on nobody's project.
    await mate.api.learning.keepProject({
      ...ref,
      files: onePage("All my own"),
      fresh: true,
    });
    await mate.api.learning.respond({
      ...ref,
      response: { type: "project", files: onePage("All my own") },
    });
    expect(
      (await answers()).find((answer) => answer.studentId === mate.id),
    ).toMatchObject({ remixOf: null });

    // A project offered again waits for the teacher again; taken back, it is gone.
    await first.learning.offerShare(ref);
    expect((await mate.api.learning.gallery(ref)).projects).toEqual([]);
    await keeper.learning.decideShare(decision);
    expect((await mate.api.learning.gallery(ref)).projects).toHaveLength(1);
    await keeper.learning.decideShare({ ...decision, show: false });
    expect((await mate.api.learning.gallery(ref)).projects).toEqual([]);
    expect(await first.learning.gallery(ref)).toMatchObject({
      mine: { state: "declined" },
    });
    expect(await first.learning.withdrawShare(ref)).toEqual({ state: null });
    expect(await first.learning.gallery(ref)).toMatchObject({ mine: null });
  });

  test("a coding project shown to the class opens to classmates who saved their own, and a save says whose it built on", async () => {
    const { keeper, stranger } = await teacherSessions();
    const { rows } = await keeper.api.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.api.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Games to share",
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
      title: "A game to show",
      completion: "view",
      passScore: null,
      content: written([
        {
          id: question,
          type: "scratch",
          prompt: "Make a game.",
          points: 2,
          hints: [],
          explanation: "",
          tries: null,
          starter: null,
          gallery: true,
          checks: [],
        },
      ]),
      publish: false,
    });
    await keeper.api.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const ref = { lessonId: lesson.id, blockId: question };
    const classId = source.classes[0]?.id ?? "";

    const first = await sessionFor("northwind", login("student"));
    const second = await sessionFor("northwind", login("student", 0, 1));
    const me = await first.api.identity.currentUser();
    const mate = await second.api.identity.currentUser();
    // A zip's signature and a PNG's, which are all the upload check reads.
    const sb3 = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0])]);
    const png = new Blob([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
    ]);
    const save = async (session: Session, remixOf?: string) => {
      const project = await uploadAs(
        session,
        "project.sb3",
        "application/x.scratch.sb3",
        sb3,
      );
      await session.api.learning.respond({
        ...ref,
        response: {
          type: "scratch",
          project: { fileId: project },
          ...(remixOf ? { remixOf } : {}),
        },
      });
      return project;
    };
    const creditOf = async (studentId: string) =>
      (
        await keeper.api.learning.answers({ moduleId: saved.id, classId })
      ).answers.find((answer) => answer.studentId === studentId)?.remixOf;

    const mine = await uploadAs(
      first,
      "project.sb3",
      "application/x.scratch.sb3",
      sb3,
    );
    const stage = await uploadAs(first, "stage.png", "image/png", png);
    await first.api.learning.respond({
      ...ref,
      response: {
        type: "scratch",
        project: { fileId: mine },
        thumbnail: { fileId: stage },
      },
    });
    expect(await first.api.learning.offerShare(ref)).toEqual({
      state: "offered",
    });

    // A project the teacher has not shown is nobody's to build on or open.
    await save(second, me.id);
    expect(await creditOf(mate.id)).toBeNull();
    expect(await opens(second, mine)).toBe(404);
    expect((await second.api.learning.gallery(ref)).projects).toEqual([]);

    await keeper.api.learning.decideShare({
      ...ref,
      studentId: me.id,
      show: true,
    });
    expect((await second.api.learning.gallery(ref)).projects).toEqual([
      {
        studentId: me.id,
        files: [],
        studio: { projectFileId: mine, thumbnailFileId: stage },
        remixOf: null,
      },
    ]);
    expect(await opens(second, mine)).toBe(200);
    expect(await opens(second, stage)).toBe(200);
    // It opens to the class it was shown to, and to no teacher of another.
    expect(await opens(stranger, mine)).toBe(404);

    // Built on in the studio, the save says whose it began from.
    await save(second, me.id);
    expect(await creditOf(mate.id)).toBe(me.id);
    expect(await creditOf(me.id)).toBeNull();
    // Nobody builds on their own.
    await save(first, me.id);
    expect(await creditOf(me.id)).toBeNull();

    // What the gallery holds stays, however many saves come after it.
    for (let more = 0; more < 4; more += 1) await save(first);
    const { cell, files, tenants } = seeded();
    const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const tenantId = tenants[0]?.tenantId ?? "";
    await sweepTenantFiles(cell, files, tenantId, later);
    expect(await opens(second, mine)).toBe(200);
    expect(await opens(second, stage)).toBe(200);

    const now = await keeper.api.learning.live({ moduleId: saved.id, classId });
    expect(new Set(now.studios.map((item) => item.studentId))).toEqual(
      new Set([me.id, mate.id]),
    );
    expect(now.studios.map((item) => item.prompt)).toEqual([
      "Make a game.",
      "Make a game.",
    ]);
    expect(
      now.studios.find((item) => item.studentId === me.id)?.projectFileId,
    ).not.toBe(mine);

    // Taken back, it is closed to the class and swept with the other saves.
    expect(await first.api.learning.withdrawShare(ref)).toEqual({
      state: null,
    });
    expect(await opens(second, mine)).toBe(404);
    // The credit stands while each save repeats it, and cannot be made anew.
    await save(second, me.id);
    expect(await creditOf(mate.id)).toBe(me.id);
    await save(second);
    await save(second, me.id);
    expect(await creditOf(mate.id)).toBeNull();
    await sweepTenantFiles(cell, files, tenantId, later);
    expect(await opens(keeper, mine)).toBe(404);
  });
});

describe("mixed review", () => {
  test("a student reviews finished lessons, missed questions first, marked without changing scores", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Colours review",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const ask = (prompt: string) => {
      const right = id();
      return {
        right,
        wrong: id(),
        block: {
          id: id(),
          type: "choice" as const,
          prompt,
          points: 1,
          hints: [],
          explanation: `About ${prompt}`,
          tries: 1,
          options: [] as { id: string; text: string; feedback: string }[],
          correctOptionIds: [right],
          multiple: false,
          shuffle: false,
        },
      };
    };
    const lessonOf = (title: string, prompts: string[]) => {
      const asked = prompts.map(ask).map((item) => ({
        ...item,
        block: {
          ...item.block,
          options: [
            { id: item.right, text: "Yes", feedback: "" },
            { id: item.wrong, text: "No", feedback: "" },
          ],
        },
      }));
      return { title, asked };
    };
    const lessons = [
      lessonOf("Red", ["Is a tomato red?", "Is a cherry red?"]),
      lessonOf("Blue", ["Is the sky blue?", "Is the sea blue?"]),
      lessonOf("Green", ["Is grass green?"]),
    ];
    for (const lesson of lessons)
      await keeper.learning.saveLesson({
        id: "",
        moduleId: saved.id,
        expectedVersion: 0,
        title: lesson.title,
        // Opening a "view" lesson finishes it; the last waits for answers.
        completion: lesson.title === "Green" ? "quiz" : "view",
        passScore: null,
        content: written(lesson.asked.map((item) => item.block)),
        publish: false,
      });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const outline = await pupil.learning.play({ id: saved.id });
    const missed = lessons[0]?.asked[0];
    if (!missed) throw new Error("no question");
    // The first two lessons are finished, one question missed; the third
    // is only opened.
    for (const [index, lesson] of lessons.slice(0, 2).entries()) {
      const lessonId = outline.lessons[index]?.id ?? "";
      await pupil.learning.playLesson({ id: lessonId });
      for (const item of lesson.asked)
        await pupil.learning.respond({
          lessonId,
          blockId: item.block.id,
          response: {
            type: "choice",
            optionIds: [item === missed ? item.wrong : item.right],
          },
        });
    }
    const third = outline.lessons[2]?.id ?? "";
    await pupil.learning.playLesson({ id: third });

    const set = await pupil.learning.practiceSet({ moduleId: saved.id });
    expect(set).toMatchObject({ enough: true, young: false, sounds: true });
    expect(set.items).toHaveLength(4);
    expect(set.items[0]).toMatchObject({
      missed: true,
      block: { id: missed.block.id },
    });
    expect(JSON.stringify(set.items)).not.toContain("correctOptionIds");
    const firstLesson = outline.lessons[0]?.id ?? "";
    const right = await pupil.learning.practiceCheck({
      lessonId: firstLesson,
      blockId: missed.block.id,
      before: 0,
      answer: {
        kind: "response",
        response: { type: "choice", optionIds: [missed.right] },
      },
    });
    expect(right).toMatchObject({
      correct: true,
      explanation: "About Is a tomato red?",
    });
    const before = await pupil.learning.playLesson({ id: firstLesson });
    expect(before.checks[missed.block.id]?.correct).toBe(false);

    const unfinished = lessons[2]?.asked[0];
    expect(
      await rejection(
        pupil.learning.practiceCheck({
          lessonId: third,
          blockId: unfinished?.block.id ?? "",
          before: 0,
          answer: { kind: "reveal" },
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("right now", () => {
  test("a teacher sees a student guessing, then finding the answer", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Shapes now",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const options = ["Circle", "Square", "Triangle", "Star"].map((text) => ({
      id: id(),
      text,
      feedback: "",
    }));
    const block = {
      id: id(),
      type: "choice" as const,
      prompt: "Which has three sides?",
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      options,
      correctOptionIds: [options[2]?.id ?? ""],
      multiple: false,
      shuffle: false,
    };
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Sides",
      completion: "quiz",
      passScore: null,
      // A second question keeps the lesson open after the first is right.
      content: written([
        block,
        { ...block, id: id(), prompt: "Which is round?" },
      ]),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const outline = await pupil.learning.play({ id: saved.id });
    const lessonId = outline.lessons[0]?.id ?? "";
    await pupil.learning.playLesson({ id: lessonId });
    const answer = (index: number) =>
      pupil.learning.respond({
        lessonId,
        blockId: block.id,
        response: { type: "choice", optionIds: [options[index]?.id ?? ""] },
      });
    for (const index of [0, 1, 3]) await answer(index);

    const watched = async () => {
      for (const item of source.classes) {
        const seen = await keeper.learning.live({
          moduleId: saved.id,
          classId: item.id,
        });
        const row = seen.rows.find((each) => each.state !== "away");
        if (row) return { row, lessons: seen.lessons };
      }
      throw new Error("nobody in a lesson");
    };
    const guessing = await watched();
    expect(guessing.row).toMatchObject({
      state: "guessing",
      lessonId,
      misses: 3,
      answered: 1,
    });
    expect(guessing.lessons).toContainEqual({
      id: lessonId,
      title: "Sides",
      questions: 2,
    });

    await answer(2);
    expect((await watched()).row).toMatchObject({ state: "found", misses: 3 });
    expect(
      await rejection(
        pupil.learning.live({
          moduleId: saved.id,
          classId: source.classes[0]?.id ?? "",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("watching recordings", () => {
  test("a lesson that finishes on watching counts only what was played, and picks up where it stopped", async () => {
    const tenant = seeded().tenants[0];
    const school = tenant?.schools.find((row) => row.slug === "northwind");
    let teacher: Awaited<ReturnType<typeof sessionFor>> | null = null;
    for (const row of tenant?.logins ?? []) {
      if (row.role !== "teacher" || row.schoolId !== school?.id) continue;
      const session = await sessionFor("northwind", row.loginName);
      const { rows } = await session.api.learning.modules({});
      if (rows.some((item) => item.title === TITLE)) teacher ??= session;
    }
    if (!teacher) throw new Error("a teacher of the module needed");
    const keeper = teacher.api;
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Listening",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    // An MP3's ID3 signature, which is all the upload check reads.
    const mp3 = new Blob([new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0])]);
    const recording = await uploadAs(teacher, "story.mp3", "audio/mpeg", mp3);

    const lessonOf = (media: boolean) =>
      written([
        {
          id: id(),
          type: "content",
          content: plainContent("Listen to the story, then tell a friend."),
        },
        ...(media
          ? [
              {
                id: id(),
                type: "media" as const,
                fileId: recording,
                name: "story.mp3",
                mediaType: "audio/mpeg",
                sizeBytes: mp3.size,
                caption: "",
                captionsFileId: null,
                captionsLang: "en" as const,
                transcript: "Once upon a time.",
              },
            ]
          : []),
      ]);
    const draft = await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "The story",
      completion: "watch",
      passScore: null,
      content: lessonOf(false),
      publish: false,
    });
    expect(
      await rejection(
        keeper.learning.publishModule({
          id: saved.id,
          expectedVersion: saved.version,
        }),
      ),
    ).toMatchObject({ message: "learning.needs_media" });
    const lesson = await keeper.learning.saveLesson({
      id: draft.id,
      moduleId: saved.id,
      expectedVersion: draft.version,
      title: "The story",
      completion: "watch",
      passScore: null,
      content: lessonOf(true),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const opened = await pupil.learning.playLesson({ id: lesson.id });
    expect(opened.completedAt).toBeNull();
    expect(opened.watches).toEqual({});

    // Forty seconds, then a skip to the end: skipped seconds never count.
    const first = await pupil.learning.watch({
      lessonId: lesson.id,
      fileId: recording,
      ranges: [
        [0, 30],
        [20, 40],
        [95, 100],
      ],
      durationSeconds: 100,
      positionSeconds: 40,
    });
    // Played without a gap only to forty, which is as far as a recording
    // that holds students to what they have watched lets them seek.
    expect(first).toMatchObject({
      completed: false,
      watched: { watchedSeconds: 45, durationSeconds: 100, reachedSeconds: 40 },
    });
    const resumed = await pupil.learning.playLesson({ id: lesson.id });
    expect(resumed.watches[recording]).toMatchObject({
      watchedSeconds: 45,
      durationSeconds: 100,
      positionSeconds: 40,
    });

    // Played again from the start, then on to ninety: past nine tenths, done.
    const second = await pupil.learning.watch({
      lessonId: lesson.id,
      fileId: recording,
      ranges: [
        [0, 10],
        [40, 90],
        [90, 140],
      ],
      durationSeconds: 100,
      positionSeconds: 140,
    });
    expect(second).toMatchObject({
      completed: true,
      watched: { watchedSeconds: 100, reachedSeconds: 100 },
    });
    const finished = await pupil.learning.playLesson({ id: lesson.id });
    expect(finished.completedAt).not.toBeNull();
    expect(finished.watches[recording]).toMatchObject({
      watchedSeconds: 100,
      positionSeconds: 100,
    });

    // The teacher sees how far the class watched it, moment by moment.
    const classId = source.classes[0]?.id ?? "";
    const insight = await keeper.learning.videos({
      moduleId: saved.id,
      classId,
    });
    const story = insight.recordings.find((row) => row.fileId === recording);
    expect(story).toMatchObject({ name: "story.mp3", durationSeconds: 100 });
    expect(Object.values(story?.watched ?? {})).toContain(100);
    expect(Math.min(...(story?.curve ?? [0]))).toBeGreaterThanOrEqual(1);
    // Twenty to thirty was played twice in the first report, the start and
    // the end again in the second; the middle never.
    const again = story?.again ?? [];
    const at = (moment: number) =>
      again[Math.floor((moment / 100) * again.length)] ?? -1;
    expect([at(5), at(25), at(60), at(97)]).toEqual([1, 1, 0, 1]);

    // Only a recording in the lesson can be reported.
    expect(
      await rejection(
        pupil.learning.watch({
          lessonId: lesson.id,
          fileId: id(),
          ranges: [[0, 5]],
          durationSeconds: 10,
          positionSeconds: 5,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});
