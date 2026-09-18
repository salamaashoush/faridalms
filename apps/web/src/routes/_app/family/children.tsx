import { studentScopedQuerySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { PageHeader, Value } from "~/components/app/primitives";
import { Card, CardContent } from "~/components/ui/card";
import * as m from "~/i18n/messages";
import { studentQuery, visibleStudentsQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/family/children")({
  validateSearch: studentScopedQuerySchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (deps.studentId) {
      const { profile } = await context.queryClient.ensureQueryData(
        studentQuery(deps),
      );
      throw redirect({
        to: "/students/$studentId",
        params: { studentId: profile.id },
        search: {},
      });
    }
    await context.queryClient.ensureQueryData(visibleStudentsQuery);
  },
  component: ChildrenPage,
});
function ChildrenPage() {
  const { data } = useSuspenseQuery(visibleStudentsQuery);
  return (
    <>
      <PageHeader
        title={m.navChildren()}
        description={m.familyChildrenSubtitle()}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((student) => (
          <Card key={student.id} className="gap-0 py-0">
            <CardContent className="p-5">
              <Link
                to="/students/$studentId"
                params={{ studentId: student.id }}
                search={{}}
                className="group flex items-center gap-4 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
              >
                <PersonAvatar
                  name={student.fullName}
                  photoUrl={student.photoUrl}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold group-hover:text-primary">
                    {student.fullName}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Value>{student.className}</Value>
                  </p>
                </div>
                <ArrowUpRight
                  className="size-4 text-muted-foreground rtl:-rotate-90"
                  aria-hidden
                />
              </Link>
              <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
                {m.familyReference()}: {student.reference}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
