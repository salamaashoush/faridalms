import { plainContent } from "@faridalms/domain/content-conversion";
import {
  briefWithQuiz,
  contentOfLesson,
} from "@faridalms/domain/lesson-content";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { handInTimedOut } from "../src/quizzes/clock";
import {
  login,
  rejection,
  seeded,
  setPlan,
  signedIn,
  workerModules,
} from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const teacher = () => signedIn("northwind", login("teacher", 0, 1));
const student = () => signedIn("northwind", login("student"));

const suffix = () => crypto.randomUUID().slice(0, 6).toUpperCase();

function northwind() {
  const school = seeded().tenants[0]?.schools.find(
    (row) => row.slug === "northwind",
  );
  if (!school) throw new Error("the seed lacks Northwind");
  return school.id;
}

/** Runs a test with these modules off at Northwind, and puts its plan back after. */
async function without(
  off: readonly string[],
  run: () => Promise<void>,
): Promise<void> {
  const schoolId = northwind();
  await setPlan(schoolId, {
    modules: MODULE_IDS.filter((id) => !off.includes(id)),
  });
  try {
    await run();
  } finally {
    await setPlan(schoolId, null);
  }
}

/** A class of the school's own, in no school year, with the seeded teacher and student in it. */
async function classOfItsOwn(input: { startsOn: string; endsOn?: string }) {
  const office = await principal();
  const staff = await teacher();
  const pupil = await student();
  const [teacherMe, me] = await Promise.all([
    staff.identity.currentUser(),
    pupil.identity.currentUser(),
  ]);
  const code = `OWN-${suffix()}`;
  const saved = await office.classes.save({
    startsOn: input.startsOn,
    endsOn: input.endsOn ?? "",
    code,
    titleEn: `A class of its own ${code}`,
    teacherIds: [teacherMe.id],
  });
  await office.classes.enrol({
    studentId: me.id,
    classId: saved.id,
    from: input.startsOn,
  });
  return { office, staff, pupil, me, classId: saved.id, code };
}

const work = (classId: string, title: string, extra: object = {}) => ({
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

describe("teaching without school years", () => {
  test("a class in no year takes work that is set, handed in, marked and returned, and its gradebook keeps a running grade", async () => {
    await without(["school_years"], async () => {
      const { today } = await (await principal()).identity.currentUser();
      const { staff, pupil, me, classId } = await classOfItsOwn({
        startsOn: addDays(today, -7),
      });
      const options = await staff.coursework.options();
      expect(options.classes.map((row) => row.id)).toContain(classId);
      // A term is a school year's, so no module keeps one here.
      expect(
        await rejection(
          staff.coursework.save(
            work(classId, "Rivers", { parts: { term: crypto.randomUUID() } }),
          ),
        ),
      ).toMatchObject({
        code: "BAD_REQUEST",
        message: "coursework.part_unknown",
      });

      const saved = await staff.coursework.save(work(classId, "Rivers"));
      await staff.coursework.publish({
        id: saved.id,
        expectedVersion: saved.version,
      });
      const listed = await staff.coursework.list({ tab: "assigned" });
      expect(listed.rows.map((row) => row.id)).toContain(saved.id);
      expect(
        (await pupil.coursework.mine({})).rows.find(
          (row) => row.assignmentId === saved.id,
        )?.state,
      ).toBe("to_do");
      const drafted = await pupil.coursework.saveDraft({
        assignmentId: saved.id,
        expectedVersion: 0,
        content: plainContent("The Nile is the longest."),
      });
      await pupil.coursework.handIn({
        assignmentId: saved.id,
        expectedVersion: drafted.version,
      });
      const [attempt] = (
        await staff.coursework.grading({
          assignmentId: saved.id,
          studentId: me.id,
        })
      ).attempts;
      await staff.coursework.assess({
        attemptId: attempt?.id ?? "",
        score: 9,
        feedback: "Well found.",
      });
      await staff.coursework.act({
        assignmentId: saved.id,
        action: "return",
        studentIds: [me.id],
      });
      expect(await pupil.coursework.work({ id: saved.id })).toMatchObject({
        state: "returned",
      });

      // The book runs over all the class's work, with no term to keep.
      const book = await staff.gradebook.classBook({ classId });
      expect(book.term).toBeNull();
      expect(book.assignments.map((row) => row.id)).toEqual([saved.id]);
      expect(
        book.calculated.find((row) => row.studentId === me.id)?.percent,
      ).toBe(90);
      for (const call of [
        () =>
          staff.gradebook.savePeriodGrades({
            classId,
            periodId: crypto.randomUUID(),
            grades: [{ studentId: me.id, score: 90, comment: "" }],
          }),
        () =>
          staff.gradebook.releasePeriod({
            classId,
            periodId: crypto.randomUUID(),
          }),
        () => staff.gradebook.workTerm({ classId, assignmentId: "" }),
      ])
        expect(await rejection(call())).toMatchObject({ code: "NOT_FOUND" });
      expect(await pupil.gradebook.student({})).toEqual({
        year: null,
        rows: [],
      });
      expect(
        await rejection(
          (await principal()).gradebook.regradeTerm({
            periodId: crypto.randomUUID(),
            reason: "New bands.",
          }),
        ),
      ).toMatchObject({ code: "NOT_FOUND" });
    });
  });

  test("work in a class that ended leaves the lists of current work, and is still found among the ended", async () => {
    await without(["school_years"], async () => {
      const { today } = await (await principal()).identity.currentUser();
      const { staff, pupil, classId } = await classOfItsOwn({
        startsOn: addDays(today, -60),
        endsOn: addDays(today, -2),
      });
      const saved = await staff.coursework.save(work(classId, "Old work"));
      await staff.coursework.publish({
        id: saved.id,
        expectedVersion: saved.version,
      });
      const tabs = ["assigned", "past"] as const;
      const listed = async (ended: boolean) =>
        (
          await Promise.all(
            tabs.map((tab) => staff.coursework.list({ tab, ended })),
          )
        ).flatMap((result) => result.rows.map((row) => row.id));
      expect(await listed(false)).not.toContain(saved.id);
      expect(await listed(true)).toContain(saved.id);
      const mine = async (ended: boolean) =>
        (await pupil.coursework.mine({ ended })).rows.map(
          (row) => row.assignmentId,
        );
      expect(await mine(false)).not.toContain(saved.id);
      expect(await mine(true)).toContain(saved.id);
    });
  });

  test("a module is set for a class in no year, published to its students, and its units are dated inside the class's days", async () => {
    await without(["school_years"], async () => {
      const { today } = await (await principal()).identity.currentUser();
      const { staff, pupil, classId } = await classOfItsOwn({
        startsOn: addDays(today, -7),
        endsOn: addDays(today, 60),
      });
      const module = await staff.learning.saveModule({
        id: "",
        expectedVersion: 0,
        title: `Rivers of the world ${suffix()}`,
        summary: "",
        classIds: [classId],
        prerequisiteId: "",
        sequential: false,
      });
      const content = contentOfLesson({
        version: 2,
        blocks: [
          {
            id: crypto.randomUUID(),
            type: "written",
            prompt: "Name a river.",
            points: 0,
            hints: [],
            explanation: "",
            tries: null,
            wordLimit: null,
          },
        ],
      });
      if (!content) throw new Error("the lesson could not be written");
      await staff.learning.saveLesson({
        id: "",
        moduleId: module.id,
        expectedVersion: 0,
        title: "The Nile",
        completion: "view",
        passScore: null,
        content,
        publish: false,
      });
      await staff.learning.publishModule({
        id: module.id,
        expectedVersion: module.version,
      });
      expect(
        (await pupil.learning.mine({})).rows.map((row) => row.id),
      ).toContain(module.id);

      const plan = await staff.learning.unitPlan({ classId });
      expect(plan.frame).toBeNull();
      expect(plan.units.map((row) => row.id)).toContain(module.id);
      const dates = { moduleId: module.id, classId };
      expect(
        await rejection(
          staff.learning.setUnitDates({
            ...dates,
            startsOn: addDays(today, -10),
            endsOn: addDays(today, 3),
          }),
        ),
      ).toMatchObject({ message: "learning.unit_dates_runs" });
      await staff.learning.setUnitDates({
        ...dates,
        startsOn: today,
        endsOn: addDays(today, 13),
      });
      expect(
        (await staff.learning.unitPlan({ classId })).units.find(
          (row) => row.id === module.id,
        ),
      ).toMatchObject({ startsOn: today, endsOn: addDays(today, 13) });

      // A discussion stands in the module beside its lessons, for this class too.
      const discussion = await staff.coursework.save(
        work(classId, "Which river would you cross?", {
          submissionFormat: "discussion",
          discussion: { postFirst: false, replies: 0 },
          parts: { module: module.id },
        }),
      );
      await staff.coursework.publish({
        id: discussion.id,
        expectedVersion: discussion.version,
      });
      expect(
        (await pupil.learning.discussions({ moduleId: module.id })).map(
          (row) => row.id,
        ),
      ).toEqual([discussion.id]);
      await staff.learning.archiveModule({
        id: module.id,
        expectedVersion: (await staff.learning.record({ id: module.id }))
          .version,
      });
    });
  });
});

describe("terms where school years are on", () => {
  test("work counts toward a term of its class's year, and no other", async () => {
    const staff = await teacher();
    const { classes } = await staff.coursework.options();
    let found: { classId: string; periodId: string } | null = null;
    for (const row of classes) {
      const { terms } = await staff.gradebook.workTerm({
        classId: row.id,
        assignmentId: "",
      });
      if (terms[0]) {
        found = { classId: row.id, periodId: terms[0].id };
        break;
      }
    }
    if (!found) throw new Error("the seed's year has no terms");
    const { classId, periodId } = found;
    expect(
      await rejection(
        staff.coursework.save(
          work(classId, "Term work", { parts: { term: crypto.randomUUID() } }),
        ),
      ),
    ).toMatchObject({ message: "coursework.term_unknown" });
    const saved = await staff.coursework.save(
      work(classId, "Term work", { parts: { term: periodId } }),
    );
    expect(
      await staff.gradebook.workTerm({ classId, assignmentId: saved.id }),
    ).toMatchObject({ periodId });
    // Saved without the part, the term stays as it was.
    const latest = await staff.coursework.editor({ id: saved.id });
    await staff.coursework.save(
      work(classId, "Term work, again", {
        id: saved.id,
        expectedVersion: latest.version,
      }),
    );
    expect(
      await staff.gradebook.workTerm({ classId, assignmentId: saved.id }),
    ).toMatchObject({ periodId });
    await staff.coursework.publish({
      id: saved.id,
      expectedVersion: (await staff.coursework.editor({ id: saved.id }))
        .version,
    });
    const book = await staff.gradebook.classBook({ classId, periodId });
    expect(book.term?.periodId).toBe(periodId);
    expect(book.assignments.map((row) => row.id)).toContain(saved.id);

    const office = await principal();
    const counts = await office.gradebook.regradeTerm({
      periodId,
      reason: "The school moved to new bands.",
    });
    expect(counts.terms).toBeGreaterThanOrEqual(0);
    expect(counts.work).toBeGreaterThanOrEqual(0);
  });
});

/** Runs a test with a framework of the school's own holding one standard, taken away after. */
async function withStandard(
  statement: string,
  run: (standard: { id: string }) => Promise<void>,
) {
  const { office, framework, standard } = await aStandard(statement);
  try {
    await run(standard);
  } finally {
    await office.standards.removeFramework({ id: framework.id });
  }
}

/** A framework of the school's own with one standard, added by its head. */
async function aStandard(statement: string) {
  const office = await principal();
  const framework = await office.standards.saveFramework({
    id: "",
    expectedVersion: 0,
    title: `Skills ${suffix()}`,
    description: "",
  });
  const standard = await office.standards.saveStandard({
    frameworkId: framework.id,
    id: "",
    expectedVersion: 0,
    parentId: "",
    code: "S.1",
    statement,
    itemType: "",
  });
  return { office, framework, standard };
}

/**
 * A timed quiz with one question on the standard, its student's attempt
 * answered right and let run out, for the clock to hand in.
 */
async function timedOutQuiz(standardId: string) {
  const { today } = await (await principal()).identity.currentUser();
  const { staff, pupil, me, classId } = await classOfItsOwn({
    startsOn: addDays(today, -7),
  });
  const right = crypto.randomUUID();
  const choice = {
    hints: [],
    explanation: "Because.",
    tries: null,
    id: crypto.randomUUID(),
    type: "choice" as const,
    prompt: "Which is a river?",
    points: 1,
    options: [
      { id: right, text: "The Nile", feedback: "" },
      { id: crypto.randomUUID(), text: "The Alps", feedback: "" },
    ],
    correctOptionIds: [right],
    multiple: false,
    shuffle: false,
    standards: [standardId],
  };
  const saved = await staff.coursework.save(
    work(classId, "Rivers quiz", {
      submissionFormat: "quiz",
      points: null,
      brief: briefWithQuiz(plainContent("Answer in time."), {
        version: 2,
        blocks: [choice],
      }),
      quiz: {
        attempts: 1,
        keep: "highest",
        reveal: "answers",
        shuffle: false,
        timeLimit: 10,
      },
    }),
  );
  await staff.coursework.publish({
    id: saved.id,
    expectedVersion: saved.version,
  });
  await pupil.coursework.startQuiz({ assignmentId: saved.id });
  await pupil.coursework.saveQuizAnswer({
    assignmentId: saved.id,
    blockId: choice.id,
    response: { type: "choice", optionIds: [right] },
  });
  const { cell, tenants } = seeded();
  const tenantId = tenants[0]?.tenantId ?? "";
  await cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
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
  const evidence = async () =>
    cell.withWorker(
      { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
      "read",
      async (tx) =>
        (
          await tx.execute<{ count: number }>(sql`
            select count(*)::int as count from core.standard_evidence
            where tenant_id = ${tenantId}::uuid and standard_id = ${standardId}::uuid
              and student_user_id = ${me.id}::uuid and status = 'active'`)
        )[0]?.count ?? 0,
    );
  const handIn = () =>
    handInTimedOut(cell, tenantId, new Date(), workerModules());
  return { staff, pupil, me, saved, evidence, handIn };
}

describe("the modules a background worker acts for", () => {
  test("a quiz the clock hands in gives evidence where standards is on", async () => {
    await withStandard("Names a river.", async (standard) => {
      const quiz = await timedOutQuiz(standard.id);
      expect(await quiz.handIn()).toBeGreaterThan(0);
      expect(await quiz.evidence()).toBe(1);
      expect(
        (
          await quiz.staff.standards.studentProgress({ studentId: quiz.me.id })
        ).mastery.find((row) => row.standardId === standard.id),
      ).toMatchObject({ occasions: 1, score: 1 });
    });
  });

  test("a quiz the clock hands in gives none where standards is off, as a request would", async () => {
    await withStandard("Finds a delta.", async (standard) => {
      const quiz = await timedOutQuiz(standard.id);
      await without(["standards"], async () => {
        expect(await quiz.handIn()).toBeGreaterThan(0);
        expect(
          (await quiz.pupil.coursework.work({ id: quiz.saved.id })).quiz
            ?.results[0],
        ).toMatchObject({ score: 1 });
      });
      expect(await quiz.evidence()).toBe(0);
    });
  });
});

describe("where a student's evidence came from", () => {
  test("with e-learning off, handed-in work still gives evidence, and lists it", async () => {
    await withStandard("Argues a point.", async (standard) => {
      await without(["elearning"], async () => {
        const quiz = await timedOutQuiz(standard.id);
        await quiz.handIn();
        expect(
          (
            await quiz.pupil.standards.sittings({ standardId: standard.id })
          ).map((row) => [row.source, row.workId]),
        ).toEqual([["quiz", quiz.saved.id]]);
        // A judgement from a lesson cannot be made where lessons are off.
        expect(
          await rejection(
            quiz.staff.standards.judgeGoal({
              classId: (
                await quiz.staff.coursework.editor({ id: quiz.saved.id })
              ).classId,
              studentId: quiz.me.id,
              standardId: standard.id,
              level: "expected",
              note: "",
              from: {
                lessonId: crypto.randomUUID(),
                blockId: crypto.randomUUID(),
              },
            }),
          ),
        ).toMatchObject({ code: "NOT_FOUND" });
      });
    });
  });

  test("with coursework off, a lesson's tagged answer still gives evidence; work's evidence stays but is not listed", async () => {
    await withStandard("Reads a map.", async (standard) => {
      const quiz = await timedOutQuiz(standard.id);
      await quiz.handIn();
      const { today } = await (await principal()).identity.currentUser();
      const { staff, pupil, me, classId } = await classOfItsOwn({
        startsOn: addDays(today, -7),
      });
      const module = await staff.learning.saveModule({
        id: "",
        expectedVersion: 0,
        title: `Maps ${suffix()}`,
        summary: "",
        classIds: [classId],
        prerequisiteId: "",
        sequential: false,
      });
      const right = crypto.randomUUID();
      const content = contentOfLesson({
        version: 2,
        blocks: [
          {
            id: crypto.randomUUID(),
            type: "choice",
            prompt: "Which way is north?",
            points: 1,
            hints: [],
            explanation: "",
            tries: null,
            options: [
              { id: right, text: "Up", feedback: "" },
              { id: crypto.randomUUID(), text: "Down", feedback: "" },
            ],
            correctOptionIds: [right],
            multiple: false,
            shuffle: false,
            standards: [standard.id],
          },
        ],
      });
      if (!content) throw new Error("the lesson could not be written");
      const block = content;
      await staff.learning.saveLesson({
        id: "",
        moduleId: module.id,
        expectedVersion: 0,
        title: "North",
        completion: "view",
        passScore: null,
        content: block,
        publish: false,
      });
      await staff.learning.publishModule({
        id: module.id,
        expectedVersion: module.version,
      });
      await without(["coursework"], async () => {
        const outline = await pupil.learning.play({ id: module.id });
        const lessonId = outline.lessons[0]?.id ?? "";
        const played = await pupil.learning.playLesson({ id: lessonId });
        const question = played.blocks.find((row) => row.type === "choice");
        await pupil.learning.respond({
          lessonId,
          blockId: question?.id ?? "",
          response: { type: "choice", optionIds: [right] },
        });
        const sittings = await staff.standards.sittings({
          studentId: me.id,
          standardId: standard.id,
        });
        // The lesson is listed; the quiz, whose module is off, is not.
        expect(sittings.map((row) => [row.source, row.workId])).toEqual([
          ["lesson", lessonId],
        ]);
        // Its evidence is still the student's, and counts for their teachers.
        expect(
          (
            await staff.standards.studentProgress({ studentId: me.id })
          ).mastery.find((row) => row.standardId === standard.id),
        ).toMatchObject({ occasions: 2 });
      });
      await staff.learning.archiveModule({
        id: module.id,
        expectedVersion: (await staff.learning.record({ id: module.id }))
          .version,
      });
    });
  });
});
