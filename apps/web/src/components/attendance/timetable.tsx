import type { ModuleFillings } from "~/utils/extension";

import { lessonRegisters } from "~/components/timetable/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { replaceWords } from "~/utils/words";

import { DAY_REGISTER } from "./format";

/**
 * The registers of a teacher's lessons on the timetable: each lesson opens
 * its register, and the day's lessons open the teacher's attendance.
 */
export const ATTENDANCE_WITH_TIMETABLE: ModuleFillings = {
  module: "attendance",
  needs: ["timetable"],
  fillings: [
    fill(lessonRegisters, {
      action: {
        label: m.homeOpenAttendance,
        link: { to: "/attendance", search: {} },
      },
      linkOf: ({ classId, periodId, date }) => ({
        to: "/registers/$classId",
        params: { classId },
        search: { date, periodId },
      }),
      openLabel: (lesson) => m.ttOpenRegister({ lesson }),
      states: DAY_REGISTER,
    }),
    replaceWords(m.attRuleLateAfterHintCore, m.attRuleLateAfterHint),
  ],
};
