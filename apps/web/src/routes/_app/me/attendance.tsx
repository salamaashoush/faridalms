import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { createFileRoute } from "@tanstack/react-router";

import { StudentAttendance } from "~/components/attendance/StudentAttendance";
import * as m from "~/i18n/messages";
import { studentAttendanceQuery } from "~/queries/attendance";

export const Route = createFileRoute("/_app/me/attendance")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(studentAttendanceQuery());
  },
  component: MyAttendancePage,
});

function MyAttendancePage() {
  return (
    <Page width="list">
      <PageHeader
        title={m.attendanceTitle()}
        description={m.attStudentHint()}
      />
      <StudentAttendance />
    </Page>
  );
}
