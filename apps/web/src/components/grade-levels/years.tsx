import { SelectField } from "@faridalms/ui/system/form-field";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { RolloverPartFieldProps } from "~/components/years/slots";
import type { ModuleFillings } from "~/utils/extension";

import { rolloverClassParts } from "~/components/years/slots";
import * as m from "~/i18n/messages";
import { gradeOptionsQuery } from "~/queries/grade-levels";
import { fill } from "~/utils/extension";

import { gradeChoices } from "./fields";

const NONE = "none";

/** The grade a class carried over a rollover teaches in the next year. */
function RolloverGradeField({
  rowKey,
  value,
  onChange,
}: RolloverPartFieldProps) {
  const options = useSuspenseQuery(gradeOptionsQuery).data;
  const gradeId = typeof value?.gradeId === "string" ? value.gradeId : "";
  return (
    <SelectField
      id={`roll-grade-${rowKey}`}
      label={m.studentGrade()}
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
  fillings: [
    fill(rolloverClassParts, {
      key: "grade",
      query: () => gradeOptionsQuery,
      Field: RolloverGradeField,
    }),
  ],
};
