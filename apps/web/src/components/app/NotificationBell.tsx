import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import * as m from "~/i18n/messages";
import {
  notificationsQuery,
  unreadNotificationsQuery,
} from "~/queries/notifications";
import { markNotificationsRead } from "~/server/notifications";
import { cn } from "~/utils/cn";
import { formatNumber, formatRelativeDays } from "~/utils/datetime";

import { notificationText } from "./notification-labels";

export function NotificationBell({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mark = useServerFn(markNotificationsRead);
  const unread = useQuery(unreadNotificationsQuery).data?.unread ?? 0;
  const recent = useQuery({ ...notificationsQuery(1, false), enabled: false });
  const open = useMutation({
    mutationFn: async (notification: {
      id: string;
      path: string;
      readAt: Date | null;
    }) => {
      if (!notification.readAt)
        await mark({ data: { ids: [notification.id] } });
      return notification.path;
    },
    onSuccess: async (path) => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void navigate({ href: path });
    },
  });
  const rows = recent.data?.rows.slice(0, 8) ?? [];
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
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{m.notifTitle()}</DropdownMenuLabel>
          {rows.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {recent.isFetching ? m.commonLoading() : m.notifEmpty()}
            </p>
          ) : (
            rows.map((row) => {
              const text = notificationText(row.type, row.payload);
              return (
                <DropdownMenuItem
                  key={row.id}
                  className="flex flex-col items-start gap-0.5"
                  onClick={() => open.mutate(row)}
                >
                  <span className="flex w-full items-center gap-2">
                    {row.readAt ? null : (
                      <span
                        className="size-2 shrink-0 rounded-full bg-primary"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {text.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeDays(row.createdAt.toISOString())}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {text.body}
                  </span>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={
              <Link to="/notifications" search={{ page: 1, unread: false }} />
            }
          >
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
