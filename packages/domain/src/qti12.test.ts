import { describe, expect, it } from "vitest";

import type { LessonBlock } from "./learning";

import { ccAssessment, ccItem } from "./cartridge";
import { qti12Items, qti12Title, questionOfQti12 } from "./qti12";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const common = {
  points: 3,
  hints: [],
  explanation: "Rivers rise.",
  tries: null,
};
const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, "application/xml");
const read = (xml: string) =>
  qti12Items(parse(xml)).map(
    (item) => questionOfQti12(item, { picture: () => null })?.block,
  );

/** Canvas's item metadata, its question type and points. */
const meta = (type: string) =>
  `<itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>${type}</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>2.0</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>`;
const text = (words: string) =>
  `<material><mattext texttype="text/html">&lt;div&gt;&lt;p&gt;${words}&lt;/p&gt;&lt;/div&gt;</mattext></material>`;
const label = (ident: string, words: string) =>
  `<response_label ident="${ident}"><material><mattext texttype="text/plain">${words}</mattext></material></response_label>`;

describe("questions from QTI 1.2", () => {
  it("reads back what a cartridge writes in CC's profile", () => {
    const blocks: LessonBlock[] = [
      {
        ...common,
        id: id(9),
        type: "choice",
        prompt: "Which river floods Egypt?",
        options: [
          { id: id(1), text: "Nile", feedback: "" },
          { id: id(2), text: "Thames", feedback: "In England." },
          { id: id(3), text: "Seine", feedback: "" },
        ],
        correctOptionIds: [id(1)],
        multiple: false,
        shuffle: true,
      },
      {
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
      },
      {
        ...common,
        id: id(9),
        type: "text",
        prompt: "Capital of Egypt?",
        answers: ["Cairo", "al-Qahira"],
        caseSensitive: false,
        closeEnough: false,
        tehMarbuta: false,
      },
      {
        ...common,
        id: id(9),
        type: "written",
        prompt: "Why do rivers flood?",
        wordLimit: null,
      },
    ];
    const xml = ccAssessment({
      ident: "quiz",
      title: "Floods: questions",
      items: blocks.map(
        (block, index) =>
          ccItem(block, { ident: `q${index}`, picture: () => null }) ?? "",
      ),
    });
    expect(qti12Title(parse(xml))).toBe("Floods: questions");
    const [single, multiple, typed, written] = read(xml);
    expect(single).toMatchObject({
      type: "choice",
      prompt: "Which river floods Egypt?",
      points: 3,
      explanation: "Rivers rise.",
      multiple: false,
      shuffle: true,
      options: [
        { text: "Nile", feedback: "" },
        { text: "Thames", feedback: "In England." },
        { text: "Seine" },
      ],
    });
    if (single?.type !== "choice" || multiple?.type !== "choice")
      throw new Error("kind");
    expect(single.correctOptionIds).toEqual([single.options[0]?.id]);
    expect(multiple.correctOptionIds).toEqual([
      multiple.options[0]?.id,
      multiple.options[2]?.id,
    ]);
    expect(typed).toMatchObject({
      type: "text",
      answers: ["Cairo", "al-Qahira"],
      caseSensitive: false,
    });
    expect(written).toMatchObject({
      type: "written",
      prompt: "Why do rivers flood?",
    });
  });

  it("reads Canvas's matching, blanks, dropdowns, numbers and reading", () => {
    const xml = `<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><assessment ident="a" title="Rivers"><section ident="root_section">
      <item ident="m" title="Match">${meta("matching_question")}<presentation>${text("Match each river.")}
        <response_lid ident="response_1"><material><mattext>Nile</mattext></material><render_choice>${label("10", "Egypt")}${label("11", "France")}${label("12", "Peru")}</render_choice></response_lid>
        <response_lid ident="response_2"><material><mattext>Seine</mattext></material><render_choice>${label("10", "Egypt")}${label("11", "France")}${label("12", "Peru")}</render_choice></response_lid>
      </presentation><resprocessing><outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
        <respcondition><conditionvar><varequal respident="response_1">10</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>
        <respcondition><conditionvar><varequal respident="response_2">11</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>
      </resprocessing></item>
      <item ident="f" title="Fill in">${meta("fill_in_multiple_blanks_question")}<presentation>${text("The [river] floods in [season].")}
        <response_lid ident="response_river"><material><mattext>river</mattext></material><render_choice>${label("20", "Nile")}${label("21", "nile")}</render_choice></response_lid>
        <response_lid ident="response_season"><material><mattext>season</mattext></material><render_choice>${label("22", "summer")}</render_choice></response_lid>
      </presentation><resprocessing><outcomes><decvar/></outcomes>
        <respcondition><conditionvar><varequal respident="response_river">20</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>
        <respcondition><conditionvar><varequal respident="response_season">22</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>
      </resprocessing></item>
      <item ident="d" title="Choose">${meta("multiple_dropdowns_question")}<presentation>${text("Rain falls in [when].")}
        <response_lid ident="response_when"><material><mattext>when</mattext></material><render_choice>${label("30", "winter")}${label("31", "summer")}</render_choice></response_lid>
      </presentation><resprocessing><outcomes><decvar/></outcomes>
        <respcondition><conditionvar><varequal respident="response_when">30</varequal></conditionvar><setvar varname="SCORE" action="Add">100.00</setvar></respcondition>
      </resprocessing></item>
      <item ident="n" title="Number">${meta("numerical_question")}<presentation>${text("How many metres?")}<response_str ident="response1" rcardinality="Single"><render_fib fibtype="Decimal"><response_label ident="answer1"/></render_fib></response_str></presentation>
        <resprocessing><outcomes><decvar/></outcomes><respcondition continue="No"><conditionvar><or><varequal respident="response1">2.0</varequal><and><vargte respident="response1">1.5</vargte><varlte respident="response1">2.5</varlte></and></or></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing></item>
      <item ident="t" title="Read">${meta("text_only_question")}<presentation>${text("Read the passage first.")}</presentation></item>
    </section></assessment></questestinterop>`;
    const [matching, blanks, dropdowns, numeric, reading] = read(xml);
    expect(matching).toMatchObject({
      type: "matching",
      points: 2,
      prompt: "Match each river.",
      pairs: [
        { prompt: "Nile", answer: "Egypt" },
        { prompt: "Seine", answer: "France" },
      ],
      distractors: [{ text: "Peru" }],
    });
    expect(blanks).toMatchObject({
      type: "gaps",
      segments: [
        { type: "text", text: "The " },
        { type: "gap", answers: ["Nile"], options: [] },
        { type: "text", text: " floods in " },
        { type: "gap", answers: ["summer"], options: [] },
        { type: "text", text: "." },
      ],
    });
    expect(dropdowns).toMatchObject({
      type: "gaps",
      segments: [
        { type: "text", text: "Rain falls in " },
        { type: "gap", answers: ["winter"], options: ["winter", "summer"] },
        { type: "text", text: "." },
      ],
    });
    expect(numeric).toMatchObject({
      type: "number",
      mode: "exact",
      value: 2,
      tolerance: 0.5,
    });
    expect(reading).toMatchObject({ type: "content" });
  });
});
