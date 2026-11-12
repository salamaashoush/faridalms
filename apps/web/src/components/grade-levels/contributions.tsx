import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { Value } from "@faridalms/ui/system/value";

import type { ViewValue } from "~/components/classes/slots";
import type { GradeOptions, StudentGrades } from "~/queries/grade-levels";
import type { ModuleFillings } from "~/utils/extension";

import { settingsTabs } from "~/components/admin/slots";
import { audienceKinds } from "~/components/announcements/slots";
import {
  classColumns,
  classEditorParts,
  classFilters,
  classRecordParts,
} from "~/components/classes/slots";
import {
  placeWords,
  studentColumns,
  studentEditorParts,
  studentFilters,
  studentRecordParts,
} from "~/components/people/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  classGradePartQuery,
  gradeOptionsQuery,
  gradeSettingsQuery,
  studentGradesQuery,
} from "~/queries/grade-levels";
import { fill } from "~/utils/extension";

import type { ClassGradeRead } from "./fields";

import {
  ClassGradeField,
  gradeChoices,
  gradeName,
  StudentGradeAside,
  StudentGradeField,
  StudentGradeHistory,
} from "./fields";
import { GradeLevelsSettings } from "./GradeLevelsSettings";

/** The grades a list is narrowed to, as several. */
const chosenOf = (value: ViewValue) =>
  value === undefined ? [] : typeof value === "string" ? [value] : [...value];

function gradeFacet(
  read: unknown,
  value: ViewValue,
  onChange: (value: ViewValue) => void,
): Facet {
  return {
    id: "grade",
    label: m.studentGrade(),
    options: gradeChoices(read as GradeOptions, ""),
    selected: chosenOf(value),
    onChange: (grades) => onChange(grades.length > 0 ? grades : undefined),
  };
}

function Nothing() {
  return null;
}

/** What grades and levels show across the portal, wherever a page has a place for it. */
export const GRADE_LEVELS: ModuleFillings = {
  module: "grade_levels",
  fillings: [
    fill(classFilters, {
      key: "grade",
      directoryOnly: true,
      narrows: () => false,
      query: () => gradeOptionsQuery,
      facetOf: gradeFacet,
    }),
    fill(classColumns, {
      key: "grade",
      header: m.studentGrade,
      query: () => gradeOptionsQuery,
      cell: (read, value) => (
        <Value>{gradeName(read as GradeOptions, value)}</Value>
      ),
    }),
    fill(classEditorParts, {
      key: "grade",
      section: "details",
      query: (classId) => classGradePartQuery(classId),
      initial: (read) => ({
        value: { gradeId: (read as ClassGradeRead).gradeId },
      }),
      Field: ClassGradeField,
    }),
    fill(classRecordParts, {
      query: () => gradeOptionsQuery,
      partOf: (read, record) => {
        const name = gradeName(
          read as GradeOptions,
          record.columns.grade ?? null,
        );
        return name
          ? { facts: [{ label: m.studentGrade(), value: name }] }
          : null;
      },
    }),
    fill(studentFilters, {
      key: "grade",
      query: () => gradeOptionsQuery,
      facetOf: gradeFacet,
      statuses: [],
    }),
    fill(studentColumns, {
      key: "grade",
      header: m.studentGrade,
      query: () => gradeOptionsQuery,
      cell: (read, value) => (
        <Value>{gradeName(read as GradeOptions, value)}</Value>
      ),
      text: (read, value) => gradeName(read as GradeOptions, value) ?? "",
    }),
    fill(studentEditorParts, {
      key: "grade",
      title: m.studentGrade,
      query: (studentId) =>
        studentId ? studentGradesQuery(studentId) : gradeOptionsQuery,
      initial: () => ({ gradeId: "" }),
      problem: () => null,
      sent: (value) => value,
      // The next student is often entered in the same grade.
      carried: (value) => value,
      Field: StudentGradeField,
    }),
    fill(studentRecordParts, {
      query: (studentId) => studentGradesQuery(studentId),
      partOf: (read) => {
        const { rows, today } = read as StudentGrades;
        const current = rows.find(
          (row) =>
            row.from <= today && (row.until === null || today < row.until),
        );
        return {
          facts: current?.grade
            ? [
                {
                  label: m.studentGrade(),
                  value: inLocale(current.grade.labelEn, current.grade.labelAr),
                },
              ]
            : [],
          status: null,
          departure: [],
          Overview: Nothing,
          Enrolment: StudentGradeHistory,
          EnrolmentAside: StudentGradeAside,
        };
      },
    }),
    fill(placeWords, { place: m.studentGrade }),
    fill(audienceKinds, {
      scope: "grade",
      label: m.annScopeGrade,
      target: m.annGrade,
      pick: m.annPickGrade,
    }),
    fill(settingsTabs, {
      value: "grades",
      place: 40,
      label: m.gradeLevelsTab,
      queries: () => [gradeSettingsQuery],
      Tab: GradeLevelsSettings,
    }),
  ],
};
