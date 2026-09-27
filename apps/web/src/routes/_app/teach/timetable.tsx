import { createFileRoute, Link } from "@tanstack/react-router";

import type { CardCell } from "~/components/timetable/Weeks";

import { PageHeader } from "~/components/system/IndexPage";
import { TeacherWeek, todayOf } from "~/components/timetable/Weeks";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { teacherWeekQuery } from "~/queries/timetable";

export const Route = createFileRoute("/_app/teach/timetable")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(teacherWeekQuery());
  },
  component: TeacherTimetablePage,
});

/** Today's lessons open their register; other days only show. */
function registerCell(today: number, date: string): CardCell {
  return function renderCell({ meeting, day, period, card }) {
    if (day !== today) return card;
    return (
      <Link
        to="/registers/$classId"
        params={{ classId: meeting.classId }}
        search={{ date, periodId: period.id }}
        aria-label={m.ttOpenRegister({ lesson: meeting.classCode })}
        className="block h-full rounded-md hover:ring-2 hover:ring-ring/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {card}
      </Link>
    );
  };
}

function TeacherTimetablePage() {
  const user = useCurrentUser();
  return (
    <>
      <PageHeader title={m.ttTitle()} description={m.ttTeacherHint()} />
      <TeacherWeek cell={registerCell(todayOf(user.today), user.today)} />
    </>
  );
}
