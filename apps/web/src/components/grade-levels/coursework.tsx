import { SettingsPage } from "@faridalms/ui/system/settings-section";

import type { ProgrammePartFieldProps } from "~/components/grading/slots";
import type { GradeOptions } from "~/queries/grade-levels";
import type { ModuleFillings } from "~/utils/extension";

import { settingsTabs } from "~/components/admin/slots";
import {
  programmeDefaultWords,
  programmeParts,
} from "~/components/grading/slots";
import { CheckboxRow } from "~/components/people/fields";
import { ReadingNorms } from "~/components/reading/ReadingNorms";
import * as m from "~/i18n/messages";
import { gradeOptionsQuery } from "~/queries/grade-levels";
import { getReadingNorms } from "~/server/reading";
import { formatList } from "~/utils/datetime";
import { fill } from "~/utils/extension";
import { replaceWords } from "~/utils/words";

import { gradeChoices } from "./fields";

const levelsOf = (value: unknown): string[] =>
  typeof value === "object" &&
  value &&
  "gradeLevelIds" in value &&
  Array.isArray(value.gradeLevelIds)
    ? value.gradeLevelIds.filter((id): id is string => typeof id === "string")
    : [];

/** The grade levels a programme covers, on its sheet. */
function ProgrammeLevelsField({
  read,
  value,
  onChange,
}: ProgrammePartFieldProps) {
  const levels = levelsOf(value);
  const choices = read ? gradeChoices(read as GradeOptions) : [];
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm leading-5 font-medium">
        {m.gradingGradeLevels()}
      </legend>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.gradingGradeLevelsHint()}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {choices.map((grade) => (
          <CheckboxRow
            key={grade.value}
            label={grade.label}
            checked={levels.includes(grade.value)}
            onChange={(checked) =>
              onChange({
                gradeLevelIds: checked
                  ? [...levels, grade.value]
                  : levels.filter((id) => id !== grade.value),
              })
            }
          />
        ))}
      </div>
    </fieldset>
  );
}

function ReadingTab() {
  return (
    <SettingsPage>
      <ReadingNorms />
    </SettingsPage>
  );
}

/**
 * Programmes by grade and reading against the norms of a grade, where
 * coursework and grade levels are both on.
 */
export const GRADE_LEVELS_WITH_COURSEWORK: ModuleFillings = {
  module: "grade_levels",
  needs: ["coursework"],
  fillings: [
    fill(programmeParts, {
      key: "levels",
      query: () => gradeOptionsQuery,
      initial: () => ({ gradeLevelIds: [] }),
      summary: (read, value) => {
        if (!read) return null;
        const levels = levelsOf(value);
        const names = gradeChoices(read as GradeOptions)
          .filter((grade) => levels.includes(grade.value))
          .map((grade) => grade.label);
        return names.length > 0 ? formatList(names) : null;
      },
      Field: ProgrammeLevelsField,
    }),
    fill(programmeDefaultWords, {
      option: m.gradingByGradeLevelOption,
      derived: m.gradingByGradeLevel,
      hint: m.gradingClassProgrammeHint,
    }),
    fill(settingsTabs, {
      value: "reading",
      place: 45,
      label: m.readingSettingsTab,
      queries: () => [
        { queryKey: ["reading", "norms"], queryFn: () => getReadingNorms() },
      ],
      Tab: ReadingTab,
    }),
    replaceWords(
      m.gradingProgrammesEmptyHintCore,
      m.gradingProgrammesEmptyHint,
    ),
    replaceWords(
      m.gradingRetireProgrammeBodyCore,
      m.gradingRetireProgrammeBody,
    ),
    replaceWords(m.gradingProgrammesHintCore, m.gradingProgrammesHint, [
      "school_years",
    ]),
  ],
};
