import type { EventKind } from "@faridalms/domain/admissions";

import { CalendarClock } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { calendarOrigins } from "~/components/calendar/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

import { EVENT_KIND_LABEL } from "./application-labels";

/** What admissions shows in the pages of core and other modules. */
export const ADMISSIONS: ModuleFillings = {
  module: "admissions",
  fillings: [
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
