import { createFileRoute } from "@tanstack/react-router";

import { StudentGrades } from "~/components/coursework/StudentGrades";
import { PageHeader } from "~/components/system/IndexPage";
import * as m from "~/i18n/messages";
import { studentGradesQuery } from "~/queries/gradebook";

export const Route = createFileRoute("/_app/me/grades")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(studentGradesQuery());
  },
  component: MyGradesPage,
});

function MyGradesPage() {
  return (
    <>
      <PageHeader title={m.gradesTitle()} description={m.gradesHint()} />
      <StudentGrades />
    </>
  );
}
