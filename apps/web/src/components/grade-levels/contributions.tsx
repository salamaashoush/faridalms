import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { Value } from "@faridalms/ui/system/value";

import type { ViewValue } from "~/components/classes/slots";
import type { GradeOptions, StudentGrades } from "~/queries/grade-levels";
import type { Filling, ModuleFillings } from "~/utils/extension";

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
import { auditLabels } from "~/components/system/history";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  classGradePartQuery,
  gradeOptionsQuery,
  gradeSettingsQuery,
  studentGradesQuery,
} from "~/queries/grade-levels";
import { fill } from "~/utils/extension";
import { replaceWords } from "~/utils/words";

import type { ClassGradeRead } from "./fields";
import type { GradeWords } from "./words";

import {
  ClassGradeField,
  gradeChoices,
  gradeName,
  StudentGradeAside,
  StudentGradeField,
  StudentGradeHistory,
} from "./fields";
import { GradeLevelsSettings } from "./GradeLevelsSettings";
import { gradeWordingIn, gradeWordsIn, termChoiceLabel } from "./words";

/** The grades a list is narrowed to, as several. */
const chosenOf = (value: ViewValue) =>
  value === undefined ? [] : typeof value === "string" ? [value] : [...value];

const gradeFacet =
  (words: GradeWords) =>
  (
    read: unknown,
    value: ViewValue,
    onChange: (value: ViewValue) => void,
  ): Facet => ({
    id: "grade",
    label: words.grade(),
    options: gradeChoices(read as GradeOptions, ""),
    selected: chosenOf(value),
    onChange: (grades) => onChange(grades.length > 0 ? grades : undefined),
  });

function Nothing() {
  return null;
}

/** What grades and levels show across the portal, in the school's word, wherever a page has a place for it. */
function gradeFillings(words: GradeWords): Filling[] {
  return [
    fill(classFilters, {
      key: "grade",
      directoryOnly: true,
      narrows: () => false,
      query: () => gradeOptionsQuery,
      facetOf: gradeFacet(words),
    }),
    fill(classColumns, {
      key: "grade",
      header: words.grade,
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
        return name ? { facts: [{ label: words.grade(), value: name }] } : null;
      },
    }),
    fill(studentFilters, {
      key: "grade",
      query: () => gradeOptionsQuery,
      facetOf: gradeFacet(words),
      statuses: [],
    }),
    fill(studentColumns, {
      key: "grade",
      header: words.grade,
      query: () => gradeOptionsQuery,
      cell: (read, value) => (
        <Value>{gradeName(read as GradeOptions, value)}</Value>
      ),
      text: (read, value) => gradeName(read as GradeOptions, value) ?? "",
    }),
    fill(studentEditorParts, {
      key: "grade",
      title: words.grade,
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
                  label: words.grade(),
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
    fill(placeWords, { place: words.grade }),
    fill(audienceKinds, {
      scope: "grade",
      label: words.audienceKind,
      target: words.audienceTarget,
      pick: words.audiencePick,
    }),
    replaceWords(m.annAudienceTargetCore, words.audienceChoose),
    replaceWords(m.errorStudentGradeOverlapping, words.overlapping),
    replaceWords(m.errorGradeLevelInUse, words.inUse),
    replaceWords(m.errorGradeLevelUnknown, words.unknown),
    replaceWords(m.errorGradeLevelCodeTaken, words.codeTaken),
    ...(
      [
        ["student_grade.change", words.auditChange],
        ["grade_level.create", words.auditCreate],
        ["grade_level.update", words.auditUpdate],
        ["grade_level.order", words.auditOrder],
        ["grade_level.retire", words.auditRetire],
      ] as const
    ).map(([action, label]) =>
      fill(auditLabels, { action, label: () => label() }),
    ),
    fill(auditLabels, { action: "grade_level.term", label: termChoiceLabel }),
    fill(settingsTabs, {
      value: "grades",
      place: 40,
      label: words.tab,
      queries: () => [gradeSettingsQuery],
      Tab: GradeLevelsSettings,
    }),
  ];
}

export const GRADE_LEVELS: ModuleFillings = {
  module: "grade_levels",
  fillings: (wording) => gradeFillings(gradeWordsIn(gradeWordingIn(wording))),
};
