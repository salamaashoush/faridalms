import type { Cartridge } from "@faridalms/domain/cartridge-read";

import { describe, expect, it } from "vitest";

import { importBanks, importCartridge } from "./cartridgeImport";

const bytes = (text: string) => new TextEncoder().encode(text);

const quiz = `<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><assessment ident="q" title="Check"><section ident="s">
  <item ident="i1" title="Capital"><itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.multiple_choice.v0p1</fieldentry></qtimetadatafield>
  </qtimetadata></itemmetadata>
  <presentation><material><mattext texttype="text/plain">Capital of Egypt?</mattext></material>
    <response_lid ident="r" rcardinality="Single"><render_choice>
      <response_label ident="a"><material><mattext>Cairo</mattext></material></response_label>
      <response_label ident="b"><material><mattext>Giza</mattext></material></response_label>
    </render_choice></response_lid></presentation>
  <resprocessing><outcomes><decvar varname="SCORE" vartype="Decimal" maxvalue="100" minvalue="0"/></outcomes>
    <respcondition continue="No"><conditionvar><varequal respident="r">a</varequal></conditionvar><setvar varname="SCORE" action="Set">100</setvar></respcondition>
  </resprocessing></item>
</section></assessment></questestinterop>`;

describe("bringing a cartridge's course in", () => {
  it("keeps Canvas's module rules and sends assignments to each class as drafts", async () => {
    const files = new Map([
      ["wiki_content/read.html", bytes("<p>Read about the Nile.</p>")],
      ["wiki_content/done.html", bytes("<p>Say when you are done.</p>")],
      ["quiz1/assessment_qti.xml", bytes(quiz)],
    ]);
    const cartridge: Cartridge = {
      title: "Geography",
      banks: [],
      modules: [
        {
          title: "Week 1",
          items: [
            {
              kind: "page",
              title: "Read",
              path: "wiki_content/read.html",
              completion: { rule: "view" },
            },
          ],
        },
        {
          title: "Briefs",
          items: [
            {
              kind: "assignment",
              title: "Old essay",
              html: "<p>Argue.</p>",
              base: "a/assignment.xml",
              points: 20,
              dueAt: "2020-01-01T00:00:00.000Z",
              submission: "files",
            },
          ],
        },
        {
          title: "Week 2",
          sequential: true,
          prerequisites: [0, 1],
          items: [
            {
              kind: "quiz",
              title: "Check",
              path: "quiz1/assessment_qti.xml",
              completion: { rule: "score", percent: 80 },
            },
            {
              kind: "page",
              title: "Done?",
              path: "wiki_content/done.html",
              completion: { rule: "mark" },
            },
            {
              kind: "page",
              title: "Again",
              path: "wiki_content/read.html",
              completion: { rule: "submit" },
            },
          ],
        },
      ],
    };
    const modules: unknown[] = [];
    const lessons: unknown[] = [];
    const assignments: unknown[] = [];
    const result = await importCartridge(cartridge, [0, 1, 2], {
      files,
      classIds: ["class-a", "class-b"],
      toolIds: new Set(),
      uploadTo: () => () => Promise.reject(new Error("no files here")),
      saveModule: (module) => {
        modules.push(module);
        return Promise.resolve(`module-${modules.length}`);
      },
      saveLesson: (lesson) => {
        lessons.push({
          moduleId: lesson.moduleId,
          title: lesson.title,
          completion: lesson.completion,
          passScore: lesson.passScore,
        });
        return Promise.resolve();
      },
      saveAssignment: (assignment) => {
        assignments.push({
          classId: assignment.classId,
          title: assignment.title,
          points: assignment.points,
          dueAt: assignment.dueAt,
          submission: assignment.submission,
        });
        return Promise.resolve();
      },
      onProgress: () => undefined,
    });

    // A module of assignments alone makes no module of its own, so the
    // second module waits on the first.
    expect(modules).toEqual([
      { title: "Week 1", sequential: false, prerequisiteId: "" },
      { title: "Week 2", sequential: true, prerequisiteId: "module-1" },
    ]);
    expect(lessons).toEqual([
      {
        moduleId: "module-1",
        title: "Read",
        completion: "view",
        passScore: null,
      },
      {
        moduleId: "module-2",
        title: "Check",
        completion: "score",
        passScore: 80,
      },
      {
        moduleId: "module-2",
        title: "Done?",
        completion: "mark",
        passScore: null,
      },
      // Handing in a page that asks nothing is opening it.
      {
        moduleId: "module-2",
        title: "Again",
        completion: "view",
        passScore: null,
      },
    ]);
    // A due date already past stays with the course it came from.
    expect(assignments).toEqual(
      ["class-a", "class-b"].map((classId) => ({
        classId,
        title: "Old essay",
        points: 20,
        dueAt: "",
        submission: "files",
      })),
    );
    expect(result.counts).toEqual({
      lessons: 4,
      assignments: 1,
      check: 0,
      failed: 0,
    });
  });
});

describe("bringing a cartridge's question banks in", () => {
  it("keeps each question alone, tagged with its bank's name", async () => {
    const kept: { kind: string | undefined; tags: string[] }[] = [];
    const result = await importBanks(
      {
        title: "Geography",
        modules: [],
        banks: [{ title: "Rivers bank", path: "b/bank.xml" }],
      },
      {
        files: new Map([
          [
            "b/bank.xml",
            bytes(
              quiz
                .replace("<assessment", "<objectbank")
                .replace("</assessment>", "</objectbank>"),
            ),
          ],
        ]),
        upload: () => Promise.reject(new Error("no files here")),
        keep: (question) => {
          kept.push({
            kind: question.content.root.children?.[0]?.type,
            tags: question.tags,
          });
          return Promise.resolve();
        },
      },
    );
    expect(kept).toEqual([{ kind: "question", tags: ["Rivers bank"] }]);
    expect(result).toEqual({ kept: 1, check: 0 });
  });
});
