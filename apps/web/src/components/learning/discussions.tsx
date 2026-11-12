import { SelectField } from "@faridalms/ui/system/form-field";
import { useQuery } from "@tanstack/react-query";

import type { AssignmentEditorPartProps } from "~/components/coursework/slots";
import type { ModuleFillings } from "~/utils/extension";

import { assignmentEditorParts } from "~/components/coursework/slots";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { teachingModulesQuery } from "~/queries/learning";
import { getDiscussionModule } from "~/server/learning";
import { fill } from "~/utils/extension";

/** The module a discussion stands in among the lessons, one set for its class. */
function ModuleField({
  classId,
  format,
  value,
  onChange,
}: AssignmentEditorPartProps) {
  const user = useCurrentUser();
  // Whoever writes modules places a discussion in one; others leave it where it is.
  const placeable = user.capabilities.includes("learning:author");
  const shown = placeable && format === "discussion" && Boolean(classId);
  const modules = useQuery({
    ...teachingModulesQuery(classId),
    enabled: shown,
  }).data?.rows.filter((row) =>
    row.classes.some((item) => item.id === classId),
  );
  if (!shown) return null;
  return (
    <SelectField
      id="discussion-module"
      label={m.discussionModule()}
      hint={m.discussionModuleHint()}
      optional
      value={value || "none"}
      options={[
        { value: "none", label: m.discussionNoModule() },
        ...(modules ?? []).map((row) => ({ value: row.id, label: row.title })),
      ]}
      onChange={(next) => onChange(next === "none" ? "" : next)}
    />
  );
}

/** A discussion's place in a module, where e-learning and coursework are both on. */
export const ELEARNING_WITH_COURSEWORK: ModuleFillings = {
  module: "elearning",
  needs: ["coursework"],
  fillings: [
    fill(assignmentEditorParts, {
      key: "module",
      section: "discussion",
      startsAs: "discussion",
      initial: (assignment) => ({
        queryKey: ["learning", "discussion-module", assignment.id],
        queryFn: async () =>
          (
            await getDiscussionModule({
              data: { assignmentId: assignment.id },
            })
          ).moduleId,
      }),
      // In a module, who takes part in each class is who the module reaches there.
      decidesAudience: (value, format) =>
        format === "discussion" && Boolean(value),
      Field: ModuleField,
    }),
  ],
};
