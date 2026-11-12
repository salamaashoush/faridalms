import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { LessonDocument } from "@faridalms/domain/learning";

import { plainContent } from "@faridalms/domain/content-conversion";
import {
  contentOfLesson,
  lessonOfContent,
} from "@faridalms/domain/lesson-content";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { wordSearch } from "@faridalms/domain/wordsearch";
import { blankProject, locked, lockOf } from "@faridalms/makecode/project";
import { PACKS } from "@faridalms/puzzles/levels";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { join } from "node:path";

import { rerunPrograms } from "../src/coding/rerun";
import { createJavaScriptRunner, createPythonRunner } from "../src/coding/run";
import { sweepTenantFiles } from "../src/files/sweep";
import {
  login,
  raw,
  rejection,
  seeded,
  sessionFor,
  setPlan,
  signedIn,
  workerModules,
} from "./harness";

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
      // Opening the reading finishes it, and so leads on to the next lesson.
      const read = await api.learning.playLesson({ id: reading.id });
      expect(read.next).toBe(check.id);
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

describe("a class's year map", () => {
  test("a teacher places a class's units across the school year, inside it, and clears them", async () => {
    const { keeper, stranger } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    const classId = source?.classes[0]?.id ?? "";
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Weather words",
      summary: "",
      classIds: [classId],
      prerequisiteId: "",
      sequential: false,
    });
    const before = await keeper.learning.unitPlan({ classId });
    expect(before.classId).toBe(classId);
    const placed = before.units.find((row) => row.id === saved.id);
    expect(placed).toMatchObject({ startsOn: null, endsOn: null });

    if (!before.frame) throw new Error("the seeded class is in no year");
    const first = before.frame.startsOn;
    const day = (offset: number) =>
      new Date(Date.parse(`${first}T00:00:00Z`) + offset * 86_400_000)
        .toISOString()
        .slice(0, 10);
    const dates = { moduleId: saved.id, classId };
    await keeper.learning.setUnitDates({
      ...dates,
      startsOn: day(14),
      endsOn: day(27),
    });
    const after = await keeper.learning.unitPlan({ classId });
    expect(after.units.find((row) => row.id === saved.id)).toMatchObject({
      startsOn: day(14),
      endsOn: day(27),
    });
    // Dated units come first, in the order the class takes them.
    expect(after.units[0]?.startsOn).not.toBeNull();

    expect(
      await rejection(
        keeper.learning.setUnitDates({
          ...dates,
          startsOn: day(27),
          endsOn: day(14),
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await rejection(
        keeper.learning.setUnitDates({
          ...dates,
          startsOn: day(-3),
          endsOn: day(4),
        }),
      ),
    ).toMatchObject({ message: "learning.unit_dates_runs" });
    // Saving the module again keeps the class's dates.
    const resaved = await keeper.learning.saveModule({
      id: saved.id,
      expectedVersion: saved.version,
      title: "Weather words",
      summary: "Rain, wind and sun.",
      classIds: [classId],
      prerequisiteId: "",
      sequential: false,
    });
    expect(
      (await keeper.learning.unitPlan({ classId })).units.find(
        (row) => row.id === saved.id,
      )?.startsOn,
    ).toBe(day(14));
    expect(
      await rejection(
        stranger.learning.setUnitDates({
          ...dates,
          startsOn: "",
          endsOn: "",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    await keeper.learning.setUnitDates({ ...dates, startsOn: "", endsOn: "" });
    expect(
      (await keeper.learning.unitPlan({ classId })).units.find(
        (row) => row.id === saved.id,
      ),
    ).toMatchObject({ startsOn: null, endsOn: null });
    await keeper.learning.archiveModule({
      id: saved.id,
      expectedVersion: resaved.version,
    });
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
      {
        ...common,
        id: id(),
        type: "math" as const,
        prompt: "Write \\(2(r+1)\\) without brackets.",
        answers: ["2r+2"],
        tolerance: 0,
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
    expect(JSON.stringify(opened.blocks)).not.toContain("2r+2");
    const [matching, , sorting, puzzle, formula] = blocks;
    if (!matching || !sorting || !puzzle || !formula) throw new Error("blocks");
    // Any form that means the same is right.
    expect(
      await pupil.learning.respond({
        lessonId,
        blockId: formula.id,
        response: { type: "math", latex: "2+2r" },
      }),
    ).toMatchObject({ check: { correct: true } });
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
    // A school whose plan leaves coding out keeps the question but runs nothing.
    const school = seeded().tenants[0]?.schools.find(
      (row) => row.slug === "northwind",
    );
    if (!school) throw new Error("no northwind school");
    await setPlan(school.id, {
      modules: MODULE_IDS.filter((module) => module !== "coding"),
    });
    try {
      expect(
        await rejection(
          pupil.learning.respondProgram({
            lessonId,
            blockId: exercise.id,
            code: "print(1)",
          }),
        ),
      ).toMatchObject({ code: "FORBIDDEN", message: "coding.unavailable" });
    } finally {
      await setPlan(school.id, null);
    }
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
      studentIds: [me.id],
      feedback: "A lovely choice. Say more about Wilbur's problem.",
    };
    expect(
      await rejection(keeper.learning.mark({ ...mark, points: 5 })),
    ).toMatchObject({ code: "BAD_REQUEST", message: "learning.points_over" });
    // Marked together, one student without an answer marks nobody.
    const listed = found.data;
    const classmate = listed.students.find(
      (peer) => !listed.answers.some((item) => item.studentId === peer.id),
    );
    if (!classmate) throw new Error("a classmate");
    expect(
      await rejection(
        keeper.learning.mark({
          ...mark,
          studentIds: [me.id, classmate.id],
          points: 3,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(await keeper.learning.mark({ ...mark, points: 3 })).toEqual({
      marked: 1,
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

describe("a lesson's language", () => {
  test("is kept with the lesson and reaches its students, and none reads it from the words", async () => {
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
      content: editing.content,
      publish: true,
    };
    const arabic = await keeper.learning.saveLesson({
      ...draft,
      expectedVersion: editing.version,
      language: "ar",
    });
    expect((await keeper.learning.lesson({ id: reading.id })).language).toBe(
      "ar",
    );
    expect((await pupil.learning.playLesson({ id: reading.id })).language).toBe(
      "ar",
    );
    await keeper.learning.saveLesson({
      ...draft,
      expectedVersion: arabic.version,
    });
    expect(
      (await pupil.learning.playLesson({ id: reading.id })).language,
    ).toBeNull();
    expect(
      await rejection(
        keeper.learning.saveLesson({
          ...draft,
          expectedVersion: arabic.version + 1,
          language: "fr" as "en",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("a lesson's translation", () => {
  test("gives the lesson its words, while its parts and answers stay the original's", async () => {
    const { keeper } = await teachers();
    const pupil = await student();
    const { reading } = await lessonsOf(pupil);
    const editing = await keeper.learning.lesson({ id: reading.id });
    const nile = id();
    const amazon = id();
    const ask = id();
    const blocks = written([
      {
        id: id(),
        type: "content",
        content: plainContent("Rivers carve valleys."),
      },
      {
        id: ask,
        type: "choice",
        prompt: "Which river flows through Egypt?",
        points: 1,
        hints: [],
        explanation: "",
        tries: null,
        options: [
          { id: nile, text: "The Nile", feedback: "" },
          {
            id: amazon,
            text: "The Amazon",
            feedback: "The Amazon is in South America.",
          },
        ],
        correctOptionIds: [nile],
        multiple: false,
        shuffle: false,
      },
    ]);
    // The editor gives every block an id, which its translation keeps.
    const english: ContentDocument = {
      root: {
        ...blocks.root,
        children: (blocks.root.children ?? []).map((node: ContentNode, index) =>
          node.type === "question"
            ? node
            : { ...node, $: { id: `partid${index}00` } },
        ),
      },
    };
    const arabic = JSON.parse(
      JSON.stringify(english)
        .replace("Rivers carve valleys.", "الأنهار تحفر الوديان.")
        .replace("Which river flows through Egypt?", "أي نهر يجري في مصر؟")
        .replace(
          "The Amazon is in South America.",
          "الأمازون في أمريكا الجنوبية.",
        ),
    ) as ContentDocument;
    const draft = {
      id: editing.id,
      moduleId: editing.moduleId,
      title: editing.title,
      completion: editing.completion,
      passScore: editing.passScore,
      publish: true,
    };
    const saved = await keeper.learning.saveLesson({
      ...draft,
      expectedVersion: editing.version,
      content: english,
      language: "en",
      translation: { title: "نقرأ القصص معًا", content: arabic },
    });
    expect(
      await rejection(
        keeper.learning.saveLesson({
          ...draft,
          expectedVersion: saved.version,
          content: english,
          language: null,
        }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: "learning.translation_language",
    });
    expect(
      (await keeper.learning.lesson({ id: reading.id })).translation,
    ).toMatchObject({ title: "نقرأ القصص معًا" });

    await pupil.learning.readLessonIn({ lessonId: reading.id, locale: "en" });
    const inEnglish = await pupil.learning.playLesson({ id: reading.id });
    expect(inEnglish).toMatchObject({
      reading: "en",
      translation: { locale: "ar", title: "نقرأ القصص معًا" },
    });
    await pupil.learning.readLessonIn({ lessonId: reading.id, locale: "ar" });
    const inArabic = await pupil.learning.playLesson({ id: reading.id });
    expect(inArabic.reading).toBe("ar");
    expect(JSON.stringify(inArabic.blocks)).toContain("أي نهر يجري في مصر؟");
    expect(inArabic.blocks.map((block) => block.id)).toEqual(
      inEnglish.blocks.map((block) => block.id),
    );
    const miss = await pupil.learning.respond({
      lessonId: reading.id,
      blockId: ask,
      response: { type: "choice", optionIds: [amazon] },
    });
    expect(miss.check).toMatchObject({
      correct: false,
      feedback: ["الأمازون في أمريكا الجنوبية."],
    });
    const hit = await pupil.learning.respond({
      lessonId: reading.id,
      blockId: ask,
      response: { type: "choice", optionIds: [nile] },
    });
    expect(hit.check).toMatchObject({ correct: true });

    const restored = await keeper.learning.lesson({ id: reading.id });
    await keeper.learning.saveLesson({
      ...draft,
      expectedVersion: restored.version,
      content: editing.content,
      language: null,
      translation: null,
    });
    expect(
      (await pupil.learning.playLesson({ id: reading.id })).translation,
    ).toBeNull();
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

  test("a lesson that skips a heading level or ends on a gate keeps the edit from students", async () => {
    const { keeper } = await teachers();
    const { reading } = await lessonsOf(await student());
    const editing = await keeper.learning.lesson({ id: reading.id });
    const story = plainContent("Read the story, then tell a friend.");
    const [line] = story.root.children ?? [];
    if (!line) throw new Error("a line of the story");
    const draft = (content: ContentDocument) => ({
      id: editing.id,
      moduleId: editing.moduleId,
      title: editing.title,
      completion: editing.completion,
      passScore: editing.passScore,
      content,
    });
    const cases: [ContentNode[], string][] = [
      [
        [
          { ...line, type: "heading", tag: "h1" },
          { ...line, type: "heading", tag: "h3" },
          line,
        ],
        "content.order",
      ],
      [[line, { type: "gate", version: 1 }], "learning.gate_opens_nothing"],
    ];
    let version = editing.version;
    for (const [children, message] of cases) {
      const content = { root: { ...story.root, children } };
      ({ version } = await keeper.learning.saveLesson({
        ...draft(content),
        expectedVersion: version,
        publish: false,
      }));
      expect(
        await rejection(
          keeper.learning.saveLesson({
            ...draft(content),
            expectedVersion: version,
            publish: true,
          }),
        ),
      ).toMatchObject({ code: "CONFLICT", message });
    }
    await keeper.learning.saveLesson({
      ...draft(editing.published?.content ?? editing.content),
      expectedVersion: version,
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

describe("feedback that waits", () => {
  test("a question tells how it went at the end, or once the teacher shows the class", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Exit ticket",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const right = id();
    const wrong = id();
    const asked = (prompt: string, feedbackAt: "end" | "teacher") => ({
      id: id(),
      type: "choice" as const,
      prompt,
      points: 1,
      hints: ["Look again."],
      explanation: "Because.",
      tries: 2,
      feedbackAt,
      options: [
        { id: right, text: "Tree", feedback: "A thing." },
        { id: wrong, text: "Run", feedback: "An action." },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
    });
    const atEnd = asked("Which is a noun?", "end");
    const forTeacher = asked("Which names a thing?", "teacher");
    const lesson = {
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Nouns",
      completion: "quiz" as const,
      passScore: null,
      review: false,
      content: written([atEnd, forTeacher]),
      publish: false,
    };
    await keeper.learning.saveLesson(lesson);
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    // A young child learns from each answer as they give it.
    expect(
      await rejection(
        keeper.learning.saveLesson({ ...lesson, young: true, publish: true }),
      ),
    ).toMatchObject({ message: "learning.young_feedback" });

    const pupil = await student();
    const outline = await pupil.learning.play({ id: saved.id });
    const lessonId = outline.lessons[0]?.id ?? "";
    const choose = (blockId: string, optionId: string) =>
      pupil.learning.respond({
        lessonId,
        blockId,
        response: { type: "choice", optionIds: [optionId] },
      });
    expect(await rejection(pupil.learning.results({ lessonId }))).toMatchObject(
      { message: "learning.results_unanswered" },
    );
    const kept = await choose(atEnd.id, wrong);
    expect(kept.check).toMatchObject({
      tries: 1,
      correct: false,
      feedback: [],
      hints: [],
      key: null,
      explanation: null,
      timing: { at: "end", open: false },
    });
    expect(kept.score).toBeNull();
    // Nothing said it was wrong, so the change is the same one go.
    const changed = await choose(atEnd.id, right);
    expect(changed.check).toMatchObject({ tries: 1, correct: false });
    expect(
      await rejection(pupil.learning.reveal({ lessonId, blockId: atEnd.id })),
    ).toMatchObject({ code: "NOT_FOUND" });

    await pupil.learning.results({ lessonId });
    const shown = await pupil.learning.playLesson({ id: lessonId });
    expect(shown.checks[atEnd.id]).toMatchObject({
      correct: true,
      key: [right],
      explanation: "Because.",
      timing: { at: "end", open: true },
    });
    expect(await rejection(choose(atEnd.id, wrong))).toMatchObject({
      message: "learning.settled",
    });
    await choose(forTeacher.id, wrong);
    expect(shown.score).toBeNull();
    expect(await rejection(pupil.learning.retry({ lessonId }))).toMatchObject({
      message: "learning.results_waiting",
    });

    const classes = await Promise.all(
      source.classes.map((item) =>
        keeper.learning.questions({ moduleId: saved.id, classId: item.id }),
      ),
    );
    expect(
      classes.flatMap((view) => view.lessons).map((row) => row.release),
    ).toContainEqual({ released: false, students: [] });

    // Shown on their own, a student sees how they did before the class does.
    const me = await pupil.identity.currentUser();
    const theirs = source.classes.find((_, index) =>
      classes[index]?.students.some((row) => row.id === me.id),
    );
    if (!theirs) throw new Error("the student is in no class of the module");
    const teacher = await keeper.identity.currentUser();
    expect(
      await rejection(
        keeper.learning.release({
          lessonId,
          classId: theirs.id,
          studentId: teacher.id,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    await keeper.learning.release({
      lessonId,
      classId: theirs.id,
      studentId: me.id,
    });
    await keeper.learning.release({
      lessonId,
      classId: theirs.id,
      studentId: me.id,
    });
    const alone = await pupil.learning.playLesson({ id: lessonId });
    expect(alone.checks[forTeacher.id]).toMatchObject({
      key: [right],
      timing: { at: "teacher", open: true },
    });
    const ahead = await keeper.learning.questions({
      moduleId: saved.id,
      classId: theirs.id,
    });
    expect(ahead.lessons.map((row) => row.release)).toContainEqual({
      released: false,
      students: [me.id],
    });

    for (const item of source.classes)
      await keeper.learning.release({ lessonId, classId: item.id });
    expect(
      await rejection(
        pupil.learning.release({
          lessonId,
          classId: source.classes[0]?.id ?? "",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const all = await keeper.learning.questions({
      moduleId: saved.id,
      classId: theirs.id,
    });
    expect(all.lessons.map((row) => row.release)).toContainEqual({
      released: true,
      students: [me.id],
    });
    const released = await pupil.learning.playLesson({ id: lessonId });
    expect(released.checks[forTeacher.id]).toMatchObject({
      correct: false,
      feedback: ["An action."],
      key: [right],
      timing: { at: "teacher", open: true },
    });
    expect(released.score).toBe(50);
    await pupil.learning.retry({ lessonId });
  });
});

describe("hints asked for", () => {
  test("a student opens a question's hints before answering, each costing a try", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Hints",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const right = id();
    const asked = {
      id: id(),
      type: "choice" as const,
      prompt: "Which is a noun?",
      points: 1,
      hints: ["It is a thing.", "You can touch it."],
      explanation: "A tree is a thing.",
      tries: null,
      options: [
        { id: right, text: "Tree", feedback: "" },
        { id: id(), text: "Run", feedback: "" },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
    };
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Nouns",
      completion: "quiz",
      passScore: null,
      review: false,
      content: written([asked]),
      bands: [
        { id: id(), from: 0, text: "Read the page on nouns again." },
        { id: id(), from: 50, text: "Well done." },
      ],
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const outline = await pupil.learning.play({ id: saved.id });
    const lessonId = outline.lessons[0]?.id ?? "";
    const first = await pupil.learning.hint({ lessonId, blockId: asked.id });
    expect(first.check).toMatchObject({
      tries: 0,
      hints: ["It is a thing."],
      askable: 1,
    });
    await pupil.learning.hint({ lessonId, blockId: asked.id });
    expect(
      await rejection(pupil.learning.hint({ lessonId, blockId: asked.id })),
    ).toMatchObject({ message: "learning.no_hint" });
    const answered = await pupil.learning.respond({
      lessonId,
      blockId: asked.id,
      response: { type: "choice", optionIds: [right] },
    });
    // Two hints cost what two wrong tries would have.
    expect(answered.check).toMatchObject({ correct: true, hints: [] });
    expect(answered.score).toBe(33);
    // A finished lesson tells its student the message for their score.
    expect((await pupil.learning.playLesson({ id: lessonId })).band).toBe(
      "Read the page on nouns again.",
    );
    expect(
      await rejection(pupil.learning.hint({ lessonId, blockId: asked.id })),
    ).toMatchObject({ message: "learning.no_hint" });
  });
});

describe("a gate waiting for a score", () => {
  test("a student short of it, with nothing above left to try, starts again", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Mastery",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const question = (prompt: string) => {
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
    const first = question("Is a whale a mammal?");
    const second = question("Does a bat fly?");
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Mammals",
      completion: "quiz",
      passScore: null,
      review: false,
      content: written([
        first.block,
        { id: id(), type: "gate", requires: "score", goal: 80 },
        second.block,
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
    expect(await rejection(pupil.learning.retry({ lessonId }))).toMatchObject({
      message: "learning.not_done",
    });
    await pupil.learning.respond({
      lessonId,
      blockId: first.block.id,
      response: { type: "choice", optionIds: [first.wrong] },
    });
    // The one question above is settled at nothing, short of 80 percent.
    expect(await pupil.learning.retry({ lessonId })).toEqual({ attempt: 2 });
  });
});

describe("polls", () => {
  test("a class sees how it answered a poll once each student has, never who", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Polls",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const fox = id();
    const crow = id();
    const shared = {
      id: id(),
      type: "poll" as const,
      prompt: "Which story did you like best?",
      points: 0 as const,
      hints: [],
      explanation: "",
      tries: null,
      options: [
        { id: fox, text: "The fox", feedback: "" },
        { id: crow, text: "The crow", feedback: "" },
      ],
      multiple: false,
      classResults: true,
    };
    const kept = {
      ...shared,
      id: id(),
      prompt: "How do you feel today?",
      classResults: false,
    };
    const secret = {
      ...shared,
      id: id(),
      prompt: "Which story should we read next?",
      classResults: false,
      anonymous: true,
    };
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Stories we liked",
      completion: "view",
      passScore: null,
      content: written([shared, kept, secret]),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    // The seed's two students who can sign in sit in one class.
    const first = await student();
    const me = await first.identity.currentUser();
    const second = await signedIn("northwind", login("student", 0, 1));
    const outline = await first.learning.play({ id: saved.id });
    const lessonId = outline.lessons[0]?.id ?? "";
    const ref = { lessonId, blockId: shared.id };

    expect(await rejection(first.learning.pollResults(ref))).toMatchObject({
      code: "CONFLICT",
      message: "learning.poll_first",
    });
    // A single-answer poll takes one option, so each vote counts once.
    expect(
      await rejection(
        first.learning.respond({
          ...ref,
          response: { type: "poll", optionIds: [fox, crow] },
        }),
      ),
    ).toMatchObject({ message: "learning.option" });
    const voted = await first.learning.respond({
      ...ref,
      response: { type: "poll", optionIds: [fox] },
    });
    expect(voted.check).toMatchObject({ tries: 1, correct: true });
    expect(await first.learning.pollResults(ref)).toEqual({
      answered: 1,
      counts: { [fox]: 1, [crow]: 0 },
    });
    expect(
      await rejection(
        first.learning.respond({
          ...ref,
          response: { type: "poll", optionIds: [crow] },
        }),
      ),
    ).toMatchObject({ message: "learning.settled" });

    await second.learning.respond({
      ...ref,
      response: { type: "poll", optionIds: [crow] },
    });
    expect(await first.learning.pollResults(ref)).toEqual({
      answered: 2,
      counts: { [fox]: 1, [crow]: 1 },
    });

    // A poll its teacher keeps to themselves shows the class nothing.
    await first.learning.respond({
      lessonId,
      blockId: kept.id,
      response: { type: "poll", optionIds: [fox] },
    });
    expect(
      await rejection(
        first.learning.pollResults({ lessonId, blockId: kept.id }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    // The teacher reads who answered what, with no option marked right.
    const views = await Promise.all(
      source.classes.map((item) =>
        keeper.learning.questions({ moduleId: saved.id, classId: item.id }),
      ),
    );
    const asked = views
      .flatMap((view) => view.lessons.flatMap((lesson) => lesson.questions))
      .find(
        (question) => question.id === shared.id && question.firstChoices[me.id],
      );
    expect(asked?.options?.map((option) => option.correct)).toEqual([
      false,
      false,
    ]);
    expect(asked?.firstChoices[me.id]).toEqual([fox]);

    // A poll counted without names gives its teacher the counts alone.
    await first.learning.respond({
      lessonId,
      blockId: secret.id,
      response: { type: "poll", optionIds: [crow] },
    });
    const counted = (
      await Promise.all(
        source.classes.map((item) =>
          keeper.learning.questions({ moduleId: saved.id, classId: item.id }),
        ),
      )
    )
      .flatMap((view) => view.lessons.flatMap((lesson) => lesson.questions))
      .find(
        (question) =>
          question.id === secret.id && question.standings[me.id] !== "unseen",
      );
    expect(counted).toMatchObject({
      firstChoices: {},
      tally: { answered: 1, counts: { [fox]: 0, [crow]: 1 } },
    });
  });
});

describe("labelled pictures", () => {
  test("a student labels a picture's places and is marked place by place", async () => {
    const { keeper } = await teacherSessions();
    const { rows } = await keeper.api.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.api.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Labels",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    // A PNG's signature, which is all the upload check reads.
    const png = new Blob([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
    ]);
    const fileId = await uploadAs(keeper, "plant.png", "image/png", png);
    const asked = {
      id: id(),
      type: "labelling" as const,
      prompt: "Label the plant.",
      points: 2,
      hints: [],
      explanation: "",
      tries: null,
      picture: { fileId, alt: "A plant" },
      places: [
        {
          box: [0.4, 0.1, 0.2, 0.2] as [number, number, number, number],
          name: "Flower",
        },
        {
          box: [0.3, 0.8, 0.4, 0.1] as [number, number, number, number],
          name: "Roots",
        },
      ],
      extras: ["Bark"],
    };
    await keeper.api.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Parts of a plant",
      completion: "view",
      passScore: null,
      content: written([asked]),
      publish: false,
    });
    await keeper.api.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const outline = await pupil.learning.play({ id: saved.id });
    const lessonId = outline.lessons[0]?.id ?? "";
    const shown = blockOf(
      await pupil.learning.playLesson({ id: lessonId }),
      "labelling",
    );
    expect(shown.bank.toSorted()).toEqual(["Bark", "Flower", "Roots"]);
    expect(
      await rejection(
        pupil.learning.respond({
          lessonId,
          blockId: asked.id,
          response: { type: "labelling", labels: { 1: "Leaf" } },
        }),
      ),
    ).toMatchObject({ message: "learning.option" });
    const first = await pupil.learning.respond({
      lessonId,
      blockId: asked.id,
      response: { type: "labelling", labels: { 1: "Flower", 2: "Bark" } },
    });
    expect(first.check).toMatchObject({
      correct: false,
      parts: { 1: true, 2: false },
    });
  });
});

describe("crosswords", () => {
  test("a student fills a crossword's squares and is marked word by word", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Crosswords",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const asked = {
      id: id(),
      type: "crossword" as const,
      prompt: "Rivers and seas.",
      points: 3,
      hints: [],
      explanation: "",
      tries: null,
      words: [
        { id: id(), answer: "river", clue: "Water flowing to the sea" },
        { id: id(), answer: "delta", clue: "Where a river fans out" },
        { id: id(), answer: "sea", clue: "Salt water" },
      ],
    };
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Water words",
      completion: "view",
      passScore: null,
      content: written([asked]),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const outline = await pupil.learning.play({ id: saved.id });
    const lessonId = outline.lessons[0]?.id ?? "";
    const shown = blockOf(
      await pupil.learning.playLesson({ id: lessonId }),
      "crossword",
    );
    expect(shown.entries).toHaveLength(3);
    // The grid comes laid out; its words' letters stay on the server.
    const letters = new Map<string, string>(
      asked.words.map((word) => [word.id, word.answer.toUpperCase()]),
    );
    const squares = Object.fromEntries(
      shown.entries.flatMap((entry) =>
        Array.from({ length: entry.length }, (_, index) => [
          entry.across
            ? `${entry.row}-${entry.col + index}`
            : `${entry.row + index}-${entry.col}`,
          letters.get(entry.id)?.[index] ?? "",
        ]),
      ),
    );
    expect(
      await rejection(
        pupil.learning.respond({
          lessonId,
          blockId: asked.id,
          response: { type: "crossword", squares: { "30-30": "A" } },
        }),
      ),
    ).toMatchObject({ message: "learning.option" });
    const done = await pupil.learning.respond({
      lessonId,
      blockId: asked.id,
      response: { type: "crossword", squares },
    });
    expect(done.check).toMatchObject({ correct: true, fraction: 1 });
  });
});

describe("word searches", () => {
  test("a student marks the words hidden in a grid and is marked word by word", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Word searches",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const asked = {
      id: id(),
      type: "wordsearch" as const,
      prompt: "Find the planets.",
      points: 2,
      hints: [],
      explanation: "",
      tries: null,
      words: [
        { id: id(), answer: "Mars" },
        { id: id(), answer: "Venus" },
      ],
    };
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Planets",
      completion: "view",
      passScore: null,
      content: written([asked]),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const outline = await pupil.learning.play({ id: saved.id });
    const lessonId = outline.lessons[0]?.id ?? "";
    const shown = blockOf(
      await pupil.learning.playLesson({ id: lessonId }),
      "wordsearch",
    );
    const search = wordSearch(asked.words, asked.id);
    if (!search) throw new Error("no grid");
    expect(shown.rows).toEqual(search.rows);
    const [mars] = asked.words;
    const line = mars ? search.lines[mars.id] : undefined;
    if (!mars || !line) throw new Error("not hidden");
    const answered = await pupil.learning.respond({
      lessonId,
      blockId: asked.id,
      response: {
        type: "wordsearch",
        found: [
          [
            line.row,
            line.col,
            line.row + line.down * (line.length - 1),
            line.col + line.along * (line.length - 1),
          ],
        ],
      },
    });
    expect(answered.check).toMatchObject({
      correct: false,
      parts: { [mars.id]: true },
    });
  });
});

describe("marking again", () => {
  test("a teacher who fixes a key marks the answers already given again, scores and all", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Rivers",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const nile = id();
    const amazon = id();
    const asked = {
      id: id(),
      type: "choice" as const,
      prompt: "Which river flows through Egypt?",
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      options: [
        { id: nile, text: "The Nile", feedback: "" },
        { id: amazon, text: "The Amazon", feedback: "" },
      ],
      correctOptionIds: [amazon],
      multiple: false,
      shuffle: false,
    };
    const lesson = {
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Rivers of Africa",
      completion: "quiz" as const,
      passScore: null,
      review: false,
      content: written([asked]),
      publish: false,
    };
    const created = await keeper.learning.saveLesson(lesson);
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const choose = (optionId: string) =>
      pupil.learning.respond({
        lessonId: created.id,
        blockId: asked.id,
        response: { type: "choice", optionIds: [optionId] },
      });
    await choose(nile);
    expect((await choose(amazon)).score).toBe(67);

    const fixed = await keeper.learning.saveLesson({
      ...lesson,
      id: created.id,
      expectedVersion: created.version,
      content: written([{ ...asked, correctOptionIds: [nile] }]),
    });
    expect(fixed.published).toBe(false);
    expect(await keeper.learning.remarking({ id: created.id })).toEqual({
      answers: 2,
      students: 1,
      programs: 0,
    });
    await keeper.learning.publishLesson({ id: created.id, remark: true });
    const after = await pupil.learning.playLesson({ id: created.id });
    expect(after.checks[asked.id]).toMatchObject({
      tries: 1,
      correct: true,
    });
    expect(after.score).toBe(100);
    expect(await keeper.learning.remarking({ id: created.id })).toEqual({
      answers: 0,
      students: 0,
      programs: 0,
    });
  });

  test("a code exercise whose tests change runs each answer again in the background", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Powers",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const check = { id: id(), input: "2", expected: "8", hidden: false };
    const exercise = {
      id: id(),
      type: "program" as const,
      prompt: "Print the cube of the number you are given.",
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      language: "python" as const,
      starter: "n = int(input())",
      tests: [check],
    };
    const lesson = {
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Powers",
      completion: "quiz" as const,
      passScore: null,
      review: false,
      content: written([exercise]),
      publish: false,
    };
    const created = await keeper.learning.saveLesson(lesson);
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const pupil = await student();
    const cubed = await pupil.learning.respondProgram({
      lessonId: created.id,
      blockId: exercise.id,
      code: "n = int(input())\nprint(n * n * n)",
    });
    expect(cubed.check).toMatchObject({ correct: true });

    // The exercise was meant to ask for the square.
    const squares = { ...exercise, tests: [{ ...check, expected: "4" }] };
    await keeper.learning.saveLesson({
      ...lesson,
      id: created.id,
      expectedVersion: created.version,
      content: written([squares]),
    });
    expect(await keeper.learning.remarking({ id: created.id })).toEqual({
      answers: 0,
      students: 0,
      programs: 1,
    });
    await keeper.learning.publishLesson({ id: created.id, remark: true });
    // Nothing changes until the background pass runs the code.
    expect(
      (await pupil.learning.playLesson({ id: created.id })).checks[exercise.id],
    ).toMatchObject({ correct: true });

    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const runners = {
      python: createPythonRunner(
        join(import.meta.dir, "..", "vendor", "python"),
      ),
      javascript: createJavaScriptRunner(),
    };
    expect(await rerunPrograms(cell, runners, tenantId, workerModules())).toBe(
      1,
    );
    const after = await pupil.learning.playLesson({ id: created.id });
    expect(after.checks[exercise.id]).toMatchObject({
      correct: false,
      fraction: 0,
      response: { results: { [check.id]: { passed: false, output: "8\n" } } },
    });
    expect(after.score).toBe(0);
    expect(await rerunPrograms(cell, runners, tenantId, workerModules())).toBe(
      0,
    );
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
  test("a teacher offers a lesson as a school template, which is shared once reviewed", async () => {
    const { keeper, stranger } = await teachers();
    const saved = await keeper.templates.save({
      kind: "lesson",
      title: "Read, check, reflect",
      description: "Close reading in three steps.",
      content: plainContent("Read the passage, then answer."),
    });
    // A teacher's piece waits for a reviewer; its owner sees it meanwhile.
    expect(saved.state).toBe("pending");
    expect(
      (await stranger.templates.list({ kind: "lesson" })).some(
        (row) => row.id === saved.id,
      ),
    ).toBe(false);
    expect(
      (await keeper.templates.list({ kind: "lesson" })).find(
        (row) => row.id === saved.id,
      ),
    ).toMatchObject({ state: "pending", mine: true });
    expect(
      await rejection(stranger.templates.open({ id: saved.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(await rejection(keeper.templates.queue())).toMatchObject({
      code: "FORBIDDEN",
    });
    const office = await signedIn("northwind", login("principal"));
    expect((await office.templates.queue()).map((row) => row.id)).toContain(
      saved.id,
    );
    await office.templates.review({ id: saved.id, share: true, note: "" });
    // Its owner hears it was shared.
    expect(
      (await keeper.notifications.list({ tab: "all" })).rows.find(
        (row) => row.kind === "library" && row.subjectId === saved.id,
      )?.params,
    ).toMatchObject({ title: "Read, check, reflect", shared: true });
    expect(
      await rejection(
        office.templates.review({ id: saved.id, share: false, note: "" }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "templates.reviewed" });
    const shelf = await stranger.templates.browse({
      kind: "",
      q: "close reading",
    });
    expect(shelf.rows.map((row) => row.id)).toContain(saved.id);
    expect(shelf.reviews).toBe(false);
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

  test("a teacher shares a whole module, which a colleague starts in a class of theirs", async () => {
    const { keeper, stranger } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const lessons = (await keeper.learning.record({ id: source.id })).lessons;
    const office = await signedIn("northwind", login("principal"));
    const listed = async () =>
      (await office.learning.modules({})).rows.filter(
        (row) => row.title === TITLE,
      ).length;
    const before = await listed();
    const shared = await office.learning.shareModule({
      moduleId: source.id,
      title: "Stories unit",
      description: "Four weeks of reading together.",
      subjectId: "",
    });
    expect(shared.state).toBe("shared");
    // The copy the template keeps is in nobody's list of modules.
    expect(await listed()).toBe(before);
    const shelf = await stranger.templates.browse({ kind: "module", q: "" });
    expect(shelf.rows.map((row) => row.id)).toContain(shared.id);
    const preview = await stranger.templates.open({ id: shared.id });
    expect(JSON.stringify(preview.content)).toContain(lessons[0]?.title ?? "");
    const { classes } = await stranger.learning.modules({});
    const classId = classes[0]?.id ?? "";
    const started = await stranger.learning.moduleFromTemplate({
      id: shared.id,
      classId,
    });
    const copy = await stranger.learning.record({ id: started.id });
    expect(copy).toMatchObject({ title: TITLE, state: "draft" });
    expect(copy.classes.map((row) => row.id)).toEqual([classId]);
    expect(copy.lessons.map((row) => row.title)).toEqual(
      lessons.map((row) => row.title),
    );
    expect(
      await rejection(
        stranger.learning.moduleFromTemplate({
          id: shared.id,
          classId: crypto.randomUUID(),
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    await office.templates.remove({ id: shared.id });
    expect(
      await rejection(
        stranger.learning.moduleFromTemplate({ id: shared.id, classId }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    // The copy leaves the module lists the tests after this one read by title.
    await stranger.learning.archiveModule({
      id: copy.id,
      expectedVersion: copy.version,
    });
  });

  test("an event and a consent form are kept by those who write them", async () => {
    const { keeper } = await teachers();
    const office = await signedIn("northwind", login("principal"));
    const trip = await keeper.templates.save({
      kind: "event",
      title: "Museum trip",
      description: "",
      content: plainContent("What to bring: a packed lunch."),
    });
    expect(
      (await keeper.templates.list({ kind: "event" })).map((row) => row.id),
    ).toContain(trip.id);
    // Consent forms are the office's to write, and so to keep.
    const photos = await office.templates.save({
      kind: "consent_form",
      title: "Photos on the website",
      description: "",
      content: plainContent("May we show photographs of your child?"),
    });
    expect(photos.state).toBe("shared");
    expect(
      await rejection(keeper.templates.list({ kind: "consent_form" })),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await keeper.templates.browse({ kind: "", q: "" })).rows.some(
        (row) => row.kind === "consent_form",
      ),
    ).toBe(false);
    expect(
      (await office.templates.browse({ kind: "consent_form", q: "" })).rows.map(
        (row) => row.id,
      ),
    ).toContain(photos.id);
    await keeper.templates.remove({ id: trip.id });
    await office.templates.remove({ id: photos.id });
  });

  test("the shelf pages past its first templates rather than stopping short", async () => {
    const office = await signedIn("northwind", login("principal"));
    const tag = crypto.randomUUID().slice(0, 8);
    const made = await Promise.all(
      Array.from({ length: 27 }, (_, index) =>
        office.templates.save({
          kind: "consent_form",
          title: `Shelf ${tag} ${String(index).padStart(2, "0")}`,
          description: "",
          content: plainContent("May we?"),
        }),
      ),
    );
    const first = await office.templates.browse({ kind: "", q: tag });
    expect(first).toMatchObject({ total: 27, page: 1, pages: 2 });
    expect(first.rows).toHaveLength(25);
    const second = await office.templates.browse({ kind: "", q: tag, page: 2 });
    expect(second.rows.map((row) => row.title)).toEqual([
      `Shelf ${tag} 25`,
      `Shelf ${tag} 26`,
    ]);
    await Promise.all(
      made.map((row) => office.templates.remove({ id: row.id })),
    );
  });
});

const bankQuestion = (prompt: string) =>
  written([
    {
      id: id(),
      type: "choice",
      prompt,
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      options: [
        { id: id(), text: "Three", feedback: "" },
        { id: id(), text: "Four", feedback: "" },
      ],
      correctOptionIds: [],
      multiple: false,
      shuffle: false,
    },
  ]);

describe("the question bank", () => {
  test("a teacher keeps questions for themselves or the school, and asks them again", async () => {
    const { keeper, stranger } = await teachers();
    const shared = await keeper.bank.save({
      id: "",
      expectedVersion: 0,
      scope: "school",
      tags: ["fractions", "Year 7", "fractions"],
      content: bankQuestion("How many quarters make three quarters?"),
    });
    const own = await keeper.bank.save({
      id: "",
      expectedVersion: 0,
      scope: "mine",
      tags: [],
      content: bankQuestion("A question only its teacher keeps"),
    });
    const seen = await stranger.bank.list({ tag: "fractions" });
    expect(seen.questions.map((row) => row.id)).toEqual([shared.id]);
    expect(seen.questions[0]).toMatchObject({
      kind: "choice",
      title: "How many quarters make three quarters?",
      tags: ["fractions", "Year 7"],
      mine: false,
    });
    expect(seen.tags).toContain("fractions");
    expect(
      (await stranger.bank.list({ search: "only its teacher" })).questions,
    ).toEqual([]);
    expect(
      (await keeper.bank.list({ search: "only its teacher" })).questions.map(
        (row) => row.id,
      ),
    ).toEqual([own.id]);
    expect(await rejection(stranger.bank.open({ id: own.id }))).toMatchObject({
      code: "NOT_FOUND",
    });
    const opened = await stranger.bank.open({ id: shared.id });
    expect(JSON.stringify(opened.content)).toContain("three quarters");
    expect(
      await rejection(stranger.bank.remove({ id: shared.id })),
    ).toMatchObject({ code: "FORBIDDEN", message: "bank.not_owner" });
    expect(
      await rejection(
        keeper.bank.save({
          id: "",
          expectedVersion: 0,
          scope: "mine",
          tags: [],
          content: plainContent("Not a question at all"),
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    expect(await rejection((await student()).bank.list({}))).toMatchObject({
      code: "FORBIDDEN",
    });
    await keeper.bank.remove({ id: shared.id });
    await keeper.bank.remove({ id: own.id });
    expect((await stranger.bank.list({ tag: "fractions" })).questions).toEqual(
      [],
    );
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

describe("reading aloud", () => {
  test("a student reads a passage aloud, and the teacher marks it word by word", async () => {
    const { keeper } = await teacherSessions();
    const { rows } = await keeper.api.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.api.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Reading the river",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const question = id();
    const passage = "The Nile is long.\nBoats sail on it to Cairo.";
    const lesson = await keeper.api.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Read it",
      completion: "view",
      passScore: null,
      content: written([
        {
          id: question,
          type: "written",
          prompt: "Read this passage aloud.",
          points: 2,
          hints: [],
          explanation: "",
          tries: null,
          wordLimit: null,
          recordSeconds: 180,
          passage,
        },
      ]),
      publish: false,
    });
    await keeper.api.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    // The passage travels with the question as the document holds it.
    const stored = await keeper.api.learning.lesson({ id: lesson.id });
    expect(JSON.stringify(stored.content)).toContain('"reading":true');

    const pupil = await sessionFor("northwind", login("student"));
    const played = await pupil.api.learning.playLesson({ id: lesson.id });
    expect(blockOf(played, "written")).toMatchObject({ passage });
    const sound = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])]);
    const file = await pupil.api.files.initiate({
      purpose: "document_media",
      name: "reading.webm",
      mediaType: "audio/webm",
      sizeBytes: sound.size,
    });
    await raw("northwind", pupil.token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body: sound,
    });
    await pupil.api.learning.respond({
      lessonId: lesson.id,
      blockId: question,
      response: {
        type: "written",
        text: "",
        recording: { fileId: file.id, seconds: 12 },
      },
    });
    const me = await pupil.api.identity.currentUser();
    const fluency = { errors: [3, 6], lastWord: 7, seconds: 12 };
    // Words are counted within the passage, ten of them.
    expect(
      await rejection(
        keeper.api.learning.mark({
          lessonId: lesson.id,
          blockId: question,
          studentIds: [me.id],
          points: 1,
          feedback: "",
          fluency: { ...fluency, errors: [10] },
        }),
      ),
    ).toMatchObject({ message: "learning.fluency" });
    await keeper.api.learning.mark({
      lessonId: lesson.id,
      blockId: question,
      studentIds: [me.id],
      points: 1.5,
      feedback: "Practise the word Boats.",
      fluency,
    });
    const answers = [];
    for (const item of source.classes) {
      const data = await keeper.api.learning.answers({
        moduleId: saved.id,
        classId: item.id,
      });
      expect(
        data.questions.find((row) => row.blockId === question)?.passage,
      ).toBe(passage);
      answers.push(
        ...data.answers.filter(
          (row) => row.studentId === me.id && row.blockId === question,
        ),
      );
    }
    expect(answers).toMatchObject([{ marked: true, fluency }]);
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
      // The student's own work on the starter, not the starter's bytes,
      // which the school would keep as one copy for both.
      new Blob([sb3, crypto.getRandomValues(new Uint8Array(16))]),
    );
    const stage = await uploadAs(
      pupil,
      "stage.png",
      "image/png",
      new Blob([png, crypto.getRandomValues(new Uint8Array(16))]),
    );
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
    expect((await raw("northwind", teacher.token, projectPath)).status).toBe(
      200,
    );

    // Each save keeps the whole project, so only the last few stay. Every
    // save differs, as a student's do; bytes the school already holds, from
    // this run or an earlier one, would share that copy.
    const saves = [project];
    for (let save = 0; save < 4; save += 1) {
      const next = await uploadAs(
        pupil,
        `project-${save}.sb3`,
        "application/x.scratch.sb3",
        new Blob([
          new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]),
          crypto.getRandomValues(new Uint8Array(16)),
        ]),
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
      (await raw("northwind", teacher.token, `/v1/files/${fileId}/content`))
        .status;
    expect(await served(project)).toBe(404);
    expect(await served(stage)).toBe(404);
    expect(await served(saves[1] ?? "")).toBe(404);
    for (const kept of saves.slice(2)) expect(await served(kept)).toBe(200);

    expect(
      await keeper.learning.mark({
        lessonId: lesson.id,
        blockId: question,
        studentIds: [me.id],
        points: 3,
        feedback: "The cat dances. Try a loop for the steps.",
      }),
    ).toEqual({ marked: 1 });
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
    expect(second.mine).toMatchObject({ has: ["flag", "loop"], notes: [] });
    expect(second.theirs).toMatchObject({ has: ["flag", "loop"] });

    // A message sent that nothing hears is worth a second look, said to both.
    const telling = await save(
      savedProject({
        start: { ...flag, next: "send" },
        send: {
          opcode: "event_broadcast",
          next: null,
          inputs: { BROADCAST_INPUT: [1, [11, "go", "message-1"]] },
          fields: {},
          topLevel: false,
        },
      }),
    );
    const unheard = [{ kind: "unheard", message: "go" }];
    expect(telling.mine).toMatchObject({ has: ["flag"], notes: unheard });
    expect(telling.theirs).toMatchObject({ notes: unheard });

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
        studentIds: [me.id],
        points: 3,
        feedback: "Biscuit has a page. Give the heading a picture.",
      }),
    ).toEqual({ marked: 1 });
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

  test("a project whose starter is held to Python stays in Python, whatever files are sent", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Boards in Python",
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
      title: "Show a number in Python",
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
          files: locked(blankProject(), "python-only"),
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
    const ref = { lessonId: lesson.id, blockId: question };
    // A project free to move between languages, with blocks, as another editor would send it.
    await pupil.learning.keepProject({ ...ref, files: blankProject() });
    const kept = (await pupil.learning.playLesson({ id: lesson.id })).projects[
      question
    ]?.files;
    expect(kept?.map((file) => file.name)).toEqual([
      "pxt.json",
      "main.ts",
      "main.py",
      "README.md",
    ]);
    expect(lockOf(kept ?? [])).toBe("python-only");
    const sent = await pupil.learning.respond({
      ...ref,
      response: { type: "project", files: blankProject() },
    });
    const answer = sent.check.response;
    expect(
      answer?.type === "project" && answer.files.map((file) => file.name),
    ).toEqual(["pxt.json", "main.ts", "main.py", "README.md"]);
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
      practiceBands: [
        { id: id(), from: 0, text: "Look at the colours lesson again." },
        { id: id(), from: 75, text: "You know your colours." },
      ],
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
          hints: [`Think about ${prompt}`],
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
    expect(set.bands.map((band) => band.from)).toEqual([0, 75]);
    expect(set.items).toHaveLength(4);
    expect(set.items[0]).toMatchObject({
      missed: true,
      block: { id: missed.block.id },
    });
    expect(JSON.stringify(set.items)).not.toContain("correctOptionIds");
    expect(JSON.stringify(set.items)).not.toContain("Think about");
    expect(set.items[0]?.check).toMatchObject({
      tries: 0,
      hints: [],
      askable: 1,
    });
    const firstLesson = outline.lessons[0]?.id ?? "";
    // A hint is asked for before answering, and only while one is left.
    const hinted = await pupil.learning.practiceCheck({
      lessonId: firstLesson,
      blockId: missed.block.id,
      before: 0,
      answer: { kind: "hint", last: null },
    });
    expect(hinted).toMatchObject({
      tries: 0,
      hints: ["Think about Is a tomato red?"],
      askable: 0,
      asked: 1,
    });
    expect(
      await rejection(
        pupil.learning.practiceCheck({
          lessonId: firstLesson,
          blockId: missed.block.id,
          before: 0,
          hints: 1,
          answer: { kind: "hint", last: null },
        }),
      ),
    ).toMatchObject({ message: "learning.no_hint" });
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

/** A new module for the seeded module's classes, by one of its teachers. */
async function watchingModule(title: string) {
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
    title,
    summary: "",
    classIds: source.classes.map((item) => item.id),
    prerequisiteId: "",
    sequential: false,
  });
  return { teacher, keeper, source, saved };
}

describe("watching recordings", () => {
  test("a lesson that finishes on watching counts only what was played, and picks up where it stopped", async () => {
    const { teacher, keeper, source, saved } =
      await watchingModule("Listening");
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
      video: recording,
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
      video: recording,
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
    const story = insight.recordings.find((row) => row.key === recording);
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
          video: id(),
          ranges: [[0, 5]],
          durationSeconds: 10,
          positionSeconds: 5,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a YouTube video counts its watching like an upload, and its questions belong to it", async () => {
    const { keeper, source, saved } = await watchingModule("Film club");
    const film = "aqz-KE-bpKQ";
    const content = written([
      { id: id(), type: "content", content: plainContent("Watch the film.") },
    ]);
    content.root.children?.push({
      type: "embed",
      version: 1,
      provider: "youtube",
      embedId: film,
      caption: "The film",
    });
    const asked = id();
    const lesson = await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "The film",
      completion: "watch",
      passScore: null,
      content: {
        root: {
          ...content.root,
          children: [
            ...(content.root.children ?? []),
            ...(written([
              {
                id: asked,
                type: "written",
                prompt: "What happened first?",
                points: 0,
                hints: [],
                explanation: "",
                tries: null,
                wordLimit: null,
                videoAt: 30,
              },
            ]).root.children ?? []),
          ],
        },
      },
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const pupil = await student();
    await pupil.learning.playLesson({ id: lesson.id });
    const video = `youtube:${film}`;
    const report = await pupil.learning.watch({
      lessonId: lesson.id,
      video,
      ranges: [[0, 95]],
      durationSeconds: 100,
      positionSeconds: 95,
    });
    expect(report).toMatchObject({
      completed: true,
      watched: { watchedSeconds: 95, reachedSeconds: 95 },
    });
    expect(
      (await pupil.learning.playLesson({ id: lesson.id })).watches[video],
    ).toMatchObject({ watchedSeconds: 95 });
    const insight = await keeper.learning.videos({
      moduleId: saved.id,
      classId: source.classes[0]?.id ?? "",
    });
    expect(insight.recordings.find((row) => row.key === video)).toMatchObject({
      name: "The film",
      video: true,
      stops: [30],
    });
    expect(
      await rejection(
        pupil.learning.watch({
          lessonId: lesson.id,
          video: "youtube:dQw4w9WgXcQ",
          ranges: [[0, 5]],
          durationSeconds: 10,
          positionSeconds: 5,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("standards a lesson gives evidence on", () => {
  test("a lesson's first answer to a tagged question counts, and its teacher's mark joins it", async () => {
    const office = await signedIn("northwind", login("principal"));
    const framework = await office.standards.saveFramework({
      id: "",
      expectedVersion: 0,
      title: `Lesson evidence ${id()}`,
      description: "",
    });
    const standard = await office.standards.saveStandard({
      frameworkId: framework.id,
      id: "",
      expectedVersion: 0,
      parentId: "",
      code: "LE.1",
      statement: "Name a story's characters.",
      itemType: "",
    });
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Characters",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const right = id();
    const choice = {
      id: id(),
      type: "choice" as const,
      prompt: "Who is the hero?",
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      options: [
        { id: right, text: "Wilbur", feedback: "" },
        { id: id(), text: "The barn", feedback: "" },
      ],
      correctOptionIds: [right],
      multiple: false,
      shuffle: false,
      standards: [standard.id],
    };
    const essay = {
      id: id(),
      type: "written" as const,
      prompt: "Who helps the hero, and how?",
      points: 2,
      hints: [],
      explanation: "",
      tries: null,
      wordLimit: null,
      standards: [standard.id],
    };
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Who is who",
      completion: "view",
      passScore: null,
      content: written([choice, essay]),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const pupil = await student();
    const me = await pupil.identity.currentUser();
    const outline = await pupil.learning.play({ id: saved.id });
    const lessonId = outline.lessons[0]?.id ?? "";
    await pupil.learning.playLesson({ id: lessonId });
    const wrong = choice.options[1]?.id ?? "";
    await pupil.learning.respond({
      lessonId,
      blockId: choice.id,
      response: { type: "choice", optionIds: [wrong] },
    });
    // A later try comes after the feedback and hints, so it is not evidence.
    await pupil.learning.respond({
      lessonId,
      blockId: choice.id,
      response: { type: "choice", optionIds: [right] },
    });
    await pupil.learning.respond({
      lessonId,
      blockId: essay.id,
      response: { type: "written", text: "Charlotte, by writing words." },
    });

    const progress = async () => {
      for (const item of source.classes) {
        const shown = await keeper.standards.classProgress({
          classId: item.id,
        });
        const mine = shown.mastery.find(
          (row) => row.studentId === me.id && row.standardId === standard.id,
        );
        if (mine) return mine;
      }
      return null;
    };
    expect(await progress()).toMatchObject({
      level: "beginning",
      score: 0,
      occasions: 1,
    });
    await keeper.learning.mark({
      lessonId,
      blockId: essay.id,
      studentIds: [me.id],
      points: 2,
      feedback: "",
    });
    expect(await progress()).toMatchObject({
      level: "developing",
      score: 0.5,
      occasions: 1,
    });
    await office.standards.removeFramework({ id: framework.id });
  });
});

const planTarget = (standardId: string, code: string) => ({
  id: standardId,
  code,
  statement: `Standard ${code}.`,
});

describe("a module's unit plan", () => {
  test("a plan names standards, read against the ones the module's questions assess", async () => {
    const office = await signedIn("northwind", login("principal"));
    const framework = await office.standards.saveFramework({
      id: "",
      expectedVersion: 0,
      title: `Plan check ${id()}`,
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
    const planned = await tag("PL.1");
    const unplanned = await tag("PL.2");
    const intended = await tag("PL.3");
    const { keeper, stranger } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Planned unit",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    expect(await keeper.learning.plan({ moduleId: saved.id })).toEqual({
      content: null,
      covered: [],
    });
    const intentions = plainContent("Today we learn to:");
    const right = id();
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "First look",
      completion: "view",
      passScore: null,
      content: written([
        {
          id: id(),
          type: "content",
          content: {
            root: {
              ...intentions.root,
              children: [
                ...(intentions.root.children ?? []),
                {
                  type: "standards",
                  version: 1,
                  targets: [
                    planTarget(planned.id, "PL.1"),
                    planTarget(intended.id, "PL.3"),
                  ],
                },
              ],
            },
          },
        },
        {
          id: id(),
          type: "choice",
          prompt: "Pick one.",
          points: 1,
          hints: [],
          explanation: "",
          tries: null,
          options: [
            { id: right, text: "This", feedback: "" },
            { id: id(), text: "That", feedback: "" },
          ],
          correctOptionIds: [right],
          multiple: false,
          shuffle: false,
          standards: [planned.id, unplanned.id],
        },
      ]),
      publish: false,
    });
    const goals = plainContent("Stage 1: desired results");
    await keeper.learning.savePlan({
      moduleId: saved.id,
      content: {
        root: {
          ...goals.root,
          children: [
            ...(goals.root.children ?? []),
            {
              type: "standards",
              version: 1,
              targets: [planTarget(planned.id, "PL.1")],
            },
          ],
        },
      },
    });
    const shown = await keeper.learning.plan({ moduleId: saved.id });
    expect(shown.content?.root.children?.at(-1)).toMatchObject({
      type: "standards",
      targets: [planTarget(planned.id, "PL.1")],
    });
    // A lesson's Standards block sets out what it teaches, beside the
    // questions that assess it.
    expect(
      shown.covered
        .map((row) => [row.code, row.questions, row.lessons])
        .toSorted(([a], [b]) => String(a).localeCompare(String(b))),
    ).toEqual([
      ["PL.1", 1, 1],
      ["PL.2", 1, 0],
      ["PL.3", 0, 1],
    ]);
    expect(
      await rejection(stranger.learning.plan({ moduleId: saved.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    // Its teachers may write it together.
    expect(
      await keeper.documents.collaborate({
        hostType: "module_plan",
        hostId: saved.id,
      }),
    ).toMatchObject({ access: "write" });
    // A copy of the module, taught again, starts from the same plan.
    const copy = await keeper.learning.duplicateModule({
      id: saved.id,
      classIds: source.classes.map((item) => item.id),
    });
    expect((await keeper.learning.plan({ moduleId: copy.id })).content).toEqual(
      shown.content,
    );
    await office.standards.removeFramework({ id: framework.id });
  });

  test("a school's own key concepts frame plans unassessed, and the curriculum map reads them across the year's units", async () => {
    const office = await signedIn("northwind", login("principal"));
    const made = await office.standards.saveFramework({
      expectedVersion: 0,
      title: "Key concepts",
      description: "",
      assessed: false,
    });
    const keyConcepts = made.id;
    for (const statement of ["Change", "Form", "Systems"])
      await office.standards.saveStandard({
        frameworkId: keyConcepts,
        expectedVersion: 0,
        code: "",
        statement,
        itemType: "Key concept",
      });
    const { framework: concepts, standards: items } =
      await office.standards.framework({ id: keyConcepts });
    expect(concepts).toMatchObject({
      title: "Key concepts",
      assessed: false,
    });
    expect(items).toHaveLength(3);
    const change = items.find((row) => row.statement === "Change");
    if (!change) throw new Error("no key concept Change");

    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Seasons change",
      summary: "",
      classIds: source?.classes.map((item) => item.id) ?? [],
      prerequisiteId: "",
      sequential: false,
    });
    const page = plainContent("Key concept");
    await keeper.learning.savePlan({
      moduleId: saved.id,
      content: {
        root: {
          ...page.root,
          children: [
            ...(page.root.children ?? []),
            {
              type: "standards",
              version: 1,
              targets: [{ id: change.id, code: "", statement: "Change" }],
            },
          ],
        },
      },
    });
    expect(await keeper.standards.describe({ ids: [change.id] })).toMatchObject(
      [{ id: change.id, assessed: false }],
    );

    const map = await keeper.standards.curriculumMap({
      frameworkId: keyConcepts,
    });
    expect(map.frameworkId).toBe(keyConcepts);
    expect(map.items).toHaveLength(3);
    expect(map.units.find((row) => row.id === saved.id)).toMatchObject({
      title: "Seasons change",
      items: [change.id],
    });
    // The other units name nothing from it.
    expect(
      map.units
        .filter((row) => row.id !== saved.id)
        .every((row) => row.items.length === 0),
    ).toBe(true);
    const pupil = await signedIn("northwind", login("student"));
    expect(
      await rejection(pupil.standards.curriculumMap({ frameworkId: "" })),
    ).toMatchObject({ code: "FORBIDDEN" });

    await keeper.learning.archiveModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    await office.standards.removeFramework({ id: keyConcepts });
  });
});

describe("copying a lesson", () => {
  test("a lesson copies to the end of another module its teacher writes, unshown", async () => {
    const { keeper, stranger } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const record = await keeper.learning.record({ id: source.id });
    const [first] = record.lessons;
    if (!first) throw new Error("no lesson");
    const target = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Copies land here",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const copy = await keeper.learning.copyLessonTo({
      id: first.id,
      moduleId: target.id,
    });
    const [original, copied] = await Promise.all([
      keeper.learning.lesson({ id: first.id }),
      keeper.learning.lesson({ id: copy.id }),
    ]);
    expect(copied).toMatchObject({
      title: original.title,
      moduleId: target.id,
      published: null,
    });
    expect(copied.content).toEqual(original.content);
    expect(
      await rejection(
        stranger.learning.copyLessonTo({ id: first.id, moduleId: target.id }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("module audiences", () => {
  test("a module set for chosen students of a class reaches them alone", async () => {
    const { keeper } = await teachers();
    const pupil = await student();
    const me = await pupil.identity.currentUser();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    let classId = "";
    let classmate = "";
    for (const item of source.classes) {
      const { roster } = await keeper.coursework.groups({ classId: item.id });
      if (roster.some((row) => row.id === me.id)) {
        classId = item.id;
        classmate = roster.find((row) => row.id !== me.id)?.id ?? "";
      }
    }
    if (!classId || !classmate) throw new Error("the student's class");
    const fields = {
      title: "Extension reading",
      summary: "",
      classIds: [classId],
      prerequisiteId: "",
      sequential: false,
    };
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      ...fields,
      audiences: [{ classId, groupIds: [], studentIds: [classmate] }],
    });
    await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "A harder story",
      completion: "view",
      passScore: null,
      content: plainContent("Read the story."),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const mine = async () =>
      (await pupil.learning.mine({})).rows.some((row) => row.id === saved.id);
    // Only the classmate was chosen, so the module is not the student's.
    expect(await mine()).toBe(false);
    expect(
      await rejection(pupil.learning.play({ id: saved.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    const progress = await keeper.learning.progress({
      moduleId: saved.id,
      classId,
    });
    expect(progress.students.map((row) => row.id)).toEqual([classmate]);
    // Chosen too, the student meets it.
    const record = await keeper.learning.record({ id: saved.id });
    expect(record.audiences).toEqual([
      { classId, groupIds: [], studentIds: [classmate] },
    ]);
    await keeper.learning.saveModule({
      id: saved.id,
      expectedVersion: record.version,
      ...fields,
      audiences: [{ classId, groupIds: [], studentIds: [classmate, me.id] }],
    });
    expect(await mine()).toBe(true);
    // A student from outside the class is refused.
    const { rows: others } = await keeper.learning.modules({});
    const elsewhere = others
      .flatMap((row) => row.classes)
      .find((row) => row.id !== classId);
    if (elsewhere)
      expect(
        await rejection(
          keeper.learning.saveModule({
            id: saved.id,
            expectedVersion: record.version + 1,
            ...fields,
            audiences: [{ classId, groupIds: [], studentIds: [elsewhere.id] }],
          }),
        ),
      ).toMatchObject({ code: "BAD_REQUEST", message: "learning.audience" });
  });
});

const yesNoQuestion = (prompt: string) => {
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

describe("paths by score", () => {
  test("a lesson shown by score reaches the students it is for, and the next module opens at its score", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const fields = {
      summary: "",
      classIds: source.classes.map((item) => item.id),
      sequential: true,
    };
    const first = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Fractions check",
      prerequisiteId: "",
      ...fields,
    });
    const asked = [
      yesNoQuestion("Is a half two quarters?"),
      yesNoQuestion("Is a third a half?"),
    ];
    const lesson = (title: string, completion: "quiz" | "view") => ({
      id: "",
      moduleId: first.id,
      expectedVersion: 0,
      title,
      completion,
      passScore: null,
      publish: false,
    });
    const check = await keeper.learning.saveLesson({
      ...lesson("Check", "quiz"),
      content: written(asked.map((item) => item.block)),
    });
    const practice = await keeper.learning.saveLesson({
      ...lesson("More practice", "view"),
      content: plainContent("Fold the paper in two."),
      condition: { lessonId: check.id, atLeast: null, below: 60 },
    });
    const harder = await keeper.learning.saveLesson({
      ...lesson("A harder step", "view"),
      content: plainContent("Add a half and a third."),
      condition: { lessonId: check.id, atLeast: 60, below: null },
    });
    // A score comes only from a lesson with scored questions, before it.
    expect(
      await rejection(
        keeper.learning.saveLesson({
          ...lesson("After practice", "view"),
          content: plainContent("Again."),
          condition: { lessonId: practice.id, atLeast: 50, below: null },
        }),
      ),
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "learning.condition_unscored",
    });
    expect(
      await rejection(
        keeper.learning.moveLesson({ id: practice.id, position: 0 }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "learning.condition_order" });
    expect(
      await rejection(keeper.learning.removeLesson({ id: check.id })),
    ).toMatchObject({
      code: "CONFLICT",
      message: "learning.condition_in_use",
    });
    await keeper.learning.publishModule({
      id: first.id,
      expectedVersion: first.version,
    });
    const next = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Fractions next",
      prerequisiteId: first.id,
      prerequisiteScore: 60,
      ...fields,
    });
    await keeper.learning.saveLesson({
      ...lesson("Mixed numbers", "view"),
      moduleId: next.id,
      content: plainContent("One and a half."),
    });
    await keeper.learning.publishModule({
      id: next.id,
      expectedVersion: next.version,
    });

    const pupil = await student();
    const me = await pupil.identity.currentUser();
    const titles = async () =>
      (await pupil.learning.play({ id: first.id })).lessons.map(
        (row) => row.title,
      );
    // Until the check is done, neither branch shows.
    expect(await titles()).toEqual(["Check"]);
    await pupil.learning.playLesson({ id: check.id });
    for (const [index, item] of asked.entries())
      await pupil.learning.respond({
        lessonId: check.id,
        blockId: item.block.id,
        response: {
          type: "choice",
          optionIds: [index === 0 ? item.right : item.wrong],
        },
      });
    // Half right routes the student to more practice, past the harder step.
    expect(await titles()).toEqual(["Check", "More practice"]);
    expect(
      await rejection(pupil.learning.playLesson({ id: harder.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    let classId = "";
    for (const item of source.classes) {
      const { roster } = await keeper.coursework.groups({ classId: item.id });
      if (roster.some((row) => row.id === me.id)) classId = item.id;
    }
    const matrix = await keeper.learning.progress({
      moduleId: first.id,
      classId,
    });
    expect(matrix.paths.filter((row) => row.studentId === me.id)).toEqual([
      { lessonId: harder.id, studentId: me.id, state: "off" },
    ]);
    // The teacher opens the harder step for the student by hand, and takes it back.
    await keeper.learning.openForStudent({
      lessonId: harder.id,
      studentId: me.id,
      open: true,
    });
    expect(await titles()).toEqual(["Check", "More practice", "A harder step"]);
    const opened = await keeper.learning.progress({
      moduleId: first.id,
      classId,
    });
    expect(opened.paths.filter((row) => row.studentId === me.id)).toEqual([]);
    expect(opened.openings).toContainEqual({
      lessonId: harder.id,
      studentId: me.id,
    });
    expect(
      await rejection(
        keeper.learning.openForStudent({
          lessonId: check.id,
          studentId: me.id,
          open: true,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    await keeper.learning.openForStudent({
      lessonId: harder.id,
      studentId: me.id,
      open: false,
    });
    expect(await titles()).toEqual(["Check", "More practice"]);
    await pupil.learning.playLesson({ id: practice.id });
    const after = async () =>
      (await pupil.learning.mine({})).rows.find((row) => row.id === next.id);
    // Finished, but at 50% the next module waits for 60%.
    expect(await after()).toMatchObject({
      locked: true,
      prerequisiteResult: { finished: true, score: 50 },
    });
    expect(
      (await pupil.learning.mine({})).rows.find((row) => row.id === first.id),
    ).toMatchObject({ lessons: 2, completed: 2, finished: true });
    const record = await keeper.learning.record({ id: next.id });
    await keeper.learning.saveModule({
      id: next.id,
      expectedVersion: record.version,
      title: "Fractions next",
      prerequisiteId: first.id,
      prerequisiteScore: 50,
      ...fields,
    });
    expect(await after()).toMatchObject({ locked: false });

    // A copy of the module keeps each condition on its own lessons.
    const copy = await keeper.learning.duplicateModule({
      id: first.id,
      classIds: fields.classIds,
    });
    const copied = (await keeper.learning.record({ id: copy.id })).lessons;
    const copiedCheck = copied[0]?.id ?? "";
    expect(copied.map((row) => row.condition?.lessonId ?? null)).toEqual([
      null,
      copiedCheck,
      copiedCheck,
    ]);
    expect(copied.map((row) => row.scored)).toEqual([true, false, false]);
  });
});

describe("leading a lesson live", () => {
  test("a teacher takes the class through a lesson part by part, pausing it, and sees who answered", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const pupil = await student();
    const me = await pupil.identity.currentUser();
    let classId = "";
    for (const item of source.classes) {
      const { roster } = await keeper.coursework.groups({ classId: item.id });
      if (roster.some((row) => row.id === me.id)) classId = item.id;
    }
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Shapes together",
      summary: "",
      classIds: [classId],
      prerequisiteId: "",
      sequential: true,
    });
    const ask = (prompt: string) => {
      const right = id();
      return {
        right,
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
            { id: id(), text: "No", feedback: "" },
          ],
          correctOptionIds: [right],
          multiple: false,
          shuffle: false,
        },
      };
    };
    const first = ask("Has a square four sides?");
    const second = ask("Has a triangle three corners?");
    const lesson = (title: string, blocks: LessonDocument["blocks"]) =>
      keeper.learning.saveLesson({
        id: "",
        moduleId: saved.id,
        expectedVersion: 0,
        title,
        completion: "view",
        passScore: null,
        content: written(blocks),
        publish: false,
      });
    await lesson("Warm up", [
      { id: id(), type: "content", content: plainContent("Look around.") },
    ]);
    const led = await lesson("Sides and corners", [
      { id: id(), type: "content", content: plainContent("Count the sides.") },
      first.block,
      { id: id(), type: "gate", requires: "above" },
      { id: id(), type: "content", content: plainContent("Now corners.") },
      second.block,
    ]);
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    // In order, the second lesson waits for the first, until it is led.
    expect(
      await rejection(pupil.learning.playLesson({ id: led.id })),
    ).toMatchObject({ code: "CONFLICT", message: "learning.locked" });
    const started = await keeper.learning.startPaced({
      lessonId: led.id,
      classId,
    });
    expect(
      await keeper.learning.startPaced({ lessonId: led.id, classId }),
    ).toEqual(started);
    // The module lists the lesson being led, for its teacher to return to.
    const liveOn = async () =>
      (await keeper.learning.record({ id: saved.id })).lessons.map(
        (row) => row.live,
      );
    expect(await liveOn()).toEqual([
      [],
      [{ id: started.id, classId, paused: false }],
    ]);
    const played = await pupil.learning.playLesson({ id: led.id });
    expect(played.paced).toEqual({ id: started.id, step: 0, paused: false });
    const answer = (item: typeof first) =>
      pupil.learning.respond({
        lessonId: led.id,
        blockId: item.block.id,
        response: { type: "choice", optionIds: [item.right] },
      });
    expect(await rejection(answer(second))).toMatchObject({
      code: "CONFLICT",
      message: "learning.paced_ahead",
    });
    await answer(first);
    let view = await keeper.learning.paced({ id: started.id });
    expect(
      view.parts.map(({ label, questions }) => ({ label, questions })),
    ).toEqual([
      { label: "Count the sides.", questions: 1 },
      { label: "Now corners.", questions: 1 },
    ]);
    expect(view.joined).toContain(me.id);
    expect(view.questions.map((item) => item.id)).toEqual([first.block.id]);
    expect(view.questions[0]?.standings[me.id]).toBe("first");
    expect(view.questions[0]?.firstChoices[me.id]).toEqual([first.right]);

    await keeper.learning.pace({ id: started.id, revealed: true });
    expect(
      await keeper.learning.pace({ id: started.id, step: 5, paused: true }),
    ).toEqual({ step: 1, paused: true, revealed: false });
    expect(await pupil.learning.pacing({ lessonId: led.id })).toEqual({
      paced: { id: started.id, step: 1, paused: true },
    });
    expect(await rejection(answer(second))).toMatchObject({
      code: "CONFLICT",
      message: "learning.paced_paused",
    });
    await keeper.learning.pace({ id: started.id, paused: false });
    await answer(second);
    view = await keeper.learning.paced({ id: started.id });
    expect(view.questions.map((item) => item.id)).toEqual([second.block.id]);

    await keeper.learning.endPaced({ id: started.id });
    expect(await liveOn()).toEqual([[], []]);
    expect(await pupil.learning.pacing({ lessonId: led.id })).toEqual({
      paced: null,
    });
    expect(
      await rejection(keeper.learning.pace({ id: started.id, step: 0 })),
    ).toMatchObject({ code: "CONFLICT", message: "learning.paced_ended" });
    // What the student did while led stays theirs: opening it finished it.
    expect(
      (await pupil.learning.play({ id: saved.id })).lessons.map(
        (row) => row.state,
      ),
    ).toEqual(["open", "done"]);
  });

  test("a teacher puts one student's written answer on the class board, without their name", async () => {
    const { keeper } = await teachers();
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) throw new Error("no module");
    const pupil = await student();
    const me = await pupil.identity.currentUser();
    let classId = "";
    for (const item of source.classes) {
      const { roster } = await keeper.coursework.groups({ classId: item.id });
      if (roster.some((row) => row.id === me.id)) classId = item.id;
    }
    const saved = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Bridges together",
      summary: "",
      classIds: [classId],
      prerequisiteId: "",
      sequential: false,
    });
    const why = {
      id: id(),
      type: "written" as const,
      prompt: "Why do triangles hold bridges up?",
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      wordLimit: null,
    };
    const led = await keeper.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Bridges",
      completion: "view",
      passScore: null,
      content: written([
        {
          id: id(),
          type: "content",
          content: plainContent("Look at a bridge."),
        },
        why,
        { id: id(), type: "gate", requires: "above" },
        { id: id(), type: "content", content: plainContent("Now arches.") },
      ]),
      publish: false,
    });
    await keeper.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const started = await keeper.learning.startPaced({
      lessonId: led.id,
      classId,
    });
    await pupil.learning.respond({
      lessonId: led.id,
      blockId: why.id,
      response: { type: "written", text: "They cannot bend out of shape." },
    });
    const view = await keeper.learning.paced({ id: started.id });
    expect(view.answers).toEqual([
      {
        id: why.id,
        prompt: why.prompt,
        answers: [
          {
            studentId: me.id,
            text: "They cannot bend out of shape.",
            pictureId: null,
          },
        ],
      },
    ]);
    expect(view.shown).toBeNull();
    await keeper.learning.pace({
      id: started.id,
      shown: { blockId: why.id, studentId: me.id },
    });
    expect((await keeper.learning.paced({ id: started.id })).shown).toEqual({
      blockId: why.id,
      studentId: me.id,
    });
    // Only an answer in words of the class may go up.
    const { id: stranger } = await keeper.identity.currentUser();
    expect(
      await rejection(
        keeper.learning.pace({
          id: started.id,
          shown: { blockId: why.id, studentId: stranger },
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    // Taking the class on clears the board of it.
    await keeper.learning.pace({ id: started.id, step: 1 });
    expect((await keeper.learning.paced({ id: started.id })).shown).toBeNull();
    await keeper.learning.endPaced({ id: started.id });
  });
});
