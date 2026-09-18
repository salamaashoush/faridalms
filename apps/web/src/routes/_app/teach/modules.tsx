import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Layers, Plus } from "lucide-react";

import { ButtonLink } from "~/components/app/ButtonLink";
import { SubjectIcon } from "~/components/app/labels";
import { EmptyState, PageHeader, Value } from "~/components/app/primitives";
import { subjectLabel } from "~/components/family/format";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";
import { teachingModulesQuery } from "~/queries/learning";
import { formatDate, formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/teach/modules")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(teachingModulesQuery),
  component: ModulesPage,
});
function ModulesPage() {
  const { data } = useSuspenseQuery(teachingModulesQuery);
  return (
    <>
      <PageHeader
        title={m.navModules()}
        description={m.learningTeachHint()}
        actions={
          <ButtonLink to="/teach/module-editor" search={{}}>
            <Plus aria-hidden />
            {m.learningNewModule()}
          </ButtonLink>
        }
      />
      {data.length === 0 ? (
        <EmptyState icon={Layers} title={m.learningNoModulesTeach()} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card px-5">
          {data.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/teach/module-editor"
                  search={{ id: row.id }}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {row.title}
                </Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <SubjectIcon icon={row.subject?.icon ?? ""} />
                    <Value>{subjectLabel(row.subject)}</Value>
                  </span>
                  <span aria-hidden>·</span>
                  <Value>{row.class?.name}</Value>
                  <span aria-hidden>·</span>
                  <span>
                    {m.learningLessonCount({
                      count: formatNumber(row.lessonCount),
                    })}
                  </span>
                  {row.publishedAt ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>
                        {m.sitePublishedOn({
                          date: formatDate(row.publishedAt.toISOString()),
                        })}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <Badge
                variant={row.status === "published" ? "default" : "outline"}
              >
                {row.status === "published"
                  ? m.siteStatusPublished()
                  : m.siteStatusDraft()}
              </Badge>
              <ButtonLink
                size="sm"
                variant="outline"
                to="/modules/$moduleId"
                params={{ moduleId: row.id }}
                search={{}}
              >
                {m.learningPreview()}
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
