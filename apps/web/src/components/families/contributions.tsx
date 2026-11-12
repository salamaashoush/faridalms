import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import {
  House,
  Inbox,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Users,
} from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { audienceKinds } from "~/components/announcements/slots";
import { navItems } from "~/components/app/navigation";
import { portalSentence } from "~/components/auth/portal-words";
import {
  officeNeeds,
  setupItemWords,
  setupStepWords,
} from "~/components/home/slots";
import { formatPhone } from "~/components/people/format";
import {
  personRecordParts,
  studentColumns,
  studentEditorParts,
  studentFamilyParts,
  studentFilters,
} from "~/components/people/slots";
import * as m from "~/i18n/messages";
import {
  guardiansQuery,
  relationsQuery,
  withoutGuardianQuery,
} from "~/queries/families";
import { fill, NOTHING_READ } from "~/utils/extension";
import { modulePages } from "~/utils/pages";
import { replaceWords } from "~/utils/words";

import { PersonChildren } from "./PersonChildren";
import { StudentFamily, StudentFamilyOverview } from "./StudentFamily";
import {
  guardianLinks,
  guardiansProblem,
  StudentGuardiansField,
} from "./StudentGuardians";

/** The guardian column's value for a student without a guardian linked. */
const MISSING = "missing";
/** Its value for a student whose guardians have no phone. */
const LINKED = "linked";

const phoneOf = (value: string | null) =>
  value === null || value === MISSING || value === LINKED ? null : value;

/**
 * What families shows across the product: a student's guardians on their
 * record, in the student form and list, the families audience, the office's
 * count of students without one, and the children on a guardian's record.
 */
export const FAMILIES: ModuleFillings = {
  module: "families",
  fillings: [
    replaceWords(
      m.settingsLearnersDecideHintCore,
      m.settingsLearnersDecideHint,
    ),
    replaceWords(m.settingsCommonsHintCore, m.settingsCommonsHint),
    portalSentence("families", m.portalEyebrowCore, m.portalEyebrow),
    portalSentence("families", m.portalSignInLeadCore, m.portalSignInLead),
    portalSentence("families", m.portalHelpBodyCore, m.portalHelpBody),
    portalSentence("families", m.siteNotOpenBodyCore, m.siteNotOpenBody),
    portalSentence("families", m.authBrandBodyCore, m.authBrandBody),
    portalSentence(
      "families",
      m.authFeatureLanguageCore,
      m.authFeatureLanguage,
    ),
    replaceWords(m.learningFeatureToggleHintCore, m.learningFeatureToggleHint),
    fill(setupStepWords, {
      id: "details",
      title: m.setupDetailsTitle,
      body: m.setupDetailsBody,
      capability: "school:manage",
      link: { to: "/settings", search: {} },
    }),
    fill(setupStepWords, {
      id: "students",
      title: m.setupStudentsTitle,
      body: m.setupStudentsBody,
      capability: "people:manage",
      link: { to: "/students", search: {} },
    }),
    fill(setupItemWords, {
      item: "guardians_linked",
      label: m.onboardingGuardiansLinked,
    }),
    fill(setupItemWords, {
      item: "families_signed_in",
      label: m.onboardingFamiliesSignedIn,
    }),
    fill(modulePages, ["/family"]),
    fill(navItems, {
      workspace: "family",
      section: "home",
      item: {
        to: "/family",
        label: m.navHome,
        icon: House,
        exact: true,
        place: 10,
        mobile: 10,
      },
    }),
    fill(navItems, {
      workspace: "family",
      section: "home",
      item: {
        to: "/family/children",
        label: m.navChildren,
        icon: Users,
        capability: "children:read",
        place: 20,
      },
    }),
    fill(navItems, {
      workspace: "family",
      section: "home",
      item: {
        to: "/family/consents",
        label: m.navConsents,
        icon: ShieldCheck,
        capability: "children:read",
        place: 80,
      },
    }),
    fill(navItems, {
      workspace: "family",
      section: "communication",
      item: {
        to: "/family/messages",
        label: m.navMessages,
        icon: Inbox,
        count: "messages",
        place: 10,
      },
    }),
    fill(studentFamilyParts, {
      label: m.studentTabFamily,
      Tab: StudentFamily,
      Overview: StudentFamilyOverview,
      alerts: {
        custody: {
          label: m.studentCustodyAlert,
          tone: "warning",
          icon: ShieldAlert,
        },
        no_guardian: {
          label: m.studentAlertNoGuardian,
          tone: "warning",
          icon: UserX,
        },
      },
      messageLabel: m.studentMessageGuardians,
    }),
    fill(studentEditorParts, {
      key: "families",
      title: m.studentGuardians,
      query: (studentId) =>
        studentId ? guardiansQuery(studentId) : relationsQuery,
      initial: () => [],
      problem: guardiansProblem,
      sent: (value) =>
        guardianLinks(value as Parameters<typeof guardianLinks>[0]),
      carried: () => [],
      Field: StudentGuardiansField,
    }),
    fill(studentColumns, {
      key: "guardian",
      header: m.studentsGuardianPhone,
      query: () => NOTHING_READ,
      cell: (_read, value) => {
        const phone = phoneOf(value);
        if (phone)
          return (
            <bdi dir="ltr" className="tabular-nums">
              {formatPhone(phone)}
            </bdi>
          );
        return value === LINKED ? (
          <Value>{null}</Value>
        ) : (
          <StatusText tone="warning">{m.studentsMissingGuardian()}</StatusText>
        );
      },
      text: (_read, value) => phoneOf(value) ?? "",
    }),
    fill(studentFilters, {
      key: "guardian",
      query: () => NOTHING_READ,
      facetOf: (_read, value, onChange) => ({
        id: "guardian",
        label: m.studentGuardians(),
        options: [{ value: MISSING, label: m.studentsMissingGuardian() }],
        selected: value === MISSING ? [MISSING] : [],
        onChange: (chosen) =>
          onChange(chosen.includes(MISSING) ? MISSING : undefined),
      }),
      statuses: [],
    }),
    fill(officeNeeds, {
      query: (capabilities) =>
        capabilities.includes("people:read") ? withoutGuardianQuery : null,
      needOf: ({ count }: { count: number }) =>
        count > 0
          ? {
              key: "guardians",
              label: m.homeWithoutGuardian({ count }),
              link: { to: "/students", search: { guardian: MISSING } },
            }
          : null,
    }),
    fill(audienceKinds, {
      scope: "families",
      label: m.annScopeFamilies,
    }),
    fill(personRecordParts, { Overview: PersonChildren }),
  ],
};
