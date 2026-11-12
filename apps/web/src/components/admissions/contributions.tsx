import type { EventKind } from "@faridalms/domain/admissions";

import { CalendarClock, FileUser, UserPlus } from "lucide-react";

import type { PlacedItem } from "~/components/app/navigation";
import type { ModuleFillings } from "~/utils/extension";

import { navItems } from "~/components/app/navigation";
import { calendarOrigins } from "~/components/calendar/slots";
import { setupItemWords, setupStepWords } from "~/components/home/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

import { EVENT_KIND_LABEL } from "./application-labels";
import { ADMISSIONS_NOTICES } from "./notices";

/** The Admissions area: one link whose pages list beneath it while one is open. */
export const ADMISSIONS_NAV: PlacedItem = {
  to: "/admissions",
  label: m.navAdmissions,
  icon: UserPlus,
  capability: ["admissions:read", "admissions:manage", "admissions:configure"],
  pages: [
    {
      to: "/admissions/enquiries",
      label: m.navEnquiries,
      capability: ["admissions:read", "admissions:manage"],
    },
    {
      to: "/admissions/applications",
      label: m.navApplications,
      capability: ["admissions:read", "admissions:manage"],
    },
    {
      to: "/admissions/intakes",
      label: m.navIntakes,
      capability: ["admissions:read", "admissions:configure"],
    },
    {
      to: "/admissions/reports",
      label: m.navAdmissionReports,
      capability: ["admissions:read", "admissions:manage"],
    },
    {
      to: "/admissions/letters",
      label: m.navLetters,
      capability: "admissions:configure",
    },
  ],
  place: 20,
  mobile: 50,
};

/** What admissions shows in the pages of core and other modules. */
export const ADMISSIONS: ModuleFillings = {
  module: "admissions",
  fillings: [
    ...ADMISSIONS_NOTICES,
    fill(setupStepWords, {
      id: "admissions",
      title: m.setupAdmissionsTitle,
      body: m.setupAdmissionsBodyCore,
      capability: "admissions:configure",
      link: { to: "/admissions/intakes", search: {} },
    }),
    fill(setupItemWords, {
      item: "admissions_ready",
      label: m.onboardingAdmissionsReady,
    }),
    fill(modulePages, [
      "/admissions",
      "/family/applications",
      "/me/applications",
      "/apply",
      "/register",
    ]),
    fill(navItems, {
      workspace: "staff",
      section: "people",
      item: ADMISSIONS_NAV,
    }),
    fill(navItems, {
      workspace: "family",
      section: "home",
      item: {
        to: "/family/applications",
        label: m.navApplications,
        icon: FileUser,
        capability: "applications:submit",
        place: 90,
      },
    }),
    fill(navItems, {
      workspace: "me",
      section: "home",
      item: {
        to: "/me/applications",
        label: m.navApplications,
        icon: FileUser,
        capability: "applications:submit",
        place: 100,
      },
    }),
    fill(calendarOrigins, {
      key: "admission",
      category: "admissions",
      label: m.calCatAdmissions,
      mark: {
        icon: CalendarClock,
        colour: "text-teal-600 dark:text-teal-400",
      },
      title: (kind, name) =>
        m.calAdmissionTitle({
          kind: EVENT_KIND_LABEL[kind as EventKind](),
          name,
        }),
      linkOf: (origin) => ({
        to: "/admissions/applications/$applicationId",
        params: { applicationId: origin.id },
      }),
    }),
  ],
};
