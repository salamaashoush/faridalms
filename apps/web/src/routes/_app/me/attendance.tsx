import { createFileRoute } from "@tanstack/react-router";

import { StudentAttendance } from "~/components/attendance/StudentAttendance";
import { PageHeader } from "~/components/system/IndexPage";
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
    <>
      <PageHeader
        title={m.attendanceTitle()}
        description={m.attStudentHint()}
      />
      <StudentAttendance />
    </>
  );
}
