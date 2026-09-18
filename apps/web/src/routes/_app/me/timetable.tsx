import { DEFAULT_STUDENT_SCOPED_QUERY } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Table2 } from "lucide-react";

import type { TimetableSlot } from "~/components/me/TimetableWeek";

import { EmptyState, PageHeader } from "~/components/app/primitives";
import { TimetableWeek } from "~/components/me/TimetableWeek";
import * as m from "~/i18n/messages";
import { timetableQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/me/timetable")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      timetableQuery(DEFAULT_STUDENT_SCOPED_QUERY),
    );
  },
  component: MyTimetablePage,
});

function MyTimetablePage() {
  const data = useSuspenseQuery(
    timetableQuery(DEFAULT_STUDENT_SCOPED_QUERY),
  ).data;

  // `getTimetable` answers teachers with their own slots, which carry a class
  // rather than a teacher, so the two shapes only meet as a union.
  const slots: TimetableSlot[] = [...data.slots].map((slot) => ({
    id: slot.id,
    weekday: slot.weekday,
    startTime: slot.startTime,
    endTime: slot.endTime,
    room: slot.room,
    subject: slot.subject,
    teacherName: "teacher" in slot ? (slot.teacher?.name ?? null) : null,
  }));

  return (
    <>
      <PageHeader
        title={m.timetableTitle()}
        description={data.className ?? m.meTimetableSubtitle()}
      />

      {slots.length === 0 ? (
        <EmptyState
          icon={Table2}
          title={m.timetableNoLessons()}
          body={m.meTimetableSubtitle()}
        />
      ) : (
        <TimetableWeek slots={slots} today={data.today} />
      )}
    </>
  );
}
