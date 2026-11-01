import type { LessonBlock } from "@faridalms/domain/learning";

import { plainContent } from "@faridalms/domain/content-conversion";
import {
  briefWithQuiz,
  contentOfLesson,
} from "@faridalms/domain/lesson-content";
import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";

import { DOMAINS, login, raw, seeded, sessionFor } from "./harness";

const TITLE = "Reading stories together";
const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

/** A teacher of the seeded module, who may make modules for its classes. */
async function teacherOfModule() {
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === "northwind");
  for (const row of tenant?.logins ?? []) {
    if (row.role !== "teacher" || row.schoolId !== school?.id) continue;
    const session = await sessionFor("northwind", row.loginName);
    const source = (await session.api.learning.modules({})).rows.find(
      (item) => item.title === TITLE,
    );
    if (source)
      return { session, classIds: source.classes.map((item) => item.id) };
  }
  throw new Error("no teacher of the module");
}

/** A module with one lesson asking the questions given, as its teacher wrote them. */
async function moduleAsking(
  title: string,
  blocks: LessonBlock[],
  publish = false,
) {
  const { session, classIds } = await teacherOfModule();
  const saved = await session.api.learning.saveModule({
    id: "",
    expectedVersion: 0,
    title,
    summary: "",
    classIds,
    prerequisiteId: "",
    sequential: false,
  });
  const content = contentOfLesson({ version: 2, blocks });
  if (!content) throw new Error("no document");
  const lesson = await session.api.learning.saveLesson({
    id: "",
    moduleId: saved.id,
    expectedVersion: 0,
    title: "The flood",
    completion: "view",
    passScore: null,
    content,
    publish,
  });
  if (publish)
    await session.api.learning.publishModule({
      id: saved.id,
      expectedVersion: saved.version,
    });
  return {
    teacher: session,
    moduleId: saved.id,
    classIds,
    lessonId: lesson.id,
  };
}

const unzipped = async (response: Response) => {
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  return Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [
      name,
      /\.(?:xml|html|json)$/u.test(name)
        ? new TextDecoder().decode(bytes)
        : bytes,
    ]),
  );
};

describe("moving teaching between systems", () => {
  test("a module's questions leave as a QTI 3 package, pictures and all", async () => {
    const { session: probe } = await teacherOfModule();
    const file = await probe.api.files.initiate({
      purpose: "document_media",
      name: "delta.png",
      mediaType: "image/png",
      sizeBytes: PIXEL.byteLength,
    });
    expect(
      (
        await raw("northwind", probe.token, `/v1/files/${file.id}/content`, {
          method: "PUT",
          body: PIXEL,
        })
      ).status,
    ).toBe(200);
    const common = { points: 2, hints: [], explanation: "", tries: null };
    const nile = crypto.randomUUID();
    const { teacher, moduleId } = await moduleAsking("Floods to share", [
      {
        ...common,
        id: crypto.randomUUID(),
        type: "choice",
        prompt: "Which river floods Egypt?",
        options: [
          { id: nile, text: "The Nile", feedback: "" },
          { id: crypto.randomUUID(), text: "The Thames", feedback: "" },
        ],
        correctOptionIds: [nile],
        multiple: false,
        shuffle: true,
      },
      {
        ...common,
        id: crypto.randomUUID(),
        type: "hotspot",
        prompt: "Find the delta.",
        picture: { fileId: file.id, alt: "The delta" },
        places: [{ box: [0, 0, 1, 1], name: "Delta", correct: true }],
      },
    ]);

    const response = await raw(
      "northwind",
      teacher.token,
      `/v1/modules/${moduleId}/questions.zip`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    const files = await unzipped(response);
    expect(Object.keys(files).toSorted()).toEqual([
      "imsmanifest.xml",
      "items/q1.xml",
      "items/q2.xml",
      "media/delta.png",
      "tests/t1.xml",
    ]);
    expect(files["media/delta.png"]).toEqual(PIXEL);
    const manifest = String(files["imsmanifest.xml"]);
    expect(manifest).toContain("<schemaversion>3.0.0</schemaversion>");
    expect(manifest).toContain(
      '<resource identifier="Q2" type="imsqti_item_xmlv3p0" href="items/q2.xml"><file href="items/q2.xml"/><dependency identifierref="MEDIA"/></resource>',
    );
    expect(String(files["items/q1.xml"])).toContain(
      "<qti-correct-response><qti-value>C1</qti-value></qti-correct-response>",
    );
    // The picture's own size places the delta: the whole of a one-pixel picture.
    expect(String(files["items/q2.xml"])).toContain(
      '<img src="../media/delta.png" alt="The delta" width="1" height="1"/><qti-hotspot-choice identifier="H1" shape="rect" coords="0,0,1,1" hotspot-label="Delta"/>',
    );
    expect(String(files["tests/t1.xml"])).toContain(
      '<qti-assessment-item-ref identifier="Q1" href="../items/q1.xml"/>',
    );

    // Only someone who may change the module takes its questions away.
    const pupil = await sessionFor("northwind", login("student"));
    expect(
      (
        await raw(
          "northwind",
          pupil.token,
          `/v1/modules/${moduleId}/questions.zip`,
        )
      ).status,
    ).toBe(404);
  });

  test("a module leaves as a Common Cartridge Moodle and Canvas read, kept whole beside", async () => {
    const common = {
      points: 3,
      hints: [],
      explanation: "Rivers rise.",
      tries: null,
    };
    const yes = crypto.randomUUID();
    const { teacher, moduleId } = await moduleAsking("Rivers for Moodle", [
      {
        id: crypto.randomUUID(),
        type: "content",
        content: plainContent("Rivers flood <every> spring."),
      },
      {
        ...common,
        id: crypto.randomUUID(),
        type: "choice",
        prompt: "The Nile floods each summer.",
        options: [
          { id: yes, text: "True", feedback: "" },
          { id: crypto.randomUUID(), text: "False", feedback: "" },
        ],
        correctOptionIds: [yes],
        multiple: false,
        shuffle: false,
      },
      {
        ...common,
        id: crypto.randomUUID(),
        type: "ordering",
        prompt: "Put the flood in order.",
        items: [
          { id: crypto.randomUUID(), text: "Rain" },
          { id: crypto.randomUUID(), text: "Flood" },
        ],
        scoring: "all",
      },
    ]);
    const response = await raw(
      "northwind",
      teacher.token,
      `/v1/modules/${moduleId}/cartridge.imscc`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      'filename="Rivers for Moodle.imscc"',
    );
    const files = await unzipped(response);
    expect(Object.keys(files).toSorted()).toEqual([
      "farida/lessons/1.json",
      "imsmanifest.xml",
      "l1/The-flood.html",
      "q1/assessment.xml",
    ]);
    const manifest = String(files["imsmanifest.xml"]);
    // Moodle finds a CC 1.1 package by its namespace in the first kilobyte.
    expect(
      manifest.slice(0, 1024).replaceAll(/[\s"]/g, "").toLowerCase(),
    ).toContain("xmlns=http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1");
    expect(manifest).toContain("<schemaversion>1.1.0</schemaversion>");
    expect(manifest).toContain(
      '<item identifier="item_l1" identifierref="l1"><title>The flood</title></item><item identifier="item_q1" identifierref="q1"><title>The flood: questions</title></item>',
    );
    expect(manifest).toContain(
      '<resource identifier="farida" type="associatedcontent/imscc_xmlv1p1/learning-application-resource"><metadata>',
    );
    expect(String(files["l1/The-flood.html"])).toContain(
      "<h1>The flood</h1><p>Rivers flood &lt;every&gt; spring.</p>",
    );
    const quiz = String(files["q1/assessment.xml"]);
    // True and false keep the idents Moodle requires; an order goes as an essay with its key.
    expect(quiz).toContain(
      "<fieldentry>cc.true_false.v0p1</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>cc_weighting</fieldlabel><fieldentry>3</fieldentry>",
    );
    expect(quiz).toContain('<varequal respident="response1">true</varequal>');
    expect(quiz).toContain("<fieldentry>cc.essay.v0p1</fieldentry>");
    expect(quiz).toContain('<itemfeedback ident="solution">');
    const kept = JSON.parse(String(files["farida/lessons/1.json"])) as {
      title: string;
      content: { root: { children: unknown[] } };
    };
    expect(kept.title).toBe("The flood");
    expect(kept.content.root.children.length).toBeGreaterThan(2);
  });

  test("a module's quizzes leave as Canvas writes its own, every kind it holds typed", async () => {
    const common = { points: 4, hints: [], explanation: "", tries: null };
    const gap = crypto.randomUUID();
    const { teacher, moduleId } = await moduleAsking("Rivers for Canvas", [
      {
        ...common,
        id: crypto.randomUUID(),
        type: "matching",
        prompt: "Match each river to its sea.",
        pairs: [
          { id: crypto.randomUUID(), prompt: "Nile", answer: "Mediterranean" },
          { id: crypto.randomUUID(), prompt: "Amazon", answer: "Atlantic" },
        ],
        distractors: [{ id: crypto.randomUUID(), text: "Arctic" }],
      },
      {
        ...common,
        id: crypto.randomUUID(),
        type: "number",
        prompt: "How long is the Nile, in thousands of kilometres?",
        mode: "range",
        value: 0,
        tolerance: 0,
        percent: false,
        min: 6,
        max: 7,
      },
      {
        ...common,
        id: crypto.randomUUID(),
        type: "gaps",
        prompt: "Fill the gap.",
        segments: [
          { type: "text", text: "The Nile flows " },
          { type: "gap", id: gap, answers: ["north"], options: [] },
        ],
        caseSensitive: false,
        closeEnough: false,
        tehMarbuta: true,
      },
    ]);
    const response = await raw(
      "northwind",
      teacher.token,
      `/v1/modules/${moduleId}/canvas-quizzes.zip`,
    );
    expect(response.status).toBe(200);
    const files = await unzipped(response);
    expect(Object.keys(files).toSorted()).toEqual([
      "imsmanifest.xml",
      "quiz_1/assessment_meta.xml",
      "quiz_1/quiz_1.xml",
    ]);
    const manifest = String(files["imsmanifest.xml"]);
    expect(manifest).toContain("<schema>IMS Content</schema>");
    expect(manifest).toContain(
      '<resource identifier="quiz_1" type="imsqti_xmlv1p2"><file href="quiz_1/quiz_1.xml"/><dependency identifierref="quiz_1_meta"/></resource>',
    );
    const quiz = String(files["quiz_1/quiz_1.xml"]);
    for (const type of [
      "matching_question",
      "numerical_question",
      "fill_in_multiple_blanks_question",
    ])
      expect(quiz).toContain(`<fieldentry>${type}</fieldentry>`);
    expect(quiz).toContain(
      "<fieldlabel>points_possible</fieldlabel><fieldentry>4</fieldentry>",
    );
    // Each pair earns its share; the range is a lower and an upper bound.
    expect(quiz).toContain(
      '<setvar action="Add" varname="SCORE">50.00</setvar>',
    );
    expect(quiz).toContain(
      '<vargte respident="response1">6</vargte><varlte respident="response1">7</varlte>',
    );
    expect(quiz).toContain("[blank1]");
    expect(String(files["quiz_1/assessment_meta.xml"])).toContain(
      "<points_possible>12</points_possible>",
    );
  });

  test("a class leaves for Canvas as a Common Cartridge 1.3, its coursework due when it was", async () => {
    const { session: teacher, classIds } = await teacherOfModule();
    const classId = classIds[0] ?? "";
    const due = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const essay = await teacher.api.coursework.save({
      classId,
      title: "River essay for Canvas",
      brief: plainContent("Argue why the Nile matters."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 20,
      rubric: null,
      dueAt: due,
    });
    const talk = await teacher.api.coursework.save({
      classId,
      title: "Talk about floods",
      brief: plainContent("Have you seen a flood?"),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "discussion",
      points: null,
      rubric: null,
      discussion: { postFirst: false, replies: 1 },
    });
    const tag = `rivers-${crypto.randomUUID().slice(0, 6)}`;
    for (const prompt of ["Is the Nile long?", "Is the Thames long?"]) {
      const yes = crypto.randomUUID();
      const content = contentOfLesson({
        version: 2,
        blocks: [
          {
            id: crypto.randomUUID(),
            type: "choice",
            prompt,
            points: 1,
            hints: [],
            explanation: "",
            tries: null,
            options: [
              { id: yes, text: "Yes", feedback: "" },
              { id: crypto.randomUUID(), text: "No", feedback: "" },
            ],
            correctOptionIds: [yes],
            multiple: false,
            shuffle: false,
          },
        ],
      });
      if (!content) throw new Error("no question");
      await teacher.api.bank.save({
        id: "",
        expectedVersion: 0,
        scope: "mine",
        tags: [tag],
        content,
      });
    }
    const drawn = await teacher.api.coursework.save({
      classId,
      title: "Drawn rivers quiz",
      brief: briefWithQuiz(plainContent("Answer one."), {
        version: 2,
        blocks: [
          { id: crypto.randomUUID(), type: "draw", tag, count: 1, points: 3 },
        ],
      }),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "quiz",
      points: null,
      rubric: null,
      quiz: { attempts: 1, keep: "highest", reveal: "answers", shuffle: false },
    });
    const response = await raw(
      "northwind",
      teacher.token,
      `/v1/classes/${classId}/course.imscc`,
    );
    expect(response.status).toBe(200);
    const files = await unzipped(response);
    const manifest = String(files["imsmanifest.xml"]);
    expect(manifest).toContain(
      'xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1"',
    );
    expect(manifest).toContain("<schemaversion>1.3.0</schemaversion>");
    // The class's modules come first, its coursework last.
    expect(manifest).toContain("<title>Reading stories together</title>");
    expect(manifest).toContain(
      '<item identifier="coursework"><title>Coursework</title>',
    );
    const names = Object.keys(files);
    const assignment = names.find(
      (name) =>
        name.endsWith("/assignment.xml") &&
        String(files[name]).includes("River essay for Canvas"),
    );
    if (!assignment) throw new Error("no assignment descriptor");
    const xml = String(files[assignment]);
    expect(xml).toContain('<gradable points_possible="20">true</gradable>');
    expect(xml).toContain(
      '<submission_formats><format type="html"/><format type="file"/></submission_formats>',
    );
    expect(xml).toContain(`<due_at>${due.slice(0, 19)}</due_at>`);
    expect(xml).toContain("Argue why the Nile matters.");
    const folder = assignment.split("/")[0] ?? "";
    expect(manifest).toContain(
      `<resource identifier="${folder}" type="assignment_xmlv1p0" href="${assignment}">`,
    );
    expect(manifest).toContain(
      `<cpx:variant identifier="${folder}_fallback_variant" identifierref="${folder}"><cpx:metadata/></cpx:variant>`,
    );
    expect(
      names.some(
        (name) =>
          name.endsWith("/topic.xml") &&
          String(files[name]).includes("Talk about floods"),
      ),
    ).toBe(true);
    // A draw asks its count from the pool, worth its own points; the pool
    // leaves beside it as a bank.
    const quizPath = names.find(
      (name) =>
        name.endsWith("/assessment.xml") &&
        String(files[name]).includes("Drawn rivers quiz"),
    );
    const quizXml = String(files[quizPath ?? ""]);
    expect(quizXml.match(/<item /g)).toHaveLength(1);
    expect(quizXml).toContain(
      "<fieldlabel>cc_weighting</fieldlabel><fieldentry>3</fieldentry>",
    );
    const bankPath = names.find(
      (name) => name.endsWith("/bank.xml") && String(files[name]).includes(tag),
    );
    const bankXml = String(files[bankPath ?? ""]);
    expect(bankXml).toContain("Is the Nile long?");
    expect(bankXml).toContain("Is the Thames long?");
    expect(manifest).toContain(
      `type="imsqti_xmlv1p2/imscc_xmlv1p3/question-bank"><file href="${bankPath}"/>`,
    );
    // Only a teacher of the class takes it away.
    const pupil = await sessionFor("northwind", login("student"));
    expect(
      (
        await raw(
          "northwind",
          pupil.token,
          `/v1/classes/${classId}/course.imscc`,
        )
      ).status,
    ).toBe(404);
    for (const saved of [essay, talk, drawn])
      await teacher.api.coursework.archive({
        id: saved.id,
        expectedVersion: saved.version,
      });
  });

  test("a class's results in a module leave as xAPI statements", async () => {
    const nile = crypto.randomUUID();
    const choiceId = crypto.randomUUID();
    const { teacher, moduleId, classIds, lessonId } = await moduleAsking(
      "Rivers for the record store",
      [
        {
          id: choiceId,
          points: 2,
          hints: [],
          explanation: "",
          tries: null,
          type: "choice",
          prompt: "Which river floods Egypt?",
          options: [
            { id: nile, text: "The Nile", feedback: "" },
            { id: crypto.randomUUID(), text: "The Thames", feedback: "" },
          ],
          correctOptionIds: [nile],
          multiple: false,
          shuffle: false,
        },
      ],
      true,
    );
    const pupil = await sessionFor("northwind", login("student"));
    const me = await pupil.api.identity.currentUser();
    await pupil.api.learning.respond({
      lessonId,
      blockId: choiceId,
      response: { type: "choice", optionIds: [nile] },
    });
    let statements: Record<string, unknown>[] = [];
    let classId = "";
    for (const each of classIds) {
      const response = await raw(
        "northwind",
        teacher.token,
        `/v1/modules/${moduleId}/statements.json?classId=${each}`,
      );
      expect(response.status).toBe(200);
      const read = (await response.json()) as Record<string, unknown>[];
      if (read.some((statement) => JSON.stringify(statement).includes(me.id))) {
        statements = read;
        classId = each;
      }
    }
    const answered = statements.find(
      (statement) =>
        (statement.verb as { id: string }).id ===
        "http://adlnet.gov/expapi/verbs/answered",
    );
    // Statements name the school's portal, where a person finds the lesson.
    const home = `https://northwind.${DOMAINS.portal}`;
    expect(answered).toMatchObject({
      actor: {
        objectType: "Agent",
        account: { homePage: home, name: me.id },
      },
      object: {
        id: `${home}/lessons/${lessonId}#${choiceId}`,
        definition: {
          type: "http://adlnet.gov/expapi/activities/cmi.interaction",
          interactionType: "choice",
        },
      },
      result: {
        score: { scaled: 1, raw: 2, min: 0, max: 2 },
        success: true,
        completion: true,
      },
      context: {
        platform: "Farida",
        contextActivities: {
          parent: [{ id: `${home}/lessons/${lessonId}` }],
          grouping: [
            { id: `${home}/modules/${moduleId}` },
            { id: `${home}/classes/${classId}` },
          ],
        },
      },
      version: "1.0.3",
    });
    expect(
      statements.some(
        (statement) =>
          (statement.object as { id: string }).id ===
            `${home}/lessons/${lessonId}` &&
          (statement.actor as { account: { name: string } }).account.name ===
            me.id,
      ),
    ).toBe(true);
    // The same records give the same statement ids, so a store takes them once.
    const again = (await (
      await raw(
        "northwind",
        teacher.token,
        `/v1/modules/${moduleId}/statements.json?classId=${classId}`,
      )
    ).json()) as { id: string }[];
    expect(again.map((statement) => statement.id)).toEqual(
      statements.map((statement) => String(statement.id)),
    );
    expect(
      (
        await raw(
          "northwind",
          pupil.token,
          `/v1/modules/${moduleId}/statements.json?classId=${classId}`,
        )
      ).status,
    ).toBe(404);
  });
});
