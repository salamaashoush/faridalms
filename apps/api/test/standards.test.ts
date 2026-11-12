import type { GoalLevel } from "@faridalms/domain/standards";

import { plainContent } from "@faridalms/domain/content-conversion";
import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { describe, expect, test } from "bun:test";

import {
  client,
  login,
  rejection,
  seeded,
  sessionFor,
  signedIn,
} from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const teacher = () => signedIn("northwind", login("teacher", 0, 1));

describe("standards", () => {
  test("a school keeps its own framework, and teachers find its standards to tag", async () => {
    const office = await principal();
    const created = await office.standards.saveFramework({
      id: "",
      expectedVersion: 0,
      title: "Our reading goals",
      description: "",
    });
    const top = await office.standards.saveStandard({
      frameworkId: created.id,
      id: "",
      expectedVersion: 0,
      parentId: "",
      code: "RG.1",
      statement: "Read aloud with expression.",
      itemType: "Goal",
    });
    const second = await office.standards.saveStandard({
      frameworkId: created.id,
      id: "",
      expectedVersion: 0,
      parentId: "",
      code: "RG.2",
      statement: "Retell what was read.",
      itemType: "Goal",
    });
    const under = await office.standards.saveStandard({
      frameworkId: created.id,
      id: "",
      expectedVersion: 0,
      parentId: top.id,
      code: "RG.1.a",
      statement: "Pause at full stops.",
      itemType: "",
    });
    // Moving a standard under one beneath it would make a loop.
    expect(
      await rejection(
        office.standards.move({ id: top.id, parentId: under.id, position: 0 }),
      ),
    ).toMatchObject({ message: "standards.move" });
    await office.standards.move({ id: second.id, parentId: "", position: 0 });
    const opened = await office.standards.framework({ id: created.id });
    expect(
      opened.standards
        .filter((row) => row.parentId === null)
        .map((row) => row.code),
    ).toEqual(["RG.2", "RG.1"]);
    expect(opened.canManage).toBe(true);

    const staff = await teacher();
    expect(
      (await staff.standards.search({ query: "rg.1" })).map((row) => row.code),
    ).toEqual(["RG.1", "RG.1.a"]);
    // Codes read their numbers as numbers, as a framework lists them.
    const tenth = await office.standards.saveStandard({
      frameworkId: created.id,
      id: "",
      expectedVersion: 0,
      parentId: "",
      code: "RG.10",
      statement: "Read a chapter book alone.",
      itemType: "Goal",
    });
    expect(
      (await staff.standards.search({ query: "rg" })).map((row) => row.code),
    ).toEqual(["RG.1", "RG.1.a", "RG.2", "RG.10"]);
    await office.standards.remove({ id: tenth.id });
    expect(await staff.standards.describe({ ids: [under.id] })).toMatchObject([
      { code: "RG.1.a", frameworkTitle: "Our reading goals" },
    ]);
    expect(
      await rejection(
        staff.standards.saveFramework({
          id: created.id,
          expectedVersion: 1,
          title: "Mine now",
          description: "",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    await office.standards.remove({ id: top.id });
    expect(
      (await office.standards.framework({ id: created.id })).standards.map(
        (row) => row.code,
      ),
    ).toEqual(["RG.2"]);
    await office.standards.removeFramework({ id: created.id });
    expect(await staff.standards.describe({ ids: [second.id] })).toEqual([]);
  });

  test("a teacher's observation counts toward a student's skill, and the student reads it", async () => {
    const office = await principal();
    const framework = await office.standards.saveFramework({
      id: "",
      expectedVersion: 0,
      title: "Observed skills",
      description: "",
    });
    const explains = await office.standards.saveStandard({
      frameworkId: framework.id,
      id: "",
      expectedVersion: 0,
      parentId: "",
      code: "OS.1",
      statement: "Explains an idea to the class.",
      itemType: "",
    });
    const pupil = await signedIn("northwind", login("student"));
    const me = await pupil.identity.currentUser();
    const seen = {
      studentId: me.id,
      standardId: explains.id,
      level: "secure" as const,
      note: "Explained how plants use light to the class.",
    };
    expect(await rejection(pupil.standards.observe(seen))).toMatchObject({
      code: "FORBIDDEN",
    });
    await office.standards.observe(seen);

    // One observation is one sitting: secure needs a second.
    const mastered = (await pupil.standards.studentProgress({})).mastery.find(
      (row) => row.standardId === explains.id,
    );
    expect(mastered).toMatchObject({
      level: "developing",
      score: 1,
      occasions: 1,
    });
    expect(
      await pupil.standards.sittings({ standardId: explains.id }),
    ).toMatchObject([
      {
        source: "observation",
        title: seen.note,
        fraction: 1,
        observation: { level: "secure", mine: false },
      },
    ]);

    const [kept] = await office.standards.sittings({
      studentId: me.id,
      standardId: explains.id,
    });
    expect(kept?.observation?.mine).toBe(true);
    await office.standards.removeObservation({ id: kept?.workId ?? "" });
    expect(
      (await pupil.standards.studentProgress({})).mastery.find(
        (row) => row.standardId === explains.id,
      ),
    ).toBeUndefined();
    await office.standards.removeFramework({ id: framework.id });
  });

  test("a rubric level counts toward its criterion's standards, and the student sees it once the work is returned", async () => {
    const office = await principal();
    const framework = await office.standards.saveFramework({
      id: "",
      expectedVersion: 0,
      title: "Writing skills",
      description: "",
    });
    const argues = await office.standards.saveStandard({
      frameworkId: framework.id,
      id: "",
      expectedVersion: 0,
      parentId: "",
      code: "WS.1",
      statement: "Argues a point with evidence.",
      itemType: "",
    });
    const staff = await teacher();
    const pupil = await signedIn("northwind", login("student"));
    const me = await pupil.identity.currentUser();
    const { classes } = await staff.coursework.options();
    let classId = "";
    for (const row of classes)
      if (
        (await staff.coursework.groups({ classId: row.id })).roster.some(
          (student) => student.id === me.id,
        )
      )
        classId = row.id;
    const saved = await staff.coursework.save({
      classId,
      title: "Persuasive letter",
      brief: plainContent("Persuade the head to plant a garden."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 4,
      rubric: {
        criteria: [
          {
            id: "argument",
            title: "Argument",
            standards: [argues.id],
            levels: [
              { id: "exceeds", title: "Exceeds", points: 4 },
              {
                id: "approaching",
                title: "Approaching",
                points: 2,
                description: "A point is made, with little to back it.",
              },
            ],
          },
        ],
      },
    });
    await staff.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const drafted = await pupil.coursework.saveDraft({
      assignmentId: saved.id,
      expectedVersion: 0,
      content: plainContent("We should plant a garden."),
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
      score: 2,
      rubricScores: { argument: "approaching" },
    });
    const masteryOf = async (api: typeof staff, studentId = "") =>
      (await api.standards.studentProgress({ studentId })).mastery.find(
        (row) => row.standardId === argues.id,
      );

    // The teacher sees the draft grade count; the student not yet.
    expect(await masteryOf(staff, me.id)).toMatchObject({
      score: 0.5,
      occasions: 1,
    });
    expect(await masteryOf(pupil)).toBeUndefined();
    expect(await pupil.standards.sittings({ standardId: argues.id })).toEqual(
      [],
    );

    await staff.coursework.act({
      assignmentId: saved.id,
      action: "return",
      studentIds: [me.id],
    });
    expect(await masteryOf(pupil)).toMatchObject({ score: 0.5 });
    expect(
      await pupil.standards.sittings({ standardId: argues.id }),
    ).toMatchObject([
      {
        source: "rubric",
        workId: saved.id,
        title: "Persuasive letter",
        fraction: 0.5,
        answers: 1,
      },
    ]);

    // Graded again higher, the evidence changes; left unmarked, it goes.
    await staff.coursework.assess({
      attemptId: attempt?.id ?? "",
      score: 4,
      rubricScores: { argument: "exceeds" },
    });
    expect(await masteryOf(staff, me.id)).toMatchObject({ score: 1 });
    await staff.coursework.assess({
      attemptId: attempt?.id ?? "",
      score: null,
      rubricScores: {},
    });
    expect(await masteryOf(staff, me.id)).toBeUndefined();
    await office.standards.removeFramework({ id: framework.id });
  });
});

const YOUNG = "northwind-east";

/** A school's EYFS goals framework, added by its head, and the goals in it. */
async function earlyGoals(school: string, head: string) {
  const office = await signedIn(school, head);
  const added = await office.standards.addEarlyGoals();
  const { standards } = await office.standards.framework({ id: added.id });
  const goal = (statement: string) => {
    const found = standards.find((row) => row.statement === statement);
    if (!found) throw new Error(`no goal ${statement}`);
    return found;
  };
  return { office, added, standards, goal };
}

describe("early learning goals", () => {
  test("a teacher judges each child against a goal, best fit, and takes it back", async () => {
    const { office, added, standards, goal } = await earlyGoals(
      "northwind",
      login("principal"),
    );
    // Adding them again brings the school's copy back rather than a second.
    expect((await office.standards.addEarlyGoals()).id).toBe(added.id);
    expect(standards.filter((row) => row.parentId === null)).toHaveLength(7);
    expect(standards.filter((row) => row.parentId !== null)).toHaveLength(17);
    expect(goal("Speaking").parentId).toBe(
      goal("Communication and Language").id,
    );

    const staff = await teacher();
    const taught = (await staff.classes.mine({})).rows[0];
    if (!taught) throw new Error("the teacher keeps no class");
    const shown = await staff.standards.classGoals({
      classId: taught.id,
      frameworkId: added.id,
    });
    expect(shown).toMatchObject({ frameworkId: added.id, canJudge: true });
    expect(shown.goals).toHaveLength(24);
    const child = shown.students[0];
    if (!child) throw new Error("an empty class");
    const speaking = goal("Speaking").id;
    const judge = (level: "emerging" | "expected" | null, note?: string) =>
      staff.standards.judgeGoal({
        classId: taught.id,
        studentId: child.id,
        standardId: speaking,
        level,
        note,
      });
    await judge("emerging", "Answers in single words.");
    // A change of mind keeps the note it was made on.
    await judge("expected");
    const judged = await staff.standards.classGoals({
      classId: taught.id,
      frameworkId: "",
    });
    expect(judged.frameworkId).toBe(added.id);
    expect(judged.judgements).toEqual([
      expect.objectContaining({
        studentId: child.id,
        standardId: speaking,
        level: "expected",
        note: "Answers in single words.",
        lesson: null,
        judgedBy: expect.objectContaining({ id: expect.any(String) }),
      }),
    ]);

    // The child's record shows the goals they were judged on to staff,
    // every goal of the framework with them.
    const record = await office.standards.studentProgress({
      studentId: child.id,
    });
    expect(record.goalFrameworks).toMatchObject([{ id: added.id }]);
    expect(record.goalFrameworks[0]?.goals).toHaveLength(24);
    expect(record.judgements).toMatchObject([
      { standardId: speaking, level: "expected" },
    ]);
    // A family reads their child's progress, but not the judgements made of
    // them.
    const family = await signedIn("northwind", login("parent"));
    const own = (await family.home.followed({})).children[0]?.studentId ?? "";
    let theirs = "";
    for (const row of (await office.classes.directory({})).rows)
      if (
        (await office.classes.record({ id: row.id, on: "" })).roster.some(
          (sitting) => sitting.userId === own,
        )
      )
        theirs = row.id;
    const theirsJudged = (level: "expected" | null) =>
      office.standards.judgeGoal({
        classId: theirs,
        studentId: own,
        standardId: speaking,
        level,
      });
    await theirsJudged("expected");
    expect(
      (await office.standards.studentProgress({ studentId: own })).judgements,
    ).toHaveLength(1);
    expect(
      (await family.standards.studentProgress({ studentId: own })).judgements,
    ).toEqual([]);
    await theirsJudged(null);

    // Only a teacher of the class judges, and only its own children.
    // Other files add classes of their own, empty ones among them.
    let outsider: { userId: string } | undefined;
    for (const row of (await office.classes.directory({})).rows) {
      if (outsider || row.id === taught.id) continue;
      outsider = (
        await office.classes.record({ id: row.id, on: "" })
      ).roster.find(
        (sitting) => !shown.students.some((mine) => mine.id === sitting.userId),
      );
    }
    if (!outsider) throw new Error("the classes share every child");
    expect(
      await rejection(
        staff.standards.judgeGoal({
          classId: taught.id,
          studentId: outsider.userId,
          standardId: speaking,
          level: "expected",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const reader = await signedIn("northwind", login("parent"));
    expect(
      await rejection(
        reader.standards.classGoals({ classId: taught.id, frameworkId: "" }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    await judge(null);
    expect(
      (
        await staff.standards.classGoals({
          classId: taught.id,
          frameworkId: added.id,
        })
      ).judgements,
    ).toEqual([]);
    // Judged again, a goal starts afresh, without the note taken back.
    await judge("emerging");
    expect(
      (
        await staff.standards.classGoals({
          classId: taught.id,
          frameworkId: added.id,
        })
      ).judgements,
    ).toMatchObject([{ level: "emerging", note: "" }]);
    await judge(null);
  });

  test("a young class's teacher judges a goal from a child's answer to a tagged question", async () => {
    const school = seeded().tenants[0]?.schools.find(
      (row) => row.slug === YOUNG,
    );
    const logins = seeded().tenants[0]?.logins ?? [];
    const head = logins.find(
      (row) => row.role === "principal" && row.schoolId === school?.id,
    )?.loginName;
    const name = logins.find(
      (row) => row.role === "teacher" && row.schoolId === school?.id,
    )?.loginName;
    if (!head || !name) throw new Error("the seed lacks the young school");
    const { goal } = await earlyGoals(YOUNG, head);
    const writing = goal("Writing").id;

    const staff = await signedIn(YOUNG, name);
    const homeroom = (await staff.classes.mine({})).rows.find(
      (row) => row.group?.own,
    );
    if (!homeroom) throw new Error("the young teacher keeps no homeroom");
    const { students } = await staff.badges.classBadges({
      classId: homeroom.id,
    });
    const child = students[0];
    if (!child) throw new Error("an empty young homeroom");
    const { badges } = await staff.badges.issueBadges({
      classId: homeroom.id,
      studentIds: [child.userId],
    });
    const secret = badges[0]?.secret ?? "";
    const { token } = await client(YOUNG).identity.badgeSignIn({ secret });
    const pupil = client(YOUNG, token);

    const saved = await staff.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: `Our names ${crypto.randomUUID().slice(0, 6)}`,
      summary: "",
      classIds: [homeroom.id],
      prerequisiteId: "",
      sequential: false,
    });
    const question = {
      id: crypto.randomUUID(),
      type: "written" as const,
      prompt: "Write your name.",
      points: 0,
      hints: [],
      explanation: "",
      tries: null,
      wordLimit: null,
      standards: [writing],
    };
    const content = contentOfLesson({ version: 2, blocks: [question] });
    if (!content) throw new Error("the lesson could not be written");
    const lesson = await staff.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "My name",
      completion: "view",
      passScore: null,
      content,
      publish: false,
    });
    await staff.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    await pupil.learning.playLesson({ id: lesson.id });
    await pupil.learning.respond({
      lessonId: lesson.id,
      blockId: question.id,
      response: { type: "written", text: "Salama" },
    });

    const board = await staff.learning.answers({
      moduleId: saved.id,
      classId: homeroom.id,
    });
    expect(board.questions[0]?.standards).toEqual([writing]);
    expect(board.goals?.standards.map((row) => row.id)).toEqual([writing]);
    expect(board.goals?.judgements).toEqual([]);

    await staff.standards.judgeGoal({
      classId: homeroom.id,
      studentId: child.userId,
      standardId: writing,
      level: "emerging",
      from: { lessonId: lesson.id, blockId: question.id },
    });
    expect(
      (
        await staff.learning.answers({
          moduleId: saved.id,
          classId: homeroom.id,
        })
      ).goals?.judgements,
    ).toEqual([
      { studentId: child.userId, standardId: writing, level: "emerging" },
    ]);
    const tab = await staff.standards.classGoals({
      classId: homeroom.id,
      frameworkId: "",
    });
    expect(tab.judgements).toMatchObject([
      {
        studentId: child.userId,
        level: "emerging",
        lesson: { id: lesson.id, title: "My name", blockId: question.id },
      },
    ]);
    // Only an answer in the class's own lessons is what a judgement is from.
    expect(
      await rejection(
        staff.standards.judgeGoal({
          classId: homeroom.id,
          studentId: child.userId,
          standardId: writing,
          level: "expected",
          from: { lessonId: crypto.randomUUID(), blockId: question.id },
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    // Judged on the class page, it keeps the answer it was first made from.
    await staff.standards.judgeGoal({
      classId: homeroom.id,
      studentId: child.userId,
      standardId: writing,
      level: "expected",
    });
    expect(
      (
        await staff.standards.classGoals({
          classId: homeroom.id,
          frameworkId: "",
        })
      ).judgements,
    ).toMatchObject([{ level: "expected", lesson: { id: lesson.id } }]);

    await staff.standards.judgeGoal({
      classId: homeroom.id,
      studentId: child.userId,
      standardId: writing,
      level: null,
    });
  });

  test("a right answer to a quiz question tagged with a goal waits for its teacher to confirm", async () => {
    const school = seeded().tenants[0]?.schools.find(
      (row) => row.slug === YOUNG,
    );
    const logins = seeded().tenants[0]?.logins ?? [];
    const head = logins.find(
      (row) => row.role === "principal" && row.schoolId === school?.id,
    )?.loginName;
    const name = logins.find(
      (row) => row.role === "teacher" && row.schoolId === school?.id,
    )?.loginName;
    if (!head || !name) throw new Error("the seed lacks the young school");
    const { added, goal } = await earlyGoals(YOUNG, head);
    const number = goal("Number").id;

    const staff = await signedIn(YOUNG, name);
    const homeroom = (await staff.classes.mine({})).rows.find(
      (row) => row.group?.own,
    );
    if (!homeroom) throw new Error("the young teacher keeps no homeroom");
    const { students } = await staff.badges.classBadges({
      classId: homeroom.id,
    });
    const child = students[0];
    if (!child) throw new Error("an empty young homeroom");
    const { badges } = await staff.badges.issueBadges({
      classId: homeroom.id,
      studentIds: [child.userId],
    });
    const { token } = await client(YOUNG).identity.badgeSignIn({
      secret: badges[0]?.secret ?? "",
    });
    const pupil = client(YOUNG, token);

    const saved = await staff.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: `Counting ${crypto.randomUUID().slice(0, 6)}`,
      summary: "",
      classIds: [homeroom.id],
      prerequisiteId: "",
      sequential: false,
    });
    const three = crypto.randomUUID();
    const question = {
      id: crypto.randomUUID(),
      type: "choice" as const,
      prompt: "How many ducks?",
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      options: [
        { id: three, text: "3", feedback: "" },
        { id: crypto.randomUUID(), text: "5", feedback: "" },
      ],
      correctOptionIds: [three],
      multiple: false,
      shuffle: false,
      standards: [number],
    };
    const content = contentOfLesson({ version: 2, blocks: [question] });
    if (!content) throw new Error("the lesson could not be written");
    const lesson = await staff.learning.saveLesson({
      id: "",
      moduleId: saved.id,
      expectedVersion: 0,
      title: "Ducks on the pond",
      completion: "view",
      passScore: null,
      content,
      publish: false,
    });
    await staff.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const goals = () =>
      staff.standards.classGoals({
        classId: homeroom.id,
        frameworkId: added.id,
      });
    expect((await goals()).evidence).toEqual([]);

    await pupil.learning.playLesson({ id: lesson.id });
    await pupil.learning.respond({
      lessonId: lesson.id,
      blockId: question.id,
      response: { type: "choice", optionIds: [three] },
    });
    // The right answer is evidence only: nothing is judged until the
    // teacher confirms it.
    const waiting = await goals();
    expect(waiting.evidence).toEqual([
      {
        studentId: child.userId,
        standardId: number,
        work: { lessonId: lesson.id, blockId: question.id },
        title: "Ducks on the pond",
        answeredAt: expect.any(String),
      },
    ]);
    expect(
      waiting.judgements.filter((row) => row.studentId === child.userId),
    ).toEqual([]);

    await staff.standards.judgeGoal({
      classId: homeroom.id,
      studentId: child.userId,
      standardId: number,
      level: "expected",
      from: { lessonId: lesson.id, blockId: question.id },
    });
    const confirmed = await goals();
    expect(confirmed.evidence).toEqual([]);
    expect(
      confirmed.judgements.find((row) => row.standardId === number),
    ).toMatchObject({
      level: "expected",
      lesson: { id: lesson.id, title: "Ducks on the pond" },
      quiz: null,
    });
    // Judged emerging after it, the answer is not offered again.
    await staff.standards.judgeGoal({
      classId: homeroom.id,
      studentId: child.userId,
      standardId: number,
      level: "emerging",
    });
    expect((await goals()).evidence).toEqual([]);
    // Only a quiz set to the class is what a judgement is from.
    expect(
      await rejection(
        staff.standards.judgeGoal({
          classId: homeroom.id,
          studentId: child.userId,
          standardId: number,
          level: "expected",
          from: { submissionId: crypto.randomUUID(), blockId: question.id },
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    await staff.standards.judgeGoal({
      classId: homeroom.id,
      studentId: child.userId,
      standardId: number,
      level: null,
    });
  });

  test("an exemption, and a report the family reads in their language", async () => {
    const { office, added, goal } = await earlyGoals(
      "northwind",
      login("principal"),
    );
    const family = await sessionFor("northwind", login("parent"));
    const own =
      (await family.api.home.followed({})).children[0]?.studentId ?? "";
    let theirs = "";
    for (const row of (await office.classes.directory({})).rows)
      if (
        (await office.classes.record({ id: row.id, on: "" })).roster.some(
          (sitting) => sitting.userId === own,
        )
      )
        theirs = row.id;
    const speaking = goal("Speaking").id;
    const writing = goal("Writing").id;
    const judge = (standardId: string, level: GoalLevel | null) =>
      office.standards.judgeGoal({
        classId: theirs,
        studentId: own,
        standardId,
        level,
        ...(level === "expected" ? { note: "Talks in full sentences." } : {}),
      });
    await judge(speaking, "expected");
    await judge(writing, "exempt");
    const goals = () =>
      office.standards.classGoals({ classId: theirs, frameworkId: added.id });
    const before = await goals();
    expect(before).toMatchObject({
      report: { shared: 0, sharedAt: null },
    });
    expect(
      before.judgements.find((row) => row.standardId === writing),
    ).toMatchObject({ level: "exempt" });

    // Nothing reaches the family until a teacher shares it.
    expect(await family.api.standards.goalsReport({ studentId: own })).toEqual({
      reports: [],
    });
    await office.standards.shareGoalsReport({
      classId: theirs,
      frameworkId: added.id,
      shared: true,
    });
    const shared = await goals();
    expect(shared.report.shared).toBe(shared.students.length);
    expect(shared.report.sharedAt).toEqual(expect.any(String));

    const report = await family.api.standards.goalsReport({ studentId: own });
    expect(report.reports).toHaveLength(1);
    expect(report.reports[0]).toMatchObject({
      id: added.id,
      title: "EYFS early learning goals",
    });
    expect(report.reports[0]?.goals).toHaveLength(24);
    expect(report.reports[0]?.levels).toEqual(
      expect.arrayContaining([
        { standardId: speaking, level: "expected" },
        { standardId: writing, level: "exempt" },
      ]),
    );
    // The teacher's notes stay with staff.
    expect(JSON.stringify(report)).not.toContain("full sentences");
    const arabic = await client(
      "northwind",
      family.token,
      "ar",
    ).standards.goalsReport({ studentId: own });
    expect(arabic.reports[0]?.title).toBe("أهداف التعلّم المبكر في EYFS");
    expect(
      arabic.reports[0]?.goals.find((row) => row.id === speaking)?.statement,
    ).toBe("التحدّث");

    await office.standards.shareGoalsReport({
      classId: theirs,
      frameworkId: added.id,
      shared: false,
    });
    expect(await family.api.standards.goalsReport({ studentId: own })).toEqual({
      reports: [],
    });
    expect(
      await rejection(
        family.api.standards.shareGoalsReport({
          classId: theirs,
          frameworkId: added.id,
          shared: true,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    await judge(speaking, null);
    await judge(writing, null);
  });

  test("a school adds Development Matters to follow younger children", async () => {
    const office = await principal();
    const added = await office.standards.addDevelopmentMatters();
    const first = await office.standards.framework({ id: added.id });
    expect((await office.standards.addDevelopmentMatters()).id).toBe(added.id);
    const { framework, standards } = await office.standards.framework({
      id: added.id,
    });
    // Adding it again unchanged writes nothing, so a statement someone is
    // wording meanwhile still saves.
    expect(standards.map((row) => [row.id, row.version, row.parentId])).toEqual(
      first.standards.map((row) => [row.id, row.version, row.parentId]),
    );
    expect(framework.title).toBe("Development Matters");
    const kinds = (itemType: string) =>
      standards.filter((row) => row.itemType === itemType);
    expect(kinds("Area of learning")).toHaveLength(7);
    expect(kinds("Age band")).toHaveLength(21);
    expect(kinds("Statement")).toHaveLength(298);
    const reception = kinds("Age band").find(
      (row) =>
        row.statement === "Children in reception" &&
        row.parentId === kinds("Area of learning")[0]?.id,
    );
    expect(
      standards.filter((row) => row.parentId === reception?.id),
    ).toHaveLength(17);
    await office.standards.removeFramework({ id: added.id });
  });

  test("a school words Development Matters' statements in Arabic, keeping the English", async () => {
    const office = await principal();
    const added = await office.standards.addDevelopmentMatters();
    const listed = async () =>
      (await office.standards.framework({ id: added.id })).standards;
    const statement = (await listed()).find(
      (row) => row.statement === "Watch someone’s face as they talk.",
    );
    if (!statement) throw new Error("no statement");
    expect(statement.statementAr).toBeNull();
    const wording = "ينظر إلى وجه من يتحدّث إليه.";
    await office.standards.saveStandard({
      frameworkId: added.id,
      id: statement.id,
      expectedVersion: statement.version,
      parentId: statement.parentId ?? "",
      code: statement.code,
      statement: statement.statement,
      statementAr: wording,
      itemType: statement.itemType,
    });
    // Adding the framework again brings back its English, and keeps the
    // school's own wording beside it.
    await office.standards.addDevelopmentMatters();
    expect(
      (await listed()).find((row) => row.id === statement.id),
    ).toMatchObject({
      statement: "Watch someone’s face as they talk.",
      statementAr: wording,
    });

    const family = await sessionFor("northwind", login("parent"));
    const own =
      (await family.api.home.followed({})).children[0]?.studentId ?? "";
    let theirs = "";
    for (const row of (await office.classes.directory({})).rows)
      if (
        (await office.classes.record({ id: row.id, on: "" })).roster.some(
          (sitting) => sitting.userId === own,
        )
      )
        theirs = row.id;
    await office.standards.shareGoalsReport({
      classId: theirs,
      frameworkId: added.id,
      shared: true,
    });
    const read = async (locale: string) =>
      (
        await client("northwind", family.token, locale).standards.goalsReport({
          studentId: own,
        })
      ).reports
        .find((row) => row.id === added.id)
        ?.goals.find((row) => row.id === statement.id)?.statement;
    expect(await read("ar")).toBe(wording);
    expect(await read("en")).toBe("Watch someone’s face as they talk.");
    // A statement the school has not worded stays in the guidance's English.
    const other = (await listed()).find(
      (row) =>
        row.statement === "Enjoy singing, music and toys that make sounds.",
    );
    expect(
      (
        await client("northwind", family.token, "ar").standards.goalsReport({
          studentId: own,
        })
      ).reports
        .find((row) => row.id === added.id)
        ?.goals.find((row) => row.id === other?.id)?.statement,
    ).toBe("Enjoy singing, music and toys that make sounds.");
    await office.standards.shareGoalsReport({
      classId: theirs,
      frameworkId: added.id,
      shared: false,
    });
    await office.standards.removeFramework({ id: added.id });
  });
});
