import type { GoalLevel } from "./standards";

import { EYFS_RETURN_CODES } from "./early-goals";

/**
 * The end-of-year EYFS profile return as a school gives it to its local
 * authority: a partial Common Transfer File of early years data, each
 * child's seventeen goals as stage assessments. Built from the shapes the
 * Department for Education publishes: the CTF 25 and 26 specifications
 * (header, pupil and StageAssessment elements), the A_comp 2026 component
 * file (each goal's subject, component and result codes) and the EYFSP 2026
 * technical specification's rules (method FA, qualifier FD, all seventeen
 * results once each).
 */

/** A goal's result as the return codes it: 1 emerging, 2 expected, A exemption applies. */
export const RETURN_RESULT: Readonly<Record<GoalLevel, "1" | "2" | "A">> = {
  emerging: "1",
  expected: "2",
  exempt: "A",
};

export interface ReturnSchool {
  la: string;
  estab: string;
  urn: string;
  name: string;
  /** The year the school year starts in. */
  academicYear: number;
}

export interface ReturnPupil {
  upn: string | null;
  surname: string | null;
  forename: string | null;
  /** As YYYY-MM-DD. */
  dob: string | null;
  sex: "F" | "M" | "U";
  /** Each goal judged, by its EYFS identifier. */
  levels: ReadonlyMap<string, GoalLevel>;
}

/** What a child's record lacks for the local authority to accept their return. */
export type ReturnGap = "upn" | "surname" | "forename" | "dob" | "results";

const UPN = /^[A-Z0-9]{13}$/;

export function returnGaps(pupil: ReturnPupil): ReturnGap[] {
  const gaps: ReturnGap[] = [];
  if (!pupil.upn || !UPN.test(pupil.upn)) gaps.push("upn");
  if (!pupil.surname) gaps.push("surname");
  if (!pupil.forename) gaps.push("forename");
  if (!pupil.dob) gaps.push("dob");
  if (Object.keys(EYFS_RETURN_CODES).some((goal) => !pupil.levels.has(goal)))
    gaps.push("results");
  return gaps;
}

/**
 * The CTF release school systems carry for a summer's profile: CTF 25 for
 * 2026, CTF 26 from 2027, the latest published for any year after.
 */
export const ctfVersion = (year: number) => (year <= 2026 ? "25.0" : "26.1");

/** The name the CTF specification gives an early years transfer to the local authority. */
export const returnFileName = (school: Pick<ReturnSchool, "la" | "estab">) =>
  `${school.la}${school.estab}_FSP_${school.la}LLLL_001.xml`;

const escaped = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const element = (name: string, value: string | null, depth: number) =>
  value === null || value === ""
    ? []
    : [`${"  ".repeat(depth)}<${name}>${escaped(value)}</${name}>`];

/**
 * The file itself. Every child goes in with what their record holds; one
 * with a gap goes in all the same, as the school may complete it in its
 * own system before the transfer, and `returnGaps` says what is missing.
 */
export function eyfspReturn(input: {
  school: ReturnSchool;
  /** The calendar year the profile was completed in. */
  year: number;
  /** When the file was made, as an ISO instant. */
  at: string;
  pupils: readonly ReturnPupil[];
}): string {
  const { school } = input;
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<CTfile>`,
    `  <Header>`,
    ...element("DocumentName", "Common Transfer File", 2),
    ...element("CTFversion", ctfVersion(input.year), 2),
    ...element("DateTime", input.at.slice(0, 19), 2),
    ...element("DocumentQualifier", "partial", 2),
    ...element("DataQualifier", "FSP", 2),
    ...element("DataDescriptor", "EYFS profile return", 2),
    ...element("SupplierID", "Farida LMS", 2),
    `    <SourceSchool>`,
    ...element("LEA", school.la, 3),
    ...element("Estab", school.estab, 3),
    ...element("URN", school.urn, 3),
    ...element("SchoolName", school.name, 3),
    ...element("AcademicYear", String(school.academicYear), 3),
    `    </SourceSchool>`,
    `    <DestSchool>`,
    ...element("LEA", school.la, 3),
    ...element("Estab", "LLLL", 3),
    ...element("URN", "LLLLLL", 3),
    `    </DestSchool>`,
    `  </Header>`,
    `  <CTFpupilData>`,
  ];
  for (const pupil of input.pupils) {
    lines.push(
      `    <Pupil>`,
      ...element("UPN", pupil.upn, 3),
      ...element("Surname", pupil.surname, 3),
      ...element("Forename", pupil.forename, 3),
      ...element("DOB", pupil.dob, 3),
      ...element("Sex", pupil.sex, 3),
    );
    const results = Object.entries(EYFS_RETURN_CODES)
      .flatMap(([goal, code]) => {
        const level = pupil.levels.get(goal);
        return level ? [{ ...code, result: RETURN_RESULT[level] }] : [];
      })
      .toSorted((a, b) => a.component.localeCompare(b.component));
    if (results.length > 0) {
      lines.push(
        `      <StageAssessments>`,
        `        <KeyStage>`,
        `          <Stage>EYF</Stage>`,
      );
      for (const row of results)
        lines.push(
          `          <StageAssessment>`,
          ...element("Locale", "ENG", 6),
          ...element("Year", String(input.year), 6),
          ...element("Subject", row.subject, 6),
          ...element("Method", "FA", 6),
          ...element("Component", row.component, 6),
          ...element("ResultStatus", "R", 6),
          ...element("ResultQualifier", "FD", 6),
          ...element("Result", row.result, 6),
          `          </StageAssessment>`,
        );
      lines.push(`        </KeyStage>`, `      </StageAssessments>`);
    }
    lines.push(`    </Pupil>`);
  }
  lines.push(`  </CTFpupilData>`, `</CTfile>`, "");
  return lines.join("\n");
}
