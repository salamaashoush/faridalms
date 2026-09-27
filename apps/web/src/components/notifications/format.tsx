import type {
  NoticeParams,
  NotificationKind,
} from "@faridalms/domain/notifications";
import type { Workspace } from "@faridalms/domain/workspace";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ClipboardCheck,
  Megaphone,
  MessageSquare,
  Newspaper,
  Siren,
  UserX,
} from "lucide-react";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";

export interface Notice {
  id: string;
  kind: NotificationKind;
  subjectId: string;
  params: NoticeParams;
  actorNameEn: string | null;
  actorNameAr: string | null;
}

const both = (en?: string, ar?: string) => inLocale(en || null, ar || null);

export const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  announcement: Megaphone,
  urgent: Siren,
  newsletter: Newspaper,
  message: MessageSquare,
  absence: UserX,
  event: CalendarDays,
  reminder: ClipboardCheck,
};

/** What a notice says, in the reader's language, from what its producer recorded. */
export function noticeText(notice: Notice): { title: string; body: string } {
  const { params } = notice;
  const title = params.title ?? "";
  const date = params.date ?? "";
  switch (notice.kind) {
    case "announcement":
      return {
        title: params.updated === true ? m.ntfUpdated() : m.ntfAnnouncement(),
        body: title,
      };
    case "urgent":
      return { title: m.ntfUrgent(), body: title };
    case "newsletter":
      return { title: m.ntfNewsletter(), body: title };
    case "message":
      return {
        title: m.ntfMessage({
          name:
            both(params.actorName, params.actorNameAr) ||
            inLocale(notice.actorNameEn, notice.actorNameAr),
        }),
        body: params.preview ?? "",
      };
    case "absence":
      return {
        title: m.ntfAbsence({
          name: both(params.studentName, params.studentNameAr),
        }),
        body: [
          date ? formatDate(date) : "",
          both(params.className, params.classNameAr),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "event":
      return {
        title: params.cancelled
          ? m.ntfEventCancelled()
          : params.updated
            ? m.ntfEventChanged()
            : m.ntfEvent(),
        body: [title, date ? formatDate(date) : ""].filter(Boolean).join(" · "),
      };
    case "reminder":
      return {
        title: m.ntfReminder({
          name: both(params.className, params.classNameAr),
        }),
        body: date ? formatDate(date) : "",
      };
  }
  return { title: "", body: "" };
}

const MESSAGES = {
  admin: "/admin/messages",
  teach: "/teach/messages",
  family: "/family/messages",
  me: "/me/messages",
} as const;

type Passed = Omit<ComponentProps<"a">, "href" | "children">;

/** A link to what the notice is about. */
export function NoticeLink({
  notice,
  workspace,
  children,
  ...rest
}: Passed & {
  notice: Notice;
  workspace: Workspace;
  children: ReactNode;
}) {
  const id = notice.subjectId;
  switch (notice.kind) {
    case "announcement":
    case "urgent":
      return (
        <Link
          {...rest}
          to="/announcements/$announcementId"
          params={{ announcementId: id }}
        >
          {children}
        </Link>
      );
    case "newsletter":
      return (
        <Link
          {...rest}
          to="/newsletters/$newsletterId"
          params={{ newsletterId: id }}
        >
          {children}
        </Link>
      );
    case "message":
      return (
        <Link {...rest} to={MESSAGES[workspace]} search={{ thread: id }}>
          {children}
        </Link>
      );
    case "absence":
      return (
        <Link
          {...rest}
          to="/family/attendance"
          search={{ studentId: notice.params.studentId || undefined }}
        >
          {children}
        </Link>
      );
    case "event":
      return (
        <Link {...rest} to="/calendar/$eventId" params={{ eventId: id }}>
          {children}
        </Link>
      );
    case "reminder":
      return (
        <Link
          {...rest}
          to="/registers/$classId"
          params={{ classId: id }}
          search={{ date: notice.params.date ?? "" }}
        >
          {children}
        </Link>
      );
  }
  return null;
}
