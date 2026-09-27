import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";

import { SettingsSection } from "~/components/system/SettingsSection";
import { Checkbox } from "~/components/ui/checkbox";
import * as m from "~/i18n/messages";
import { schoolFeaturesQuery } from "~/queries/school-settings";
import { setSchoolFeature } from "~/server/school-settings";
import { getMessageFromError } from "~/utils/error";

export function FeaturesCard() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(schoolFeaturesQuery);
  const [elearning, setElearning] = useState(data.elearning);
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setSchoolFeature({ data: { feature: "elearning", enabled } }),
    meta: { inlineError: true },
    onSuccess: async (features) => {
      queryClient.setQueryData(schoolFeaturesQuery.queryKey, features);
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      await queryClient.invalidateQueries({ queryKey: ["learning"] });
      setSaved(true);
    },
  });
  return (
    <SettingsSection
      title={m.learningFeatureTitle()}
      description={m.learningFeatureHint()}
      onSubmit={() => {
        setSaved(false);
        return mutation.mutateAsync(elearning).catch(() => undefined);
      }}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      saved={saved && elearning === data.elearning}
      isDirty={() => elearning !== data.elearning}
    >
      <div className="grid gap-1">
        <div className="flex items-center gap-3">
          {/* Base UI's checkbox is a span, so the fieldset the section
              disables while saving does not reach it. */}
          <Checkbox
            id="feature-elearning"
            aria-describedby="feature-elearning-hint"
            className="max-md:after:-inset-3"
            disabled={mutation.isPending}
            checked={elearning}
            onCheckedChange={(next) => setElearning(next)}
          />
          <label
            htmlFor="feature-elearning"
            className="text-sm leading-5 font-medium max-md:flex max-md:min-h-10 max-md:flex-1 max-md:items-center"
          >
            {m.learningFeatureToggle()}
          </label>
        </div>
        <p
          id="feature-elearning-hint"
          className="ps-7 text-[13px] leading-[18px] text-muted-foreground"
        >
          {m.learningFeatureToggleHint()}
        </p>
      </div>
    </SettingsSection>
  );
}
