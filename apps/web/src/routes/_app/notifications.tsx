import { cn } from "@faridalms/ui/cn";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { BellOff, CheckCheck, Settings } from "lucide-react";
import * as v from "valibot";

import {
  KIND_ICON,
  NoticeLink,
  noticeText,
} from "~/components/notifications/format";
import { Pagination } from "~/components/system/DataTable";
import { EmptyState, PageHeader } from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { notificationsQuery } from "~/queries/notifications";
import { markNotificationsRead } from "~/server/notifications";
import { formatAgo, formatNumber } from "~/utils/datetime";

const TABS = ["all", "action"] as const;

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "all"), "all"),
  page: v.fallback(
    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/notifications")({
  staticData: { breadcrumb: m.notifTitle },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      notificationsQuery(deps.tab, deps.page),
    ),
  component: NotificationsPage,
});

function NotificationsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(
    notificationsQuery(search.tab, search.page),
  ).data;
  const { mutate: markRead, isPending } = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead({ data: { ids } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <div className="mx-auto grid w-full max-w-3xl">
      <PageHeader
        title={m.notifTitle()}
        description={m.ntfHint()}
        action={{
          label: m.notifPreferences(),
          icon: Settings,
          link: { to: "/notification-preferences" },
        }}
        menu={
          data.unread > 0
            ? [
                {
                  label: m.ntfMarkAll(),
                  icon: CheckCheck,
                  onSelect: () => markRead([]),
                },
              ]
            : []
        }
      />
      <RecordTabs
        label={m.notifTitle()}
        tabs={[
          { value: "all", label: m.ntfTabAll() },
          {
            value: "action",
            label:
              data.waiting > 0
                ? m.ntfTabActionCount({ count: formatNumber(data.waiting) })
                : m.ntfTabAction(),
          },
        ]}
        value={search.tab}
        onChange={(tab) => void navigate({ search: { tab } })}
      >
        {data.rows.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={search.tab === "action" ? m.ntfNoAction() : m.notifEmpty()}
            description={
              search.tab === "action" ? m.ntfNoActionBody() : m.ntfEmptyBody()
            }
          />
        ) : (
          <div className="grid gap-4">
            <ul className="divide-y rounded-lg border bg-card">
              {data.rows.map((row) => {
                const text = noticeText(row);
                const Icon = KIND_ICON[row.kind];
                const unread = row.readAt === null;
                return (
                  <li key={row.id}>
                    <NoticeLink
                      notice={row}
                      workspace={user.workspace}
                      onClick={() => {
                        if (unread && !isPending) markRead([row.id]);
                      }}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          row.kind === "urgent"
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                        aria-hidden
                      />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span
                            className={cn(
                              "min-w-0 text-sm leading-5",
                              unread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {text.title}
                            {unread ? (
                              <span className="sr-only"> {m.annUnread()}</span>
                            ) : null}
                          </span>
                          {/* "A minute ago" can turn over between the server's render and the browser's. */}
                          <span
                            suppressHydrationWarning
                            className="shrink-0 text-xs leading-4 text-muted-foreground"
                          >
                            {formatAgo(row.createdAt)}
                          </span>
                        </span>
                        {text.body ? (
                          <bdi className="line-clamp-2 text-[13px] leading-[18px] text-muted-foreground">
                            {text.body}
                          </bdi>
                        ) : null}
                        {row.needsAction && !row.actedAt ? (
                          <span className="text-xs leading-4 font-medium text-warning-foreground dark:text-warning">
                            {m.ntfNeedsYou()}
                          </span>
                        ) : null}
                      </span>
                      {unread ? (
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                      ) : null}
                    </NoticeLink>
                  </li>
                );
              })}
            </ul>
            {data.pages > 1 ? (
              <Pagination
                page={data.page}
                pages={data.pages}
                total={data.total}
                pageSize={30}
                onPage={(page) =>
                  void navigate({
                    search: (previous) => ({ ...previous, page }),
                  })
                }
              />
            ) : null}
          </div>
        )}
      </RecordTabs>
    </div>
  );
}
