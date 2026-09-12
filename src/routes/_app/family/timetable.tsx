import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { Field, PageHeader } from "~/components/app/primitives";
import { StudentScopeBar } from "~/components/family/StudentScopeBar";
import { TimetableGrid } from "~/components/family/TimetableGrid";
import { Card, CardContent } from "~/components/ui/card";
import * as m from "~/i18n/messages";
import { timetableQuery, visibleStudentsQuery } from "~/queries/school";
import { studentScopedQuerySchema } from "~/schema/school";

export const Route = createFileRoute("/_app/family/timetable")({
  validateSearch: (search) => v.parse(studentScopedQuerySchema, search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(timetableQuery(deps)),
      context.queryClient.ensureQueryData(visibleStudentsQuery),
    ]);
  },
  component: FamilyTimetablePage,
});

function FamilyTimetablePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { className, slots } = useSuspenseQuery(timetableQuery(search)).data;

  return (
    <>
      <PageHeader
        title={m.timetableTitle()}
        description={m.familyTimetableSubtitle()}
      />

      <StudentScopeBar
        studentId={search.studentId}
        onChange={(studentId) => {
          void navigate({ search: (prev) => ({ ...prev, studentId }) });
        }}
      />

      <Card>
        <CardContent className="px-5">
          <dl className="mb-5">
            <Field label={m.studentClass()}>{className}</Field>
          </dl>
          <TimetableGrid slots={slots} className={className} />
        </CardContent>
      </Card>
    </>
  );
}
