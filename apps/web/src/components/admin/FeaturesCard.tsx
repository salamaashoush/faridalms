import type { ModuleId } from "@faridalms/domain/modules";

import { MODULE_IDS, SWITCHED_MODULES } from "@faridalms/domain/modules";
import { cardModules } from "@faridalms/domain/plans";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { schoolFeaturesQuery } from "~/queries/school-settings";
import { askAboutModule, setSchoolFeature } from "~/server/school-settings";
import { getMessageFromError } from "~/utils/error";
import { everyFilling } from "~/utils/extension";
import { useWords } from "~/utils/words";

import { moduleSwitches } from "./slots";

const MODULE_LABEL: Record<ModuleId, () => string> = {
  school_years: m.moduleSchoolYears,
  grade_levels: m.moduleGradeLevels,
  homerooms: m.moduleHomerooms,
  families: m.moduleFamilies,
  coursework: m.moduleCoursework,
  peer_review: m.modulePeerReview,
  gradebook: m.moduleGradebook,
  attendance: m.moduleAttendance,
  timetable: m.moduleTimetable,
  website: m.moduleWebsite,
  custom_domains: m.moduleCustomDomains,
  admissions: m.moduleAdmissions,
  student_records: m.moduleStudentRecords,
  badges: m.moduleBadges,
  standards: m.moduleStandards,
  elearning: m.moduleElearning,
  early_years: m.moduleEarlyYears,
  coding: m.moduleCoding,
  video: m.moduleVideo,
  sso: m.moduleSso,
  sms: m.moduleSms,
};

/**
 * The modules a school's administrators switch on, and what its plan
 * includes. Their plan decides which switches are available; one outside it
 * shows, locked, so they know it exists. Of the other modules the card
 * names those the school has and those on offer it may ask about.
 */
export function FeaturesCard() {
  const words = useWords();
  const { extensions } = useRouteContext({ from: "__root__" });
  const offers = everyFilling(extensions, moduleSwitches).toSorted(
    (a, b) => a.place - b.place,
  );
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
      <div className="grid gap-4" data-module-catalogue>
        {offers.map(({ module: feature, name, hint }) => {
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
                  {name()}
                </label>
              </div>
              <p
                id={`${id}-hint`}
                className="ps-7 text-[13px] leading-[18px] text-muted-foreground"
              >
                {offered ? words(hint)() : m.featureNotInPlan()}
              </p>
            </div>
          );
        })}
      </div>
      <div className="grid gap-2 border-t pt-4" data-module-catalogue>
        <h3 className="text-sm leading-5 font-semibold">
          {m.modulesInPlanTitle()}
        </h3>
        <ul className="grid gap-x-10 gap-y-1.5 sm:grid-cols-2">
          {cardModules({
            modules: MODULE_IDS.filter(
              (id) => !(SWITCHED_MODULES as readonly string[]).includes(id),
            ),
            has: (id) => user.modules[id],
            offered: data.offered,
          }).map((id) => (
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

interface AskAboutProps {
  module: ModuleId;
}

/**
 * Asks the platform about a module the plan does not have: the business
 * hears of it as a lead and gets in touch.
 */
function AskAbout({ module }: AskAboutProps) {
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
