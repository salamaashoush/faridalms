import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone, Plus } from "lucide-react";
import * as v from "valibot";

import { DirectoryPagination } from "~/components/admin/DirectoryPagination";
import { ButtonLink } from "~/components/app/ButtonLink";
import { EmptyState, PageHeader } from "~/components/app/primitives";
import { AUDIENCE_LABEL } from "~/components/communication/announcement-labels";
import { Badge } from "~/components/ui/badge";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { announcementsQuery } from "~/queries/notifications";
import { formatDateTime } from "~/utils/datetime";

export const Route = createFileRoute("/_app/announcements/")({
  staticData: { breadcrumb: m.announcementsTitle },
  validateSearch: v.object({
    page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(announcementsQuery(deps.page)),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { page } = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const { data } = useSuspenseQuery(announcementsQuery(page));
  return (
    <>
      <PageHeader
        title={m.announcementsTitle()}
        description={m.announcementsSubtitle()}
        actions={
          data.canManage && user.workspace === "admin" ? (
            <ButtonLink to="/admin/announcement-editor" search={{}}>
              <Plus className="size-4" aria-hidden />
              {m.announcementNew()}
            </ButtonLink>
          ) : undefined
        }
      />
      {data.rows.length === 0 ? (
        <EmptyState icon={Megaphone} title={m.announcementsEmpty()} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {data.rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-4 p-5"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/announcements/$announcementId"
                  params={{ announcementId: row.id }}
                  className="font-semibold hover:text-primary hover:underline"
                >
                  {row.title || m.announcementUntitled()}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {row.summary}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">
                    {AUDIENCE_LABEL[row.audience]()}
                  </Badge>
                  {row.status === "draft" ? (
                    <Badge variant="secondary">
                      {m.assignmentStatusDraft()}
                    </Badge>
                  ) : null}
                  {row.publishedAt ? (
                    <span>{formatDateTime(row.publishedAt.toISOString())}</span>
                  ) : null}
                  {row.author?.name ? <span>{row.author.name}</span> : null}
                </p>
              </div>
              {data.canManage && user.workspace === "admin" ? (
                <ButtonLink
                  variant="outline"
                  size="sm"
                  to="/admin/announcement-editor"
                  search={{ id: row.id }}
                >
                  {m.managementEdit()}
                </ButtonLink>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <DirectoryPagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          onPage={(next) => void navigate({ search: { page: next } })}
        />
      </div>
    </>
  );
}
