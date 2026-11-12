import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import * as v from "valibot";

import { FamilyReports } from "~/components/attendance/FamilyReports";
import { StudentAttendance } from "~/components/attendance/StudentAttendance";
import { displayName } from "~/components/people/format";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  myAbsenceReportsQuery,
  studentAttendanceQuery,
} from "~/queries/attendance";
import { childrenQuery } from "~/queries/families";
import { currentUserQuery } from "~/queries/user";
import { useWords } from "~/utils/words";

export const Route = createFileRoute("/_app/family/attendance")({
  validateSearch: v.object({
    studentId: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const children = await context.queryClient.ensureQueryData(
      childrenQuery(user.id),
    );
    const child = deps.studentId ?? children[0]?.studentId;
    if (child)
      await Promise.all([
        context.queryClient.ensureQueryData(studentAttendanceQuery(child)),
        context.queryClient.ensureQueryData(myAbsenceReportsQuery(child)),
      ]);
  },
  component: FamilyAttendancePage,
});

function FamilyAttendancePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const words = useWords();
  const children = useSuspenseQuery(childrenQuery(user.id)).data;
  const current = search.studentId ?? children[0]?.studentId;
  const childFacet: Facet = {
    id: "child",
    label: m.courseworkChild(),
    single: true,
    options: children.map((child) => ({
      value: child.studentId,
      label: displayName(child),
    })),
    selected: current ? [current] : [],
    defaultSelected: children[0] ? [children[0].studentId] : [],
    onChange: ([next]) => {
      void navigate({ search: { studentId: next || undefined } });
    },
  };
  return (
    <Page width="list">
      <PageHeader
        title={m.attendanceTitle()}
        description={words(m.attFamilyHintCore)()}
      />
      {current ? (
        <div className="grid gap-6">
          {children.length > 1 ? <IndexToolbar facets={[childFacet]} /> : null}
          <FamilyReports
            studentId={current}
            name={displayName(
              children.find((child) => child.studentId === current) ?? {
                fullNameEn: null,
                fullNameAr: null,
              },
            )}
          />
          <StudentAttendance studentId={current} />
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      )}
    </Page>
  );
}
