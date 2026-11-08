import { describe, expect, it } from "vitest";

import type { ReturnPupil } from "./eyfsp";
import type { GoalLevel } from "./standards";

import { EYFS_GOALS, EYFS_RETURN_CODES } from "./early-goals";
import { ctfVersion, eyfspReturn, returnFileName, returnGaps } from "./eyfsp";

const goals = EYFS_GOALS.items.filter((item) => item.parentIdentifier);
const speaking = goals.find((item) => item.statement === "Speaking");
const writing = goals.find((item) => item.statement === "Writing");

const school = {
  la: "801",
  estab: "2000",
  urn: "654321",
  name: "Acme & Co Primary",
  academicYear: 2025,
};

function pupil(levels: Iterable<[string, GoalLevel]>): ReturnPupil {
  return {
    upn: "B801200005001",
    surname: "Ashoush",
    forename: "Salama",
    dob: "2020-11-13",
    sex: "F",
    levels: new Map(levels),
  };
}

describe("the EYFS profile return", () => {
  it("codes every one of the seventeen goals, each with its own component", () => {
    expect(Object.keys(EYFS_RETURN_CODES)).toHaveLength(17);
    expect(goals).toHaveLength(17);
    for (const goal of goals)
      expect(EYFS_RETURN_CODES[goal.identifier]).toBeDefined();
    expect(EYFS_RETURN_CODES[speaking?.identifier ?? ""]).toEqual({
      subject: "COM",
      component: "E02",
    });
    expect(
      new Set(Object.values(EYFS_RETURN_CODES).map((row) => row.component))
        .size,
    ).toBe(17);
  });

  it("writes a child's results as the transfer file's stage assessments", () => {
    const levels = goals.map((goal): [string, GoalLevel] => [
      goal.identifier,
      goal === writing ? "exempt" : goal === speaking ? "emerging" : "expected",
    ]);
    const file = eyfspReturn({
      school,
      year: 2026,
      at: "2026-06-26T10:00:00.000Z",
      pupils: [pupil(levels)],
    });
    expect(file).toContain("<CTFversion>25.0</CTFversion>");
    expect(file).toContain("<DateTime>2026-06-26T10:00:00</DateTime>");
    expect(file).toContain("<DocumentQualifier>partial</DocumentQualifier>");
    expect(file).toContain("<SchoolName>Acme &amp; Co Primary</SchoolName>");
    expect(file).toContain(
      "<DestSchool>\n      <LEA>801</LEA>\n      <Estab>LLLL</Estab>",
    );
    expect(file.match(/<StageAssessment>/g)).toHaveLength(17);
    expect(file).toContain(
      [
        "<Locale>ENG</Locale>",
        "<Year>2026</Year>",
        "<Subject>COM</Subject>",
        "<Method>FA</Method>",
        "<Component>E02</Component>",
        "<ResultStatus>R</ResultStatus>",
        "<ResultQualifier>FD</ResultQualifier>",
        "<Result>1</Result>",
      ].join("\n            "),
    );
    expect(file).toMatch(/<Component>E10<\/Component>[\s\S]*?<Result>A</);
    expect(file.indexOf("E01")).toBeLessThan(file.indexOf("E17"));
  });

  it("says what keeps a child's return from being accepted", () => {
    const complete = goals.map((goal): [string, GoalLevel] => [
      goal.identifier,
      "expected",
    ]);
    expect(returnGaps(pupil(complete))).toEqual([]);
    expect(
      returnGaps({
        ...pupil(complete.slice(1)),
        upn: null,
        dob: null,
      }),
    ).toEqual(["upn", "dob", "results"]);
    expect(returnGaps({ ...pupil(complete), upn: "1234" })).toEqual(["upn"]);
  });

  it("names the file and the CTF release as the specifications do", () => {
    expect(returnFileName(school)).toBe("8012000_FSP_801LLLL_001.xml");
    expect(ctfVersion(2026)).toBe("25.0");
    expect(ctfVersion(2027)).toBe("26.1");
  });
});
