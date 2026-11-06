import { cn } from "@faridalms/ui/cn";
import { useQuery } from "@tanstack/react-query";

import * as m from "~/i18n/messages";
import { unreadThreadsQuery } from "~/queries/messages";
import { formatNumber } from "~/utils/datetime";

export interface UnreadMessagesCountProps {
  className?: string;
}

/**
 * How many conversations wait unread, beside Messages in navigation. It
 * fills in once known rather than holding the shell back, and says what
 * it counts to a screen reader.
 */
export function UnreadMessagesCount({ className }: UnreadMessagesCountProps) {
  const unread = useQuery(unreadThreadsQuery).data?.threads;
  if (!unread) return null;
  return (
    <span
      className={cn(
        "min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] leading-[18px] font-semibold text-primary-foreground tabular-nums",
        className,
      )}
    >
      <span aria-hidden>{formatNumber(Math.min(unread, 99))}</span>
      <span className="sr-only">
        {m.navUnreadMessages({ count: unread, shown: formatNumber(unread) })}
      </span>
    </span>
  );
}
