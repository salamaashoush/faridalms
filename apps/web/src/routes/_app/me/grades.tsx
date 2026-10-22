import { createFileRoute } from "@tanstack/react-router";

import { StudentGrades } from "~/components/coursework/StudentGrades";
import { SkillsSection } from "~/components/standards/Progress";
import { PageHeader } from "~/components/system/IndexPage";
import * as m from "~/i18n/messages";
import { studentGradesQuery } from "~/queries/gradebook";
import { studentProgressQuery } from "~/queries/standards";

export const Route = createFileRoute("/_app/me/grades")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(studentGradesQuery()),
      context.queryClient.ensureQueryData(studentProgressQuery("")),
    ]);
  },
  component: MyGradesPage,
});

function MyGradesPage() {
  return (
    <>
      <PageHeader title={m.gradesTitle()} description={m.gradesHint()} />
      <div className="grid gap-10">
        <StudentGrades />
        <SkillsSection studentId="" />
      </div>
    </>
  );
}
