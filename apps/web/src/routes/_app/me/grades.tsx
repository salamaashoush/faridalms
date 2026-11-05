import { createFileRoute } from "@tanstack/react-router";

import { StudentGrades } from "~/components/coursework/StudentGrades";
import { SkillsSection } from "~/components/standards/Progress";
import { PageHeader } from "~/components/system/IndexPage";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentGradesQuery } from "~/queries/gradebook";
import { studentProgressQuery } from "~/queries/standards";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/me/grades")({
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(studentGradesQuery()),
      user.modules.standards
        ? context.queryClient.ensureQueryData(studentProgressQuery(""))
        : null,
    ]);
  },
  component: MyGradesPage,
});

function MyGradesPage() {
  const standards = useCurrentUser().modules.standards;
  return (
    <>
      <PageHeader title={m.gradesTitle()} description={m.gradesHint()} />
      <div className="grid gap-10">
        <StudentGrades />
        {standards ? <SkillsSection studentId="" /> : null}
      </div>
    </>
  );
}
