import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { createFileRoute } from "@tanstack/react-router";

import { StudentWeek } from "~/components/timetable/Weeks";
import * as m from "~/i18n/messages";
import { studentWeekQuery } from "~/queries/timetable";

export const Route = createFileRoute("/_app/me/timetable")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(studentWeekQuery());
  },
  component: MyTimetablePage,
});

function MyTimetablePage() {
  return (
    <Page width="list">
      <PageHeader title={m.ttTitle()} description={m.ttStudentHint()} />
      <StudentWeek />
    </Page>
  );
}
