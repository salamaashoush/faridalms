import type { GradeTerm } from "@faridalms/domain/grade-levels";

import { GRADE_TERMS } from "@faridalms/domain/grade-levels";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useId, useState } from "react";

import * as m from "~/i18n/messages";
import { gradeTermQuery } from "~/queries/grade-levels";
import { setGradeTerm } from "~/server/grade-levels";
import { getMessageFromError } from "~/utils/error";

const TERM_NAMES: Record<GradeTerm, () => string> = {
  grade: m.gradeTermGrade,
  level: m.gradeTermLevel,
  year_group: m.gradeTermYearGroup,
  stage: m.gradeTermStage,
};

/** The word the school uses for its grades, chosen from those every sentence is written for. */
export function GradeTermSection() {
  const { data } = useSuspenseQuery(gradeTermQuery);
  const queryClient = useQueryClient();
  const id = useId();
  const [term, setTerm] = useState<GradeTerm>(data.term ?? "grade");
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      setGradeTerm({ data: { term, expectedVersion: data.version } }),
    meta: { inlineError: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["grade-levels"] });
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      setSaved(true);
    },
  });
  const dirty = term !== (data.term ?? "grade");
  return (
    <SettingsSection
      title={m.gradeTermTitle()}
      description={m.gradeTermHint()}
      onSubmit={() => {
        setSaved(false);
        return mutation.mutateAsync().catch(() => undefined);
      }}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      saved={saved && !dirty}
      isDirty={() => dirty}
    >
      <RadioGroup
        aria-label={m.gradeTermTitle()}
        value={term}
        onValueChange={(next) => {
          const chosen = GRADE_TERMS.find((each) => each === next);
          if (chosen) setTerm(chosen);
        }}
      >
        {GRADE_TERMS.map((each) => (
          <label
            key={each}
            htmlFor={`${id}-${each}`}
            className="flex items-center gap-3 text-sm leading-5"
          >
            <RadioGroupItem id={`${id}-${each}`} value={each} />
            {TERM_NAMES[each]()}
          </label>
        ))}
      </RadioGroup>
    </SettingsSection>
  );
}
