import { DEFAULT_STUDENT_SCOPED_QUERY } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Table2 } from "lucide-react";

import type { TeachingSlot } from "~/components/teach/TimetableWeek";

import { EmptyState, PageHeader } from "~/components/app/primitives";
import { TimetableWeek } from "~/components/teach/TimetableWeek";
import * as m from "~/i18n/messages";
import { timetableQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/teach/timetable")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      timetableQuery(DEFAULT_STUDENT_SCOPED_QUERY),
    );
  },
  component: TeachingTimetablePage,
});

function TeachingTimetablePage() {
  const data = useSuspenseQuery(
    timetableQuery(DEFAULT_STUDENT_SCOPED_QUERY),
  ).data;

  // `getTimetable` answers a teacher with their own slots, which carry a class
  // where a student's carry a teacher, so the two shapes only meet as a union.
  const slots: TeachingSlot[] = data.slots;

  return (
    <>
      <PageHeader
        title={m.timetableTitle()}
        description={m.teachTimetableSubtitle()}
      />

      {slots.length === 0 ? (
        <EmptyState icon={Table2} title={m.timetableNoLessons()} />
      ) : (
        <TimetableWeek slots={slots} />
      )}
    </>
  );
}
