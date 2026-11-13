import { SelectField } from "@faridalms/ui/system/form-field";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { RolloverPartFieldProps } from "~/components/years/slots";
import type { ModuleFillings } from "~/utils/extension";

import { rolloverClassParts } from "~/components/years/slots";
import * as m from "~/i18n/messages";
import { gradeOptionsQuery } from "~/queries/grade-levels";
import { fill } from "~/utils/extension";
import { replaceWords } from "~/utils/words";

import { gradeChoices } from "./fields";
import { gradeWordingIn, gradeWordsIn, useGradeWords } from "./words";

const NONE = "none";

/** The grade a class carried over a rollover teaches in the next year. */
function RolloverGradeField({
  rowKey,
  value,
  onChange,
}: RolloverPartFieldProps) {
  const options = useSuspenseQuery(gradeOptionsQuery).data;
  const words = useGradeWords();
  const gradeId = typeof value?.gradeId === "string" ? value.gradeId : "";
  return (
    <SelectField
      id={`roll-grade-${rowKey}`}
      label={words.grade()}
      optional
      value={gradeId || NONE}
      options={[
        ...gradeChoices(options, gradeId),
        { value: NONE, label: m.commonNotRecorded() },
      ]}
      onChange={(next) => onChange({ gradeId: next === NONE ? "" : next })}
    />
  );
}

/** Grades through a rollover, where grade levels and school years are both on. */
export const GRADE_LEVELS_IN_YEARS: ModuleFillings = {
  module: "grade_levels",
  needs: ["school_years"],
  fillings: (wording) => {
    const words = gradeWordsIn(gradeWordingIn(wording));
    return [
      fill(rolloverClassParts, {
        key: "grade",
        query: () => gradeOptionsQuery,
        Field: RolloverGradeField,
      }),
      replaceWords(m.rolloverClassesHintCore, words.rolloverClasses),
      replaceWords(m.rolloverStudentsHintCore, words.rolloverStudents),
      replaceWords(m.studentPlacementHistoryHintCore, words.placementHistory),
    ];
  },
};
