import type { OnboardingItem } from "@faridalms/domain/onboarding";
import type { SetupGuideStep } from "@faridalms/ui/system/setup-guide";

import { SetupGuide } from "@faridalms/ui/system/setup-guide";
import { StatusText } from "@faridalms/ui/system/status";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import type { SetupStepWords } from "~/components/home/slots";
import type { adminHomeQuery } from "~/queries/home";

import { HomeItem, HomeList } from "~/components/home/parts";
import { setupItemWords, setupStepWords } from "~/components/home/slots";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { hideOnboarding } from "~/server/home";
import { getMessageFromError } from "~/utils/error";

type AdminHome = Awaited<
  ReturnType<NonNullable<(typeof adminHomeQuery)["queryFn"]>>
>;

/** How the list names core's own first steps; the modules name theirs. */
const OWN_LABEL: Partial<Record<OnboardingItem, () => string>> = {
  admin_signed_in: m.onboardingAdminSignedIn,
  school_details: m.onboardingSchoolDetails,
  classes: m.onboardingClasses,
  staff_invited: m.onboardingStaffInvited,
  staff_signed_in: m.onboardingStaffSignedIn,
  students_imported: m.onboardingStudentsImported,
  first_invoice_paid: m.onboardingFirstInvoicePaid,
  kickoff_call: m.onboardingKickoffCall,
  training: m.onboardingTraining,
  data_import: m.onboardingDataImport,
};

/** Core's own setup steps, in the words a school without any module reads. */
const OWN_STEPS: readonly SetupStepWords[] = [
  {
    id: "details",
    title: m.setupDetailsTitle,
    body: m.setupDetailsBodyCore,
    capability: "school:manage",
    link: { to: "/settings", search: {} },
  },
  {
    id: "classes",
    title: m.setupClassesTitleCore,
    body: m.setupClassesBodyCore,
    capability: "classes:manage",
    link: { to: "/classes", search: {} },
  },
  {
    id: "staff",
    title: m.setupStaffTitle,
    body: m.setupStaffBody,
    capability: "staff:manage",
    link: { to: "/staff", search: {} },
  },
  {
    id: "students",
    title: m.setupStudentsTitleCore,
    body: m.setupStudentsBodyCore,
    capability: "people:manage",
    link: { to: "/students", search: {} },
  },
];

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
  const words = new Map(
    [...OWN_STEPS, ...useSlot(setupStepWords)].map((each) => [each.id, each]),
  );
  const labels = new Map(
    useSlot(setupItemWords).map((each) => [each.item, each.label]),
  );
  const steps: SetupGuideStep[] = onboarding.steps.flatMap((step) => {
    const page = words.get(step.id);
    if (!page) return [];
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
                    {(OWN_LABEL[row.item] ?? labels.get(row.item))?.()}
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
