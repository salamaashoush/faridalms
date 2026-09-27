import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, rejection, seeded, signedIn } from "./harness";

const student = () => signedIn("northwind", login("student"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

type Api = Awaited<ReturnType<typeof student>>;

const TITLE = "Reading stories together";

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

describe("learning a module", () => {
  test("a student works through the lessons in order, and a quiz shows no answers first", async () => {
    const api = await student();
    const { rows } = await api.learning.mine({});
    const module = rows.find((row) => row.title === TITLE);
    if (!module) throw new Error("the student is not in 8A");
    expect(rows.some((row) => row.title === "Poetry out loud")).toBe(false);

    let outline = await api.learning.play({ id: module.id });
    const [reading, check, reflection] = outline.lessons;
    if (!reading || !check || !reflection) throw new Error("three lessons");
    if (reading.state !== "done") {
      expect(check.state).toBe("locked");
      await api.learning.playLesson({ id: reading.id });
      outline = await api.learning.play({ id: module.id });
    }
    expect(outline.lessons[1]?.state).toBe("open");
    expect(outline.lessons[2]?.state).toBe("locked");
    expect(
      await rejection(api.learning.playLesson({ id: reflection.id })),
    ).toMatchObject({ code: "CONFLICT", message: "learning.locked" });

    const opened = await api.learning.playLesson({ id: check.id });
    const quiz = opened.blocks.find((block) => block.type === "quiz");
    if (!quiz) throw new Error("no quiz");
    expect("correctOptionIds" in quiz).toBe(false);
    const wrong = quiz.options.find((option) => option.text === "A dragon");
    const right = quiz.options.find((option) =>
      option.text.startsWith("A problem"),
    );
    if (!wrong || !right) throw new Error("options changed");
    const miss = await api.learning.answer({
      lessonId: check.id,
      blockId: quiz.id,
      optionIds: [wrong.id],
    });
    expect(miss).toMatchObject({ correct: false });
    const hit = await api.learning.answer({
      lessonId: check.id,
      blockId: quiz.id,
      optionIds: [right.id],
    });
    expect(hit).toMatchObject({ correct: true, completed: true, score: 100 });

    const last = await api.learning.playLesson({ id: reflection.id });
    const prompt = last.blocks.find((block) => block.type === "reflection");
    if (!prompt) throw new Error("no reflection");
    expect(
      await api.learning.reflect({
        lessonId: reflection.id,
        blockId: prompt.id,
        text: "Charlotte's Web: saving Wilbur.",
      }),
    ).toEqual({ completed: true });
    const after = await api.learning.mine({});
    const finished = after.rows.find((row) => row.id === module.id);
    expect(finished?.completed).toBe(finished?.lessons);
  });

  test("a family reads their child's progress", async () => {
    const family = await mother();
    const me = await (await student()).identity.currentUser();
    const { rows } = await family.learning.mine({ studentId: me.id });
    expect(rows.some((row) => row.title === TITLE)).toBe(true);
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
      content: {
        version: 1,
        blocks: [
          {
            id: crypto.randomUUID(),
            type: "content",
            content: plainContent("A half is one of two equal parts."),
          },
        ],
      },
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
