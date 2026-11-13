import type { ModuleFillings } from "~/utils/extension";

import * as m from "~/i18n/messages";
import { followUpQuery } from "~/queries/attendance";
import { fill } from "~/utils/extension";

import { FollowUp } from "./FollowUp";
import { attendanceTabs } from "./slots";

/** Following up absences calls those who act for a learner, so it needs families. */
export const ATTENDANCE_WITH_FAMILIES: ModuleFillings = {
  module: "attendance",
  needs: ["families"],
  fillings: [
    fill(attendanceTabs, {
      value: "follow",
      label: m.fupTab,
      place: 35,
      load: (queryClient, date) =>
        queryClient.ensureQueryData(
          followUpQuery({ date, overduePage: 1, supportPage: 1 }),
        ),
      Tab: FollowUp,
    }),
  ],
};
