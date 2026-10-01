import type { Feature } from "@faridalms/domain/features";

import { FEATURES } from "@faridalms/domain/features";
import { Checkbox } from "@faridalms/ui/checkbox";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";

import { SettingsSection } from "~/components/system/SettingsSection";
import * as m from "~/i18n/messages";
import { schoolFeaturesQuery } from "~/queries/school-settings";
import { setSchoolFeature } from "~/server/school-settings";
import { getMessageFromError } from "~/utils/error";

const LABEL: Record<Feature, { name: () => string; hint: () => string }> = {
  elearning: {
    name: m.learningFeatureToggle,
    hint: m.learningFeatureToggleHint,
  },
  early_years: {
    name: m.earlyYearsFeatureToggle,
    hint: m.earlyYearsFeatureToggleHint,
  },
};

/**
 * The modules a school's administrators switch on. Their plan decides which
 * are available; one outside it shows, locked, so they know it exists.
 */
export function FeaturesCard() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(schoolFeaturesQuery);
  const [switches, setSwitches] = useState(data.switches);
  const [saved, setSaved] = useState(false);
  const available = new Set<string>(data.available);
  const changed = FEATURES.filter(
    (feature) => switches[feature] !== data.switches[feature],
  );
  const mutation = useMutation({
    mutationFn: async () => {
      let latest = data;
      for (const feature of changed)
        latest = await setSchoolFeature({
          data: { feature, enabled: switches[feature] },
        });
      return latest;
    },
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
        return mutation.mutateAsync().catch(() => undefined);
      }}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      saved={saved && changed.length === 0}
      isDirty={() => changed.length > 0}
    >
      <div className="grid gap-4">
        {FEATURES.map((feature) => {
          const offered = available.has(feature);
          const id = `feature-${feature}`;
          return (
            <div key={feature} className="grid gap-1">
              <div className="flex items-center gap-3">
                {/* Base UI's checkbox is a span, so the fieldset the section
                    disables while saving does not reach it. */}
                <Checkbox
                  id={id}
                  aria-describedby={`${id}-hint`}
                  className="max-md:after:-inset-3"
                  disabled={
                    mutation.isPending || (!offered && !switches[feature])
                  }
                  checked={switches[feature] && offered}
                  onCheckedChange={(next) =>
                    setSwitches((current) => ({ ...current, [feature]: next }))
                  }
                />
                <label
                  htmlFor={id}
                  className="text-sm leading-5 font-medium max-md:flex max-md:min-h-10 max-md:flex-1 max-md:items-center"
                >
                  {LABEL[feature].name()}
                </label>
              </div>
              <p
                id={`${id}-hint`}
                className="ps-7 text-[13px] leading-[18px] text-muted-foreground"
              >
                {offered ? LABEL[feature].hint() : m.featureNotInPlan()}
              </p>
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}
