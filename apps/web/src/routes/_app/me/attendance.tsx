import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { FamilyReports } from "~/components/attendance/FamilyReports";
import { StudentAttendance } from "~/components/attendance/StudentAttendance";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  myAbsenceReportsQuery,
  studentAttendanceQuery,
} from "~/queries/attendance";
import { currentUserQuery } from "~/queries/user";
import { useWords } from "~/utils/words";

export const Route = createFileRoute("/_app/me/attendance")({
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(studentAttendanceQuery()),
      context.queryClient.ensureQueryData(myAbsenceReportsQuery(user.id)),
    ]);
  },
  component: MyAttendancePage,
});

function MyAttendancePage() {
  const user = useCurrentUser();
  const words = useWords();
  // A learner tells the school of their own absences only where they decide
  // for themself and the school lets learners report.
  const reports = useSuspenseQuery(myAbsenceReportsQuery(user.id)).data;
  return (
    <Page width="list">
      <PageHeader
        title={m.attendanceTitle()}
        description={words(m.attStudentHintCore)()}
      />
      <div className="grid gap-6">
        {reports.mayReport ? (
          <FamilyReports studentId={user.id} name={user.name} />
        ) : null}
        <StudentAttendance />
      </div>
    </Page>
  );
}
