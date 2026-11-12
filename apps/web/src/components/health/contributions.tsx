import { HeartPulse } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { navItems } from "~/components/app/navigation";
import {
  studentDetailsSections,
  studentRecordTabs,
} from "~/components/people/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

import {
  ArrangementsSection,
  DemographicsSection,
  HealthSection,
} from "./RecordSections";

/** Student records' pages and links. */
export const STUDENT_RECORDS: ModuleFillings = {
  module: "student_records",
  fillings: [
    fill(studentDetailsSections, {
      key: "demographics",
      place: 20,
      shows: (access) => access.demographics === true,
      Section: DemographicsSection,
    }),
    fill(studentRecordTabs, {
      value: "health",
      label: m.studentTabHealth,
      place: 90,
      columns: true,
      shows: (access) => access.health === true,
      Tab: HealthSection,
    }),
    fill(studentRecordTabs, {
      value: "support",
      label: m.studentTabSupport,
      place: 100,
      columns: true,
      shows: (access) => access.support === true,
      Tab: ArrangementsSection,
    }),
    fill(modulePages, ["/health-changes", "/family/health", "/me/health"]),
    fill(navItems, {
      workspace: "staff",
      section: "people",
      item: {
        to: "/health-changes",
        label: m.navHealthChanges,
        icon: HeartPulse,
        capability: "health:write",
        place: 40,
      },
    }),
    fill(navItems, {
      workspace: "me",
      section: "home",
      item: {
        to: "/me/health",
        label: m.medicalTitleShort,
        icon: HeartPulse,
        capability: "own-work:read",
        place: 80,
      },
    }),
  ],
};
