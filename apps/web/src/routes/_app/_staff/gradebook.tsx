import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import * as v from "valibot";

import { defaultClass } from "~/components/classes/format";
import { Gradebook } from "~/components/gradebook/Gradebook";
import * as m from "~/i18n/messages";
import { courseworkOptionsQuery } from "~/queries/coursework";
import { classBookQuery, runningShownQuery } from "~/queries/gradebook";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

const uuid = v.pipe(v.string(), v.uuid());

export const Route = createFileRoute("/_app/_staff/gradebook")({
  validateSearch: v.object({
    classId: v.optional(uuid),
    periodId: v.optional(uuid),
    student: v.fallback(v.optional(uuid), undefined),
  }),
  loaderDeps: ({ search }) => ({
    classId: search.classId,
    periodId: search.periodId,
  }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "submissions:grade");
    const options = await context.queryClient.ensureQueryData(
      courseworkOptionsQuery,
    );
    const classId = deps.classId ?? defaultClass(options.classes)?.id;
    if (classId)
      await Promise.all([
        context.queryClient.ensureQueryData(
          classBookQuery(classId, deps.periodId ?? ""),
        ),
        context.queryClient.ensureQueryData(runningShownQuery(classId)),
      ]);
  },
  component: GradebookPage,
});

function GradebookPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const options = useSuspenseQuery(courseworkOptionsQuery).data;
  const classId = search.classId ?? defaultClass(options.classes)?.id;
  if (!classId)
    return (
      <Page width="list">
        <PageHeader title={m.gradebookTitle()} />
        <EmptyState
          icon={BookOpen}
          title={m.gradebookNoClasses()}
          description={m.gradebookNoClassesBody()}
        />
      </Page>
    );
  return (
    <Gradebook
      classId={classId}
      periodId={search.periodId ?? ""}
      studentId={search.student}
      classes={options.classes}
      onScope={(change) => {
        // Moving between students replaces the entry, so Back leaves the page.
        void navigate({
          search: (previous) => ({ ...previous, ...change }),
          replace: !("classId" in change) && !("periodId" in change),
          resetScroll: false,
        });
      }}
    />
  );
}
