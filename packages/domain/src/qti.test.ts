import { describe, expect, it } from "vitest";

import type { LessonBlock } from "./learning";

import { qtiItem, qtiManifest, qtiPictures } from "./qti";
import { qtiItemPictures, qtiManifestOf, questionOfQti } from "./qti-read";

const PICTURE = "11111111-1111-4111-8111-111111111111";
const common = {
  id: "22222222-2222-4222-8222-222222222222",
  points: 4,
  hints: ["Look at the map."],
  explanation: "The Nile floods in summer.",
  tries: null,
};
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A question written as QTI and read back, as another system would hand it over. */
function roundTrip(block: LessonBlock) {
  const xml = qtiItem(block, {
    identifier: "Q1",
    title: "Question",
    picture: (fileId) =>
      fileId === PICTURE
        ? { href: "../media/map.png", width: 800, height: 400 }
        : null,
  });
  if (!xml) throw new Error("not written");
  const item = new DOMParser().parseFromString(
    xml,
    "application/xml",
  ).documentElement;
  expect(qtiItemPictures(item)).toEqual(
    qtiPictures(block).length ? ["../media/map.png"] : [],
  );
  const read = questionOfQti(item, {
    picture: (src) =>
      src === "../media/map.png"
        ? { fileId: PICTURE, width: 800, height: 400 }
        : null,
  });
  if (!read) throw new Error("not read");
  return read;
}

describe("questions as QTI 3 and back", () => {
  it("keeps a choice's options, key, feedback, hints and explanation", () => {
    const { block, note } = roundTrip({
      ...common,
      type: "choice",
      prompt: "Which river floods Egypt?",
      options: [
        { id: uuid(1), text: "The Nile", feedback: "" },
        { id: uuid(2), text: "The Thames", feedback: "That is in England." },
      ],
      correctOptionIds: [uuid(1)],
      multiple: false,
      shuffle: true,
    });
    expect(note).toBeUndefined();
    expect(block).toMatchObject({
      type: "choice",
      prompt: "Which river floods Egypt?",
      points: 4,
      hints: ["Look at the map."],
      explanation: "The Nile floods in summer.",
      multiple: false,
      shuffle: true,
      options: [
        { text: "The Nile", feedback: "" },
        { text: "The Thames", feedback: "That is in England." },
      ],
    });
    if (block.type !== "choice") throw new Error("kind");
    expect(block.correctOptionIds).toEqual([block.options[0]?.id]);
  });

  it("keeps a poll as a poll, and Arabic as it reads", () => {
    const { block } = roundTrip({
      ...common,
      points: 0,
      type: "poll",
      prompt: "أي فصل تحب؟",
      options: [
        { id: uuid(1), text: "الصيف", feedback: "" },
        { id: uuid(2), text: "الشتاء", feedback: "" },
      ],
      multiple: false,
      classResults: true,
    });
    expect(block).toMatchObject({
      type: "poll",
      prompt: "أي فصل تحب؟",
      classResults: true,
    });
  });

  it("keeps typed answers, numbers with tolerance and ranges", () => {
    expect(
      roundTrip({
        ...common,
        type: "text",
        prompt: "Name the capital.",
        answers: ["Cairo", "al-Qahira"],
        caseSensitive: true,
        closeEnough: true,
        tehMarbuta: false,
      }).block,
    ).toMatchObject({
      type: "text",
      answers: ["Cairo", "al-Qahira"],
      caseSensitive: true,
      closeEnough: true,
    });
    expect(
      roundTrip({
        ...common,
        type: "number",
        prompt: "g in m/s²?",
        mode: "exact",
        value: 9.81,
        tolerance: 5,
        percent: true,
        min: 0,
        max: 0,
      }).block,
    ).toMatchObject({
      type: "number",
      mode: "exact",
      value: 9.81,
      tolerance: 5,
      percent: true,
    });
    expect(
      roundTrip({
        ...common,
        type: "number",
        prompt: "A number from 3 to 7.",
        mode: "range",
        value: 0,
        tolerance: 0,
        percent: false,
        min: 3,
        max: 7,
      }).block,
    ).toMatchObject({ type: "number", mode: "range", min: 3, max: 7 });
  });

  it("keeps gaps typed, chosen and from a bank", () => {
    const typed = roundTrip({
      ...common,
      type: "gaps",
      prompt: "Fill in the gaps.",
      segments: [
        { type: "text", text: "The " },
        { type: "gap", id: uuid(1), answers: ["Nile"], options: [] },
        { type: "text", text: " floods in " },
        {
          type: "gap",
          id: uuid(2),
          answers: ["summer"],
          options: ["summer", "winter"],
        },
        { type: "text", text: "." },
      ],
      caseSensitive: false,
      closeEnough: false,
      tehMarbuta: false,
    }).block;
    expect(typed).toMatchObject({
      type: "gaps",
      prompt: "Fill in the gaps.",
      segments: [
        { type: "text", text: "The " },
        { type: "gap", answers: ["Nile"], options: [] },
        { type: "text", text: " floods in " },
        { type: "gap", answers: ["summer"], options: ["summer", "winter"] },
        { type: "text", text: "." },
      ],
    });
    const banked = roundTrip({
      ...common,
      type: "gaps",
      prompt: "Drag the words.",
      segments: [
        { type: "text", text: "Rain falls in " },
        { type: "gap", id: uuid(1), answers: ["winter"], options: [] },
      ],
      caseSensitive: false,
      closeEnough: false,
      tehMarbuta: false,
      bank: ["summer"],
    }).block;
    expect(banked).toMatchObject({
      type: "gaps",
      bank: ["summer"],
      segments: [
        { type: "text", text: "Rain falls in " },
        { type: "gap", answers: ["winter"] },
      ],
    });
  });

  it("keeps words to find, pairs, groups and orders", () => {
    expect(
      roundTrip({
        ...common,
        type: "highlight",
        prompt: "Find the verbs.",
        segments: [
          { type: "text", text: "The river " },
          { type: "target", id: uuid(1), text: "rose" },
          { type: "text", text: " and " },
          { type: "target", id: uuid(2), text: "flooded" },
        ],
      }).block,
    ).toMatchObject({
      type: "highlight",
      segments: [
        { type: "text", text: "The river " },
        { type: "target", text: "rose" },
        { type: "text", text: " and " },
        { type: "target", text: "flooded" },
      ],
    });
    expect(
      roundTrip({
        ...common,
        type: "matching",
        prompt: "Match each river to its country.",
        pairs: [
          { id: uuid(1), prompt: "Nile", answer: "Egypt" },
          { id: uuid(2), prompt: "Seine", answer: "France" },
        ],
        distractors: [{ id: uuid(3), text: "Peru" }],
      }).block,
    ).toMatchObject({
      type: "matching",
      pairs: [
        { prompt: "Nile", answer: "Egypt" },
        { prompt: "Seine", answer: "France" },
      ],
      distractors: [{ text: "Peru" }],
    });
    const sorted = roundTrip({
      ...common,
      type: "sorting",
      prompt: "Sort the animals.",
      groups: [
        { id: uuid(1), name: "Land" },
        { id: uuid(2), name: "Sea" },
      ],
      items: [
        { id: uuid(3), text: "Camel", groupId: uuid(1) },
        { id: uuid(4), text: "Whale", groupId: uuid(2) },
        { id: uuid(5), text: "Goat", groupId: uuid(1) },
      ],
    }).block;
    if (sorted.type !== "sorting") throw new Error("kind");
    const group = (name: string) =>
      sorted.groups.find((each) => each.name === name)?.id;
    expect(sorted.items.map((each) => [each.text, each.groupId])).toEqual([
      ["Camel", group("Land")],
      ["Whale", group("Sea")],
      ["Goat", group("Land")],
    ]);
    expect(
      roundTrip({
        ...common,
        type: "ordering",
        prompt: "Order the steps.",
        items: [
          { id: uuid(1), text: "Rain" },
          { id: uuid(2), text: "River rises" },
          { id: uuid(3), text: "Flood" },
        ],
        scoring: "neighbours",
      }).block,
    ).toMatchObject({
      type: "ordering",
      scoring: "neighbours",
      items: [{ text: "Rain" }, { text: "River rises" }, { text: "Flood" }],
    });
  });

  it("keeps places on a picture, and written answers with their limit", () => {
    const spots = roundTrip({
      ...common,
      type: "hotspot",
      prompt: "Find the delta.",
      picture: { fileId: PICTURE, alt: "Egypt" },
      places: [
        { box: [0.5, 0.25, 0.25, 0.25], name: "Delta", correct: true },
        { box: [0, 0, 0.125, 0.25], name: "Desert", correct: false },
      ],
    }).block;
    expect(spots).toMatchObject({
      type: "hotspot",
      picture: { fileId: PICTURE, alt: "Egypt" },
      places: [
        { box: [0.5, 0.25, 0.25, 0.25], name: "Delta", correct: true },
        { box: [0, 0, 0.125, 0.25], name: "Desert", correct: false },
      ],
    });
    expect(
      roundTrip({
        ...common,
        type: "labelling",
        prompt: "Label the map.",
        picture: { fileId: PICTURE, alt: "Egypt" },
        places: [{ box: [0.5, 0.25, 0.25, 0.25], name: "Cairo" }],
        extras: ["Aswan"],
      }).block,
    ).toMatchObject({
      type: "labelling",
      places: [{ box: [0.5, 0.25, 0.25, 0.25], name: "Cairo" }],
      extras: ["Aswan"],
    });
    expect(
      roundTrip({
        ...common,
        type: "written",
        prompt: "Why do rivers flood?",
        wordLimit: 120,
      }).block,
    ).toMatchObject({
      type: "written",
      prompt: "Why do rivers flood?",
      wordLimit: 120,
    });
  });

  it("reads a QTI 2.1 item, and a manifest's items and tests", () => {
    const item = new DOMParser().parseFromString(
      `<assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1" identifier="choice" title="Unattended Luggage" adaptive="false" timeDependent="false">
        <responseDeclaration identifier="RESPONSE" cardinality="single" baseType="identifier">
          <correctResponse><value>ChoiceA</value></correctResponse>
        </responseDeclaration>
        <outcomeDeclaration identifier="SCORE" cardinality="single" baseType="float"/>
        <itemBody>
          <p>Look at the text in the picture.</p>
          <choiceInteraction responseIdentifier="RESPONSE" shuffle="false" maxChoices="1">
            <prompt>What does it say?</prompt>
            <simpleChoice identifier="ChoiceA">You must stay with your luggage at all times.</simpleChoice>
            <simpleChoice identifier="ChoiceB">Do not let someone else look after your luggage.</simpleChoice>
          </choiceInteraction>
        </itemBody>
        <responseProcessing template="http://www.imsglobal.org/question/qti_v2p1/rptemplates/match_correct"/>
      </assessmentItem>`,
      "application/xml",
    ).documentElement;
    const read = questionOfQti(item, { picture: () => null });
    expect(read?.block).toMatchObject({
      type: "choice",
      prompt: "What does it say?",
      points: 1,
      options: [
        { text: "You must stay with your luggage at all times." },
        { text: "Do not let someone else look after your luggage." },
      ],
    });
    const manifest = new DOMParser().parseFromString(
      qtiManifest({
        identifier: "M1",
        items: [{ identifier: "Q1", href: "items/q1.xml", media: [] }],
        tests: [{ identifier: "T1", href: "tests/t1.xml", items: ["Q1"] }],
        media: [],
      }),
      "application/xml",
    );
    expect(qtiManifestOf(manifest)).toEqual({
      items: [{ identifier: "Q1", href: "items/q1.xml" }],
      tests: [{ identifier: "T1", href: "tests/t1.xml" }],
    });
  });
});
