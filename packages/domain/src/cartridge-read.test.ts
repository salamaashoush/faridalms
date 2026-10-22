import { describe, expect, it } from "vitest";

import { CC_TYPES, ccManifest, ccToolLink } from "./cartridge";
import { cartridgeFile, readCartridge } from "./cartridge-read";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("a Common Cartridge's course", () => {
  it("reads what this school exports: pages, quizzes and tool links in their module", () => {
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
          ccToolLink({
            title: "Simulator",
            description: "Rivers",
            url: "https://tool.example.com/launch",
            custom: {},
          }),
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
    });
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
