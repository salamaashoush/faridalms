import { SelectField } from "@faridalms/ui/system/form-field";
import { useQuery } from "@tanstack/react-query";

import type { AssignmentEditorPartProps } from "~/components/coursework/slots";
import type { ModuleFillings } from "~/utils/extension";

import {
  assignmentEditorParts,
  studentWorkSections,
} from "~/components/coursework/slots";
import { gradingScaleActions } from "~/components/grading/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentGradesQuery, workTermQuery } from "~/queries/gradebook";
import { getWorkTerm } from "~/server/gradebook";
import { fill } from "~/utils/extension";
import { replaceWords } from "~/utils/words";

import { RegradeAction } from "./RegradeSheet";
import { gradesSections } from "./slots";
import { StudentGrades } from "./StudentGrades";

/** The term a piece of work counts toward, among its class's year's terms. */
function TermField({ classId, value, onChange }: AssignmentEditorPartProps) {
  const terms =
    useQuery({ ...workTermQuery(classId), enabled: Boolean(classId) }).data
      ?.terms ?? [];
  if (terms.length === 0) return null;
  return (
    <SelectField
      id="work-term"
      label={m.courseworkTerm()}
      optional
      value={value || "none"}
      options={[
        { value: "none", label: m.commonNotRecorded() },
        ...terms.map((row) => ({
          value: row.id,
          label: inLocale(row.titleEn, row.titleAr),
        })),
      ]}
      onChange={(next) => onChange(next === "none" ? "" : next)}
    />
  );
}

/** Term grading, where the gradebook and school years are both on. */
export const GRADEBOOK_IN_YEARS: ModuleFillings = {
  module: "gradebook",
  needs: ["school_years"],
  fillings: [
    fill(gradesSections, {
      key: "terms",
      place: 20,
      query: (studentId) => studentGradesQuery(studentId),
      Section: StudentGrades,
    }),
    fill(studentWorkSections, { key: "terms", Section: StudentGrades }),
    fill(assignmentEditorParts, {
      key: "term",
      section: "grading",
      belongsToClass: true,
      initial: (assignment) => ({
        queryKey: ["gradebook", "term-of", assignment.id],
        queryFn: async () =>
          (
            await getWorkTerm({
              data: {
                classId: assignment.classId,
                assignmentId: assignment.id,
              },
            })
          ).periodId,
      }),
      Field: TermField,
    }),
    fill(gradingScaleActions, { key: "regrade", Action: RegradeAction }),
    replaceWords(
      m.gradebookRunningProvisionalCore,
      m.gradebookRunningProvisional,
    ),
    replaceWords(m.gradebookRunningSpanCore, m.gradebookRunningSpan),
    replaceWords(m.gradebookShowRunningHintCore, m.gradebookShowRunningHint),
  ],
};
