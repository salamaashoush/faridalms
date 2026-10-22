import { describe, expect, it } from "vitest";

import type { LessonBlock } from "./learning";

import { ccItem, plainFileName } from "./cartridge";

const common = { points: 2, hints: [], explanation: "", tries: null };
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const item = (block: LessonBlock) =>
  ccItem(block, { ident: "q1", picture: () => null }) ?? "";

describe("questions in a Common Cartridge", () => {
  it("marks every right answer of a multiple response as Moodle reads it", () => {
    const xml = item({
      ...common,
      id: id(9),
      type: "choice",
      prompt: "Which are rivers?",
      options: [
        { id: id(1), text: "Nile", feedback: "" },
        { id: id(2), text: "Sahara", feedback: "" },
        { id: id(3), text: "Seine", feedback: "" },
      ],
      correctOptionIds: [id(1), id(3)],
      multiple: true,
      shuffle: false,
    });
    expect(xml).toContain("cc.multiple_response.v0p1");
    expect(xml).toContain(
      '<and><varequal case="Yes" respident="response1">a1</varequal><not><varequal case="Yes" respident="response1">a2</varequal></not><varequal case="Yes" respident="response1">a3</varequal></and>',
    );
  });

  it("lists typed answers side by side, and weighs a poll at nothing", () => {
    expect(
      item({
        ...common,
        id: id(9),
        type: "text",
        prompt: "Capital of Egypt?",
        answers: ["Cairo", "al-Qahira"],
        caseSensitive: false,
        closeEnough: false,
        tehMarbuta: false,
      }),
    ).toContain(
      '<conditionvar><varequal case="No" respident="response1">Cairo</varequal><varequal case="No" respident="response1">al-Qahira</varequal></conditionvar>',
    );
    expect(
      item({
        ...common,
        points: 0,
        id: id(9),
        type: "poll",
        prompt: "Which season?",
        options: [
          { id: id(1), text: "Summer", feedback: "" },
          { id: id(2), text: "Winter", feedback: "" },
        ],
        multiple: false,
        classResults: false,
      }),
    ).toContain(
      "<fieldlabel>cc_weighting</fieldlabel><fieldentry>0</fieldentry>",
    );
  });

  it("gives Arabic true and false the idents Moodle requires", () => {
    const xml = item({
      ...common,
      id: id(9),
      type: "choice",
      prompt: "النيل في مصر.",
      options: [
        { id: id(1), text: "صواب", feedback: "" },
        { id: id(2), text: "خطأ", feedback: "" },
      ],
      correctOptionIds: [id(1)],
      multiple: false,
      shuffle: false,
    });
    expect(xml).toContain("cc.true_false.v0p1");
    expect(xml).toContain('<response_label ident="true">');
    expect(xml).toContain('xml:lang="ar"');
  });

  it("names files plainly for every LMS", () => {
    expect(plainFileName("خريطة النيل.PNG", "file")).toBe("file.png");
    expect(plainFileName("River map (2).png", "file")).toBe(
      "River-map-2-.png".replace("-.", "."),
    );
  });
});
