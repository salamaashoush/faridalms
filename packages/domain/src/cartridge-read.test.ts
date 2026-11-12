import { describe, expect, it } from "vitest";

import { CC13_TYPES, CC_TYPES, ccAssignment, ccManifest } from "./cartridge";
import { cartridgeFile, readCartridge } from "./cartridge-read";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("a Common Cartridge's course", () => {
  it("reads pages, quizzes and an outside tool's link in their module", () => {
    const files = new Map([
      [
        "imsmanifest.xml",
        bytes(
          ccManifest({
            identifier: "m",
            title: "Rivers",
            modules: [
              {
                identifier: "module_1",
                title: "Rivers",
                items: [
                  { identifier: "i1", title: "Floods", resource: "l1" },
                  {
                    identifier: "i2",
                    title: "Floods: questions",
                    resource: "q1",
                  },
                  { identifier: "i3", title: "Simulator", resource: "t1" },
                ],
              },
            ],
            resources: [
              {
                identifier: "l1",
                type: CC_TYPES.page,
                href: "l1/Floods.html",
                files: ["l1/Floods.html"],
              },
              {
                identifier: "q1",
                type: CC_TYPES.quiz,
                files: ["q1/assessment.xml"],
              },
              { identifier: "t1", type: CC_TYPES.tool, files: ["t1.xml"] },
            ],
          }),
        ),
      ],
      ["l1/Floods.html", bytes("<p>Floods</p>")],
      ["q1/assessment.xml", bytes("<questestinterop/>")],
      [
        "t1.xml",
        bytes(
          `<cartridge_basiclti_link xmlns="http://www.imsglobal.org/xsd/imslticc_v1p0" xmlns:blti="http://www.imsglobal.org/xsd/imsbasiclti_v1p0"><blti:title>Simulator</blti:title><blti:description>Rivers</blti:description><blti:launch_url>https://tool.example.com/launch</blti:launch_url></cartridge_basiclti_link>`,
        ),
      ],
    ]);
    expect(readCartridge(files)).toEqual({
      title: "Rivers",
      modules: [
        {
          title: "Rivers",
          items: [
            { kind: "page", title: "Floods", path: "l1/Floods.html" },
            {
              kind: "quiz",
              title: "Floods: questions",
              path: "q1/assessment.xml",
            },
            {
              kind: "tool",
              title: "Simulator",
              description: "Rivers",
              url: "https://tool.example.com/launch",
            },
          ],
        },
      ],
      banks: [],
    });
  });

  it("reads a Canvas export: its assignments, its full quizzes, and loose items", () => {
    const manifest = `<?xml version="1.0"?>
      <manifest identifier="x" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
        <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion>
          <lomimscc:lom xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest"><lomimscc:general><lomimscc:title><lomimscc:string>Geography 8</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom>
        </metadata>
        <organizations><organization identifier="org_1" structure="rooted-hierarchy"><item identifier="LearningModules">
          <item identifier="m1"><title>Week 1</title>
            <item identifier="h1"><title>Reading</title></item>
            <item identifier="a" identifierref="asg1"><title>Essay</title></item>
            <item identifier="b" identifierref="quiz1"><title>Check</title></item>
            <item identifier="c" identifierref="link1"><title>Video</title></item>
          </item>
          <item identifier="z" identifierref="file1"><title>Atlas</title></item>
        </item></organization></organizations>
        <resources>
          <resource identifier="asg1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="asg1/essay.html">
            <file href="asg1/essay.html"/><file href="asg1/assignment_settings.xml"/></resource>
          <resource identifier="quiz1" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"><file href="quiz1/assessment_qti.xml"/></resource>
          <resource identifier="link1" type="imswl_xmlv1p1"><file href="link1.xml"/></resource>
          <resource identifier="file1" type="webcontent" href="web_resources/atlas.pdf"><file href="web_resources/atlas.pdf"/></resource>
        </resources>
      </manifest>`;
    const files = new Map([
      ["imsmanifest.xml", bytes(manifest)],
      ["asg1/essay.html", bytes("<p>Write about rivers.</p>")],
      [
        "asg1/assignment_settings.xml",
        bytes(
          '<assignment xmlns="http://canvas.instructure.com/xsd/cccv1p0"><title>River essay</title><points_possible>20.0</points_possible></assignment>',
        ),
      ],
      ["quiz1/assessment_qti.xml", bytes("<questestinterop/>")],
      ["non_cc_assessments/quiz1.xml.qti", bytes("<questestinterop/>")],
      [
        "link1.xml",
        bytes(
          '<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imswl_v1p1"><title>Floods video</title><url href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/></webLink>',
        ),
      ],
      ["web_resources/atlas.pdf", bytes("%PDF-")],
    ]);
    expect(readCartridge(files)).toEqual({
      title: "Geography 8",
      modules: [
        {
          title: "Week 1",
          items: [
            {
              kind: "assignment",
              title: "River essay",
              html: "<p>Write about rivers.</p>",
              base: "asg1/essay.html",
              points: 20,
              dueAt: null,
              submission: "both",
            },
            {
              kind: "quiz",
              title: "Check",
              path: "non_cc_assessments/quiz1.xml.qti",
            },
            {
              kind: "link",
              title: "Floods video",
              url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            },
          ],
        },
        {
          title: "Geography 8",
          items: [
            { kind: "file", title: "Atlas", path: "web_resources/atlas.pdf" },
          ],
        },
      ],
      banks: [],
    });
  });

  it("reads Canvas's module rules and a CC 1.3 assignment's due date", () => {
    const manifest = `<?xml version="1.0"?>
      <manifest identifier="x" xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1">
        <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion></metadata>
        <organizations><organization identifier="org_1"><item identifier="LearningModules">
          <item identifier="g_m1"><title>Week 1</title>
            <item identifier="g_t1" identifierref="page1"><title>Read</title></item>
          </item>
          <item identifier="g_m2"><title>Week 2</title>
            <item identifier="g_t2" identifierref="quiz1"><title>Check</title></item>
            <item identifier="g_t3" identifierref="asg1"><title>Essay</title></item>
            <item identifier="g_t4" identifierref="page2"><title>Done?</title></item>
          </item>
        </item></organization></organizations>
        <resources>
          <resource identifier="page1" type="webcontent" href="wiki_content/read.html"><file href="wiki_content/read.html"/></resource>
          <resource identifier="page2" type="webcontent" href="wiki_content/done.html"><file href="wiki_content/done.html"/></resource>
          <resource identifier="quiz1" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment">
            <file href="quiz1/assessment_qti.xml"/><file href="quiz1/assessment_meta.xml"/></resource>
          <resource identifier="asg1" type="assignment_xmlv1p0" href="asg1/assignment.xml"><file href="asg1/assignment.xml"/></resource>
        </resources>
      </manifest>`;
    const meta = `<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
      <module identifier="g_m1"><title>Week 1</title><require_sequential_progress>false</require_sequential_progress>
        <completionRequirements><completionRequirement type="must_view"><identifierref>g_t1</identifierref></completionRequirement></completionRequirements>
      </module>
      <module identifier="g_m2"><title>Week 2</title><require_sequential_progress>true</require_sequential_progress>
        <prerequisites><prerequisite type="context_module"><title>Week 1</title><identifierref>g_m1</identifierref></prerequisite></prerequisites>
        <completionRequirements>
          <completionRequirement type="min_score"><min_score>8.0</min_score><identifierref>g_t2</identifierref></completionRequirement>
          <completionRequirement type="must_mark_done"><identifierref>g_t4</identifierref></completionRequirement>
        </completionRequirements>
      </module>
    </modules>`;
    const files = new Map([
      ["imsmanifest.xml", bytes(manifest)],
      ["course_settings/module_meta.xml", bytes(meta)],
      ["wiki_content/read.html", bytes("<p>Read</p>")],
      ["wiki_content/done.html", bytes("<p>Done</p>")],
      ["quiz1/assessment_qti.xml", bytes("<questestinterop/>")],
      [
        "quiz1/assessment_meta.xml",
        bytes(
          '<quiz xmlns="http://canvas.instructure.com/xsd/cccv1p0"><points_possible>10.0</points_possible></quiz>',
        ),
      ],
      [
        "asg1/assignment.xml",
        bytes(`<assignment identifier="asg1" xmlns="http://www.imsglobal.org/xsd/imscc_extensions/assignment">
          <title>Essay</title><text texttype="text/html">&lt;p&gt;Argue.&lt;/p&gt;</text>
          <gradable points_possible="20">true</gradable>
          <submission_formats><format type="html"/><format type="file"/></submission_formats>
          <extensions platform="canvas.instructure.com">
            <assignment xmlns="http://canvas.instructure.com/xsd/cccv1p0" identifier="asg1_canvas">
              <due_at>2026-11-01T21:59:00</due_at></assignment></extensions>
        </assignment>`),
      ],
    ]);
    expect(readCartridge(files)).toEqual({
      title: "Course",
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
          title: "Week 2",
          sequential: true,
          prerequisites: [0],
          items: [
            {
              kind: "quiz",
              title: "Check",
              path: "quiz1/assessment_qti.xml",
              completion: { rule: "score", percent: 80 },
            },
            {
              kind: "assignment",
              title: "Essay",
              html: "<p>Argue.</p>",
              base: "asg1/assignment.xml",
              points: 20,
              dueAt: "2026-11-01T21:59:00.000Z",
              submission: "both",
            },
            {
              kind: "page",
              title: "Done?",
              path: "wiki_content/done.html",
              completion: { rule: "mark" },
            },
          ],
        },
      ],
      banks: [],
    });
  });

  it("finds the course's question banks, CC's and Canvas's, apart from its quizzes", () => {
    const manifest = `<?xml version="1.0"?>
      <manifest identifier="x" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
        <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion></metadata>
        <organizations><organization identifier="org_1"><item identifier="root">
          <item identifier="m1"><title>Week 1</title>
            <item identifier="a" identifierref="quiz1"><title>Check</title></item>
          </item>
        </item></organization></organizations>
        <resources>
          <resource identifier="quiz1" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"><file href="quiz1/assessment_qti.xml"/></resource>
          <resource identifier="bank1" type="imsqti_xmlv1p2/imscc_xmlv1p1/question-bank"><file href="bank1/bank.xml"/></resource>
        </resources>
      </manifest>`;
    const qti = (body: string) =>
      bytes(
        `<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">${body}</questestinterop>`,
      );
    const files = new Map([
      ["imsmanifest.xml", bytes(manifest)],
      ["quiz1/assessment_qti.xml", qti('<assessment ident="q1"/>')],
      ["non_cc_assessments/quiz1.xml.qti", qti('<assessment ident="q1"/>')],
      ["bank1/bank.xml", qti('<objectbank ident="b1" title="Shared bank"/>')],
      [
        "non_cc_assessments/b2.xml.qti",
        qti(
          '<objectbank ident="b2"><qtimetadata><qtimetadatafield><fieldlabel>bank_title</fieldlabel><fieldentry>Rivers bank</fieldentry></qtimetadatafield></qtimetadata></objectbank>',
        ),
      ],
    ]);
    expect(readCartridge(files)?.banks).toEqual([
      { title: "Shared bank", path: "bank1/bank.xml" },
      { title: "Rivers bank", path: "non_cc_assessments/b2.xml.qti" },
    ]);
  });

  it("reads back the assignments this school sends Canvas in CC 1.3", () => {
    const files = new Map([
      [
        "imsmanifest.xml",
        bytes(
          ccManifest({
            identifier: "m",
            title: "8A",
            version: "1.3",
            modules: [
              {
                identifier: "coursework",
                title: "Coursework",
                items: [{ identifier: "i1", title: "Essay", resource: "c1" }],
              },
            ],
            resources: [
              {
                identifier: "c1",
                type: CC13_TYPES.assignment,
                href: "c1/assignment.xml",
                files: ["c1/assignment.xml"],
              },
              {
                identifier: "c1_fallback",
                type: CC13_TYPES.page,
                files: ["c1/Essay.html"],
                variantOf: "c1",
              },
            ],
          }),
        ),
      ],
      [
        "c1/assignment.xml",
        bytes(
          ccAssignment({
            identifier: "c1",
            title: "River essay",
            html: "<p>Argue.</p>",
            points: 20,
            dueAt: "2026-11-01T21:59:00.000Z",
            submission: "files",
          }),
        ),
      ],
      ["c1/Essay.html", bytes("<p>Argue.</p>")],
    ]);
    expect(readCartridge(files)?.modules).toEqual([
      {
        title: "Coursework",
        items: [
          {
            kind: "assignment",
            title: "River essay",
            html: "<p>Argue.</p>",
            base: "c1/assignment.xml",
            points: 20,
            dueAt: "2026-11-01T21:59:00.000Z",
            submission: "files",
          },
        ],
      },
    ]);
  });

  it("names Moodle's unnamed sections after the course", () => {
    const manifest = `<?xml version="1.0"?>
      <manifest identifier="x" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
        <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion>
          <lomimscc:lom xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest"><lomimscc:general><lomimscc:title><lomimscc:string>Rivers</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom>
        </metadata>
        <organizations><organization identifier="o" structure="rooted-hierarchy"><item identifier="root">
          <item identifier="s0"><title>0</title><item identifier="a" identifierref="r1"><title>News</title></item></item>
          <item identifier="s1"><title>1</title><item identifier="b" identifierref="r1"><title>Map</title></item></item>
        </item></organization></organizations>
        <resources><resource identifier="r1" type="imswl_xmlv1p1"><file href="r1.xml"/></resource></resources>
      </manifest>`;
    const files = new Map([
      ["imsmanifest.xml", bytes(manifest)],
      [
        "r1.xml",
        bytes(
          '<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imswl_v1p1"><title>Map</title><url href="https://example.com/nile"/></webLink>',
        ),
      ],
    ]);
    expect(readCartridge(files)?.modules.map((module) => module.title)).toEqual(
      ["Rivers", "Rivers 1"],
    );
  });

  it("finds a link's file the ways Moodle and Canvas write them", () => {
    const files = new Set([
      "web_resources/Uploaded Media/map.png",
      "i_12/files/img.png",
      "web_resources/a.png",
    ]);
    expect(
      cartridgeFile(
        files,
        "q1/assessment.xml",
        "$IMS-CC-FILEBASE$../web_resources/a.png",
      ),
    ).toBe("web_resources/a.png");
    expect(
      cartridgeFile(
        files,
        "wiki_content/page.html",
        "$IMS-CC-FILEBASE$/Uploaded%20Media/map.png",
      ),
    ).toBe("web_resources/Uploaded Media/map.png");
    expect(
      cartridgeFile(files, "i_34/page.html", "../i_12/files/img.png"),
    ).toBe("i_12/files/img.png");
    expect(
      cartridgeFile(files, "i_34/page.html", "https://example.com/a.png"),
    ).toBeNull();
    expect(
      readCartridge(
        new Map([
          [
            "imsmanifest.xml",
            bytes(
              "<manifest><metadata><schema>QTI Package</schema></metadata></manifest>",
            ),
          ],
        ]),
      ),
    ).toBeNull();
  });
});
