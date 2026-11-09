import type { Capability } from "@faridalms/domain/capabilities";
import type { OnboardingItem, SetupStepId } from "@faridalms/domain/onboarding";
import type { SetupGuideStep } from "@faridalms/ui/system/setup-guide";
import type { LinkProps } from "@tanstack/react-router";

import { SetupGuide } from "@faridalms/ui/system/setup-guide";
import { StatusText } from "@faridalms/ui/system/status";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import type { adminHomeQuery } from "~/queries/home";

import { HomeItem, HomeList } from "~/components/home/parts";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { hideOnboarding } from "~/server/home";
import { getMessageFromError } from "~/utils/error";

type AdminHome = Awaited<
  ReturnType<NonNullable<(typeof adminHomeQuery)["queryFn"]>>
>;

const ONBOARDING_LABEL: Record<OnboardingItem, () => string> = {
  admin_signed_in: m.onboardingAdminSignedIn,
  school_details: m.onboardingSchoolDetails,
  year_ready: m.onboardingYearReady,
  classes: m.onboardingClasses,
  staff_invited: m.onboardingStaffInvited,
  staff_signed_in: m.onboardingStaffSignedIn,
  students_imported: m.onboardingStudentsImported,
  guardians_linked: m.onboardingGuardiansLinked,
  timetable_ready: m.onboardingTimetableReady,
  families_signed_in: m.onboardingFamiliesSignedIn,
  first_assignment: m.onboardingFirstAssignment,
  first_register: m.onboardingFirstRegister,
  website_published: m.onboardingWebsitePublished,
  admissions_ready: m.onboardingAdmissionsReady,
  custom_domain: m.onboardingCustomDomain,
  first_invoice_paid: m.onboardingFirstInvoicePaid,
  kickoff_call: m.onboardingKickoffCall,
  training: m.onboardingTraining,
  data_import: m.onboardingDataImport,
};

interface StepPage {
  title: () => string;
  body: () => string;
  /** What the page that takes the step asks of whoever opens it. */
  capability: Capability;
  link: LinkProps;
}

const STEP_PAGE: Record<SetupStepId, StepPage> = {
  details: {
    title: m.setupDetailsTitle,
    body: m.setupDetailsBody,
    capability: "school:manage",
    link: { to: "/settings", search: {} },
  },
  year: {
    title: m.setupYearTitle,
    body: m.setupYearBody,
    capability: "years:manage",
    link: { to: "/academic-years", search: {} },
  },
  classes: {
    title: m.setupClassesTitle,
    body: m.setupClassesBody,
    capability: "classes:manage",
    link: { to: "/classes", search: {} },
  },
  staff: {
    title: m.setupStaffTitle,
    body: m.setupStaffBody,
    capability: "staff:manage",
    link: { to: "/staff", search: {} },
  },
  students: {
    title: m.setupStudentsTitle,
    body: m.setupStudentsBody,
    capability: "people:manage",
    link: { to: "/students", search: {} },
  },
  timetable: {
    title: m.setupTimetableTitle,
    body: m.setupTimetableBody,
    capability: "timetable:manage",
    link: { to: "/timetable", search: {} },
  },
  website: {
    title: m.setupWebsiteTitle,
    body: m.setupWebsiteBody,
    capability: "site:manage",
    link: { to: "/website", search: {} },
  },
  admissions: {
    title: m.setupAdmissionsTitle,
    body: m.setupAdmissionsBody,
    capability: "admissions:configure",
    link: { to: "/admissions/intakes", search: {} },
  },
};

export interface SchoolSetupProps {
  onboarding: NonNullable<AdminHome["onboarding"]>;
}

/**
 * A new school's setup on its administrators' Today, in the order it is
 * best done: each step ticked from the school's own data and linked to the
 * page that takes it, or, for someone who cannot, who does. What else the
 * school reaches in its first weeks follows, as the operators see it.
 */
export function SchoolSetup({ onboarding }: SchoolSetupProps) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const hide = useMutation({
    mutationFn: () => hideOnboarding(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["home"] }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const steps: SetupGuideStep[] = onboarding.steps.map((step) => {
    const page = STEP_PAGE[step.id];
    const may = user.capabilities.includes(page.capability);
    return {
      id: step.id,
      title: page.title(),
      description: page.body(),
      done: step.done,
      optional: step.optional,
      ...(may
        ? { link: <Link {...page.link} /> }
        : { note: m.setupAskSomeone() }),
    };
  });
  return (
    <SetupGuide
      title={m.homeOnboarding()}
      steps={steps}
      finished={m.setupFinished()}
      onHide={() => hide.mutate()}
      hiding={hide.isPending}
    >
      {onboarding.items.length ? (
        <div className="grid gap-1 px-4 pt-3">
          <h3 className="text-sm leading-5 font-medium">{m.setupAlong()}</h3>
          <HomeList>
            {onboarding.items.map((row) => (
              <HomeItem
                key={row.item}
                title={
                  <span className="text-sm">
                    {ONBOARDING_LABEL[row.item]()}
                  </span>
                }
                status={
                  <StatusText tone={row.done ? "success" : "warning"}>
                    {row.done ? m.homeDone() : m.homeToDo()}
                  </StatusText>
                }
              />
            ))}
          </HomeList>
        </div>
      ) : null}
    </SetupGuide>
  );
}
