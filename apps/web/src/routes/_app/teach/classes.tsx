import { classScopedQuerySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { School } from "lucide-react";

import { EmptyState, PageHeader } from "~/components/app/primitives";
import { ClassCard } from "~/components/teach/ClassCard";
import * as m from "~/i18n/messages";
import { classQuery, myClassesQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/teach/classes")({
  validateSearch: classScopedQuerySchema,
  loaderDeps: ({ search }) => ({ classId: search.classId }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(myClassesQuery);
    if (deps.classId) {
      await context.queryClient.ensureQueryData(classQuery(deps.classId));
    }
  },
  component: MyClassesPage,
});

function MyClassesPage() {
  const { classId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const classes = useSuspenseQuery(myClassesQuery).data;

  const toggle = (id: string) => {
    void navigate({
      search: (previous) => ({
        ...previous,
        classId: previous.classId === id ? "" : id,
      }),
    });
  };

  return (
    <>
      <PageHeader
        title={m.teachMyClassesTitle()}
        description={m.teachClassesSubtitle()}
      />

      {classes.length === 0 ? (
        <EmptyState icon={School} title={m.teachNoClasses()} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {classes.map((row) => (
            <ClassCard
              key={row.id}
              row={row}
              open={row.id === classId}
              onToggle={() => {
                toggle(row.id);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
