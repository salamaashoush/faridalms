import { plainContent } from "@faridalms/domain/content-conversion";
import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { describe, expect, test } from "bun:test";

import { client, login, rejection, seeded, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const teacher = () => signedIn("northwind", login("teacher", 0, 1));

const node = (identifier: string) => ({
  identifier,
  uri: `https://case.example.com/uri/${identifier}`,
  title: "",
});

/** A small CASE package: a strand with two standards under it. */
function casePackage(document: string, items: string[], extra = false) {
  const [strand, first, second, third] = items as [
    string,
    string,
    string,
    string,
  ];
  return {
    CFDocument: {
      identifier: document,
      title: "Example science",
      description: "Shared by an example board.",
      creator: "Example board",
    },
    CFItems: [
      {
        identifier: strand,
        fullStatement: "Living things",
        CFItemType: "Strand",
      },
      {
        identifier: first,
        fullStatement: "Name the parts of a plant.",
        humanCodingScheme: "SC.1",
      },
      {
        identifier: second,
        fullStatement: extra
          ? "Explain what roots and leaves do."
          : "Say what roots do.",
        humanCodingScheme: "SC.2",
      },
      ...(extra
        ? [
            {
              identifier: third,
              fullStatement: "Sort animals by what they eat.",
              humanCodingScheme: "SC.3",
            },
          ]
        : []),
    ],
    CFAssociations: [
      {
        identifier: crypto.randomUUID(),
        associationType: "isChildOf",
        originNodeURI: node(strand),
        destinationNodeURI: node(document),
      },
      ...[first, second, ...(extra ? [third] : [])].map((item, index) => ({
        identifier: crypto.randomUUID(),
        associationType: "isChildOf",
        originNodeURI: node(item),
        destinationNodeURI: node(strand),
        sequenceNumber: index + 1,
      })),
    ],
  };
}

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

  test("a CASE package imports as a framework, and importing it again updates it in place", async () => {
    const office = await principal();
    const document = crypto.randomUUID();
    const items = [1, 2, 3, 4].map(() => crypto.randomUUID());
    const first = await office.standards.importCase({
      frameworkId: "",
      casePackage: casePackage(document, items),
    });
    expect(first.imported).toBe(3);
    const before = await office.standards.framework({ id: first.id });
    expect(before.framework).toMatchObject({
      title: "Example science",
      caseIdentifier: document,
    });
    const sc2 = before.standards.find((row) => row.code === "SC.2");
    const strand = before.standards.find((row) => row.itemType === "Strand");
    expect(sc2?.parentId).toBe(strand?.id ?? "");

    const again = await office.standards.importCase({
      frameworkId: "",
      casePackage: casePackage(document, items, true),
    });
    expect(again).toMatchObject({ id: first.id, imported: 4 });
    const after = await office.standards.framework({ id: first.id });
    const sc2After = after.standards.find((row) => row.code === "SC.2");
    expect(sc2After).toMatchObject({
      id: sc2?.id,
      statement: "Explain what roots and leaves do.",
    });
    expect(after.standards.map((row) => row.code)).toContain("SC.3");
    await office.standards.removeFramework({ id: first.id });
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
    const own = (await family.home.family({})).children[0]?.studentId ?? "";
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
      (row) => row.classType === "homeroom",
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
});
