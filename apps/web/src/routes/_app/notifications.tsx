import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BellOff, CheckCheck } from "lucide-react";
import * as v from "valibot";

import { DirectoryPagination } from "~/components/admin/DirectoryPagination";
import { ButtonLink } from "~/components/app/ButtonLink";
import {
  NOTIFICATION_TYPE_LABEL,
  notificationText,
} from "~/components/app/notification-labels";
import { EmptyState, PageHeader } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { notificationsQuery } from "~/queries/notifications";
import { markNotificationsRead } from "~/server/notifications";
import { cn } from "~/utils/cn";
import { formatDateTime } from "~/utils/datetime";

export const Route = createFileRoute("/_app/notifications")({
  staticData: { breadcrumb: m.notifTitle },
  validateSearch: v.object({
    page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    unread: v.optional(v.boolean(), false),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      notificationsQuery(deps.page, deps.unread),
    ),
  component: NotificationsPage,
});

function NotificationsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const mark = useServerFn(markNotificationsRead);
  const { data } = useSuspenseQuery(
    notificationsQuery(search.page, search.unread),
  );
  const markAll = useMutation({
    mutationFn: () => mark({ data: { ids: [] } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const openOne = useMutation({
    mutationFn: (id: string) => mark({ data: { ids: [id] } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <>
      <PageHeader
        title={m.notifTitle()}
        description={
          data.unread > 0
            ? m.notifBellUnread({ count: String(data.unread) })
            : m.notifAllRead()
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              variant={search.unread ? "secondary" : "outline"}
              to="/notifications"
              search={{ page: 1, unread: !search.unread }}
            >
              {m.notifUnreadOnly()}
            </ButtonLink>
            <Button
              variant="outline"
              disabled={data.unread === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck className="size-4" aria-hidden />
              {m.notifMarkAllRead()}
            </Button>
            <ButtonLink variant="outline" to="/notification-preferences">
              {m.notifPreferences()}
            </ButtonLink>
          </div>
        }
      />
      {data.rows.length === 0 ? (
        <EmptyState icon={BellOff} title={m.notifEmpty()} />
      ) : (
        <ol className="divide-y rounded-xl border bg-card">
          {data.rows.map((row) => {
            const text = notificationText(row.type, row.payload);
            return (
              <li key={row.id}>
                <a
                  href={row.path}
                  onClick={(event) => {
                    event.preventDefault();
                    if (!row.readAt) openOne.mutate(row.id);
                    void navigate({ href: row.path });
                  }}
                  className={cn(
                    "flex items-start gap-3 p-4 hover:bg-muted/50",
                    row.readAt ? "" : "bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-2 size-2 shrink-0 rounded-full",
                      row.readAt ? "bg-transparent" : "bg-primary",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "text-sm",
                          row.readAt ? "font-medium" : "font-semibold",
                        )}
                      >
                        {text.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(row.createdAt.toISOString())}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {text.body}
                    </span>
                    <Badge variant="outline" className="mt-2">
                      {NOTIFICATION_TYPE_LABEL[row.type]()}
                    </Badge>
                    {row.readAt ? null : (
                      <span className="sr-only">{m.messagesUnread()}</span>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-4">
        <DirectoryPagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          onPage={(page) =>
            void navigate({ search: (previous) => ({ ...previous, page }) })
          }
        />
      </div>
    </>
  );
}
