import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@faridalms/ui/dropdown-menu";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import {
  KIND_ICON,
  NoticeLink,
  noticeText,
} from "~/components/notifications/format";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { recentNotificationsQuery } from "~/queries/notifications";
import { markNotificationsRead } from "~/server/notifications";
import { formatAgo, formatNumber } from "~/utils/datetime";

export interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const recent = useQuery(recentNotificationsQuery);
  const { mutate: markRead } = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead({ data: { ids } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = recent.data?.unread ?? 0;
  const rows = recent.data?.rows ?? [];
  return (
    <DropdownMenu
      onOpenChange={(next) => {
        if (next) void recent.refetch();
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("relative", className)}
            aria-label={
              unread > 0
                ? m.notifBellUnread({ count: formatNumber(unread) })
                : m.notifBell()
            }
          />
        }
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute -end-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.65rem] leading-4 font-semibold text-primary-foreground"
          >
            {formatNumber(Math.min(unread, 99))}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-w-[calc(100vw-1rem)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            {m.notifTitle()}
            {unread > 0 ? (
              <button
                type="button"
                className="text-xs font-normal text-primary hover:underline"
                onClick={() => markRead([])}
              >
                {m.ntfMarkAll()}
              </button>
            ) : null}
          </DropdownMenuLabel>
          {rows.length === 0 ? (
            <div className="px-2 py-3">
              {recent.isFetching ? (
                <p className="text-sm text-muted-foreground">
                  {m.commonLoading()}
                </p>
              ) : (
                <EmptyState placement="section" title={m.notifEmpty()} />
              )}
            </div>
          ) : (
            rows.map((row) => {
              const text = noticeText(row);
              const Icon = KIND_ICON[row.kind];
              return (
                <DropdownMenuItem
                  key={row.id}
                  className="items-start gap-2.5"
                  onClick={() => {
                    if (!row.readAt) markRead([row.id]);
                  }}
                  render={
                    <NoticeLink notice={row} workspace={user.workspace}>
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          row.kind === "urgent"
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                        aria-hidden
                      />
                      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-sm",
                              row.readAt ? "font-normal" : "font-semibold",
                            )}
                          >
                            {text.title}
                          </span>
                          <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                            {formatAgo(row.createdAt)}
                          </span>
                        </span>
                        {text.body ? (
                          <bdi className="line-clamp-2 text-xs text-muted-foreground">
                            {text.body}
                          </bdi>
                        ) : null}
                      </span>
                      {row.readAt ? null : (
                        <span className="sr-only">{m.annUnread()}</span>
                      )}
                    </NoticeLink>
                  }
                />
              );
            })
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/notifications" search={{}} />}>
            {m.notifViewAll()}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/notification-preferences" />}>
            {m.notifPreferences()}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
