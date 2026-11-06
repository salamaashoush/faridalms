import type { ModuleId, SwitchedModule } from "@faridalms/domain/modules";

import { MODULE_IDS, SWITCHED_MODULES } from "@faridalms/domain/modules";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { schoolFeaturesQuery } from "~/queries/school-settings";
import { askAboutModule, setSchoolFeature } from "~/server/school-settings";
import { getMessageFromError } from "~/utils/error";
import { MODULE_LABEL } from "~/utils/modules";

const LABEL: Record<
  SwitchedModule,
  { name: () => string; hint: () => string }
> = {
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
  const user = useCurrentUser();
  const { data } = useSuspenseQuery(schoolFeaturesQuery);
  const [switches, setSwitches] = useState(data.switches);
  const [saved, setSaved] = useState(false);
  const available = new Set<string>(data.available);
  const changed = SWITCHED_MODULES.filter(
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
        {SWITCHED_MODULES.map((feature) => {
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
      <div className="grid gap-2 border-t pt-4">
        <h3 className="text-sm leading-5 font-semibold">
          {m.modulesInPlanTitle()}
        </h3>
        <ul className="grid gap-x-10 gap-y-1.5 sm:grid-cols-2">
          {MODULE_IDS.filter(
            (id) => !(SWITCHED_MODULES as readonly string[]).includes(id),
          ).map((id) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 text-sm leading-5"
            >
              <span>{MODULE_LABEL[id]()}</span>
              <span className="flex items-center gap-2">
                <StatusText tone={user.modules[id] ? "success" : "neutral"}>
                  {user.modules[id]
                    ? m.modulesIncluded()
                    : m.modulesNotInPlan()}
                </StatusText>
                {!user.modules[id] && data.canAsk ? (
                  <AskAbout module={id} />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SettingsSection>
  );
}

/**
 * Asks the platform about a module the plan does not have: the business
 * hears of it as a lead and gets in touch.
 */
function AskAbout({ module }: { module: ModuleId }) {
  const ask = useMutation({
    mutationFn: () => askAboutModule({ data: { module } }),
    meta: { inlineError: true },
  });
  if (ask.isSuccess)
    return (
      <output className="text-xs text-muted-foreground">
        {m.modulesAsked()}
      </output>
    );
  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        disabled={ask.isPending}
        onClick={() => ask.mutate()}
      >
        {m.modulesAskAbout()}
      </Button>
      {ask.error ? (
        <span role="alert" className="text-xs text-destructive">
          {getMessageFromError(ask.error)}
        </span>
      ) : null}
    </span>
  );
}
