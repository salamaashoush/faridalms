import type { Tone } from "@faridalms/ui/system/status";

import { Button } from "@faridalms/ui/button";
import { Fact, Facts } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import type { Filling } from "~/utils/extension";

import { classTitle } from "~/components/classes/format";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import {
  childDayParts,
  officeCards,
  officeNeeds,
  teacherCards,
} from "~/components/home/slots";
import * as m from "~/i18n/messages";
import {
  attendanceOfficeQuery,
  attendanceTodayQuery,
} from "~/queries/attendance";
import { remindTeachers } from "~/server/attendance";
import { formatPercent } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { fill } from "~/utils/extension";

type Today = Awaited<
  ReturnType<ReturnType<typeof attendanceTodayQuery>["queryFn"]>
>;
type Office = Awaited<ReturnType<(typeof attendanceOfficeQuery)["queryFn"]>>;
type Presence = Exclude<Today["presence"], null>;
type RegisterState = Today["registers"][number]["state"];

const PRESENCE: Record<Presence, { label: () => string; tone: Tone } | null> = {
  present: { label: m.homePresent, tone: "success" },
  late: { label: m.homeLate, tone: "warning" },
  absent: { label: m.homeAbsent, tone: "neutral" },
  absent_unexplained: { label: m.homeAbsentUnexplained, tone: "danger" },
  none: null,
};

const REGISTER: Record<RegisterState, { label: () => string; tone: Tone }> = {
  not_started: { label: m.homeRegisterNotTaken, tone: "warning" },
  in_progress: { label: m.homeRegisterInProgress, tone: "info" },
  submitted: { label: m.homeRegisterTaken, tone: "success" },
};

const manages = (capabilities: readonly string[]) =>
  capabilities.includes("attendance:manage");

interface RemindAllProps {
  today: string;
  classIds: string[];
}

/** Asks every teacher whose register is not taken yet to take it. */
function RemindAll({ today, classIds }: RemindAllProps) {
  const queryClient = useQueryClient();
  const remind = useMutation({
    mutationFn: () => remindTeachers({ data: { date: today, classIds } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(m.homeReminded());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        className="max-md:h-10"
        disabled={remind.isPending}
        onClick={() => remind.mutate()}
      >
        <BellRing aria-hidden />
        {m.homeRemindAll()}
      </Button>
    </div>
  );
}

/** Attendance on Today: a teacher's registers, a child's presence, and the office's registers and rates. */
export const ATTENDANCE_TODAY: Filling[] = [
  fill(teacherCards, {
    key: "registers",
    place: 15,
    area: "main",
    foldsInto: "lessons",
    query: (capabilities) =>
      capabilities.includes("attendance:record")
        ? attendanceTodayQuery()
        : null,
    cardOf: (read) => {
      const { today, registers } = read as Today;
      if (registers.length === 0) return null;
      return (
        <HomeCard
          key="registers"
          title={m.attRegistersCaption()}
          action={{
            label: m.homeOpenAttendance(),
            link: { to: "/attendance", search: {} },
          }}
        >
          <HomeList>
            {registers.map((row) => (
              <HomeItem
                key={`${row.classId}-${row.periodId}`}
                title={
                  <Link
                    to="/registers/$classId"
                    params={{ classId: row.classId }}
                    search={{ date: today, periodId: row.periodId }}
                    className={itemLink}
                  >
                    <bdi>
                      {classTitle({
                        code: row.classCode,
                        titleEn: row.classTitleEn,
                        titleAr: row.classTitleAr,
                      })}
                    </bdi>
                  </Link>
                }
                status={
                  <StatusText tone={REGISTER[row.state].tone}>
                    {REGISTER[row.state].label()}
                  </StatusText>
                }
              />
            ))}
          </HomeList>
        </HomeCard>
      );
    },
  }),
  fill(childDayParts, {
    key: "presence",
    place: 20,
    query: (studentId, capabilities) =>
      capabilities.includes("children:read")
        ? attendanceTodayQuery(studentId)
        : null,
    dayOf: (read, child) => {
      const presence = PRESENCE[(read as Today).presence ?? "none"];
      return {
        ...(presence
          ? { status: { label: presence.label(), tone: presence.tone } }
          : {}),
        attention:
          (read as Today).presence === "absent_unexplained"
            ? [
                {
                  key: `absence-${child.studentId}`,
                  rank: 10,
                  label: m.homeAttentionAbsence(),
                  link: {
                    to: "/family/attendance",
                    search: { studentId: child.studentId },
                  },
                },
              ]
            : [],
      };
    },
  }),
  fill(officeNeeds, {
    place: 10,
    query: (capabilities) =>
      manages(capabilities) ? attendanceOfficeQuery : null,
    needOf: (read) => {
      const { registers } = read as Office;
      return registers.notTaken
        ? {
            key: "registers",
            label: m.homeRegistersNotTaken({ count: registers.notTaken }),
            link: { to: "/attendance", search: {} },
            footer: (
              <RemindAll
                key="remind"
                today={(read as Office).today}
                classIds={registers.classes.map((row) => row.classId)}
              />
            ),
          }
        : null;
    },
  }),
  fill(officeNeeds, {
    place: 20,
    query: (capabilities) =>
      manages(capabilities) ? attendanceOfficeQuery : null,
    needOf: (read) => {
      const { absences } = read as Office;
      return absences
        ? {
            key: "absences",
            label: m.homeUnexplainedAbsences({ count: absences }),
            link: { to: "/attendance", search: { tab: "absences" } },
          }
        : null;
    },
  }),
  fill(officeCards, {
    area: "main",
    place: 20,
    query: (capabilities) =>
      manages(capabilities) ? attendanceOfficeQuery : null,
    cardOf: (read) => {
      const { attendance } = read as Office;
      return (
        <HomeCard
          key="attendance"
          title={m.homeAttendance()}
          action={{
            label: m.homeOpenAttendance(),
            link: { to: "/attendance", search: { tab: "reports" } },
          }}
        >
          <Facts short>
            <Fact
              label={m.homeAttendanceToday()}
              notApplicable={attendance.today === null}
            >
              {attendance.today === null
                ? null
                : formatPercent(attendance.today)}
            </Fact>
            <Fact
              label={m.homeAttendanceWeek()}
              notApplicable={attendance.week === null}
            >
              {attendance.week === null ? null : formatPercent(attendance.week)}
            </Fact>
          </Facts>
        </HomeCard>
      );
    },
  }),
];
