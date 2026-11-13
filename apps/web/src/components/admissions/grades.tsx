import { suggestedAges } from "@faridalms/domain/admissions";
import { SelectField } from "@faridalms/ui/system/form-field";

import type { IntakePartFieldProps } from "~/components/admissions/slots";
import type { GradeWords } from "~/components/grade-levels/words";
import type { GradeOptions } from "~/queries/grade-levels";
import type { Filling, ModuleFillings } from "~/utils/extension";

import {
  intakeParts,
  previousSchoolGrades,
} from "~/components/admissions/slots";
import { gradeChoices } from "~/components/grade-levels/fields";
import {
  gradeWordingIn,
  gradeWordsIn,
  useGradeWords,
} from "~/components/grade-levels/words";
import * as m from "~/i18n/messages";
import { gradeOptionsQuery } from "~/queries/grade-levels";
import { fill } from "~/utils/extension";
import { replaceWords } from "~/utils/words";

const NONE = "none";

const gradeIdOf = (value: unknown) =>
  typeof value === "object" && value && "gradeId" in value
    ? String(value.gradeId)
    : "";

/** The grade an intake admits into, on its form; fixed once it has one. */
function IntakeGradeField({
  read,
  value,
  fixed,
  onChange,
}: IntakePartFieldProps) {
  const words = useGradeWords();
  const gradeId = gradeIdOf(value);
  return (
    <SelectField
      id="intake-grade"
      label={words.intakeGrade()}
      optional
      value={gradeId || NONE}
      disabled={fixed && gradeId !== ""}
      options={[
        ...gradeChoices(read as GradeOptions, gradeId),
        { value: NONE, label: m.commonNotRecorded() },
      ]}
      onChange={(next) => onChange({ gradeId: next === NONE ? "" : next })}
      width="name"
    />
  );
}

/**
 * Intakes by grade, where admissions and grade levels are both on, with
 * the words that speak of a grade.
 */
export const ADMISSIONS_BY_GRADE: ModuleFillings = {
  module: "admissions",
  needs: ["grade_levels"],
  fillings: (wording) =>
    admissionsGradeFillings(gradeWordsIn(gradeWordingIn(wording))),
};

function admissionsGradeFillings(words: GradeWords): Filling[] {
  return [
    fill(intakeParts, {
      key: "grade",
      label: words.intakeGrade,
      letterHint: words.letterGrade,
      query: () => gradeOptionsQuery,
      initial: () => ({ value: { gradeId: "" } }),
      titleOf: (read, value) => {
        const grade = (read as GradeOptions).grades.find(
          (row) => row.id === gradeIdOf(value),
        );
        return grade
          ? {
              en: grade.labelEn ?? grade.labelAr ?? grade.code,
              ar: grade.labelAr ?? grade.labelEn ?? grade.code,
            }
          : null;
      },
      suggest: (read, value) => {
        const grade = (read as GradeOptions).grades.find(
          (row) => row.id === gradeIdOf(value),
        );
        if (!grade) return {};
        const ages = suggestedAges(grade.meaning);
        return {
          ages: { minMonths: ages.minMonths, maxMonths: ages.maxMonths },
        };
      },
      Field: IntakeGradeField,
    }),
    fill(previousSchoolGrades, true),
    replaceWords(m.applyNoIntakesCore, words.applyNone),
    replaceWords(m.aplAgeFitsCore, words.ageFits),
    replaceWords(m.adrByIntakeCore, words.reportByIntake),
    replaceWords(m.famAppsEmptyBodyCore, words.applicationsEmpty),
    replaceWords(m.itkFieldCapacityHintCore, words.intakeCapacity),
    replaceWords(m.errIntakeFixedCore, words.intakeFixed),
    replaceWords(m.errIntakeGrade, words.intakeUnknown),
    replaceWords(m.errApplicationClosedCore, words.applyClosed),
    replaceWords(m.errApplicationYoungCore, words.applyYoung),
    replaceWords(m.errApplicationOldCore, words.applyOld),
    replaceWords(m.errApplicationExistsCore, words.applyExists),
  ];
}
