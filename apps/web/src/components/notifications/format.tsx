import type { NotificationKind } from "@faridalms/domain/notifications";
import type { Workspace } from "@faridalms/domain/workspace";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Link } from "@tanstack/react-router";
import {
  AtSign,
  Bell,
  BookMarked,
  CalendarDays,
  ClipboardCheck,
  HeartPulse,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  Siren,
} from "lucide-react";

import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";

import type { Notice, NoticeLinkProps } from "./slots";

import { noticeWords } from "./slots";

export type { Notice } from "./slots";

const both = (en?: string, ar?: string) => inLocale(en || null, ar || null);

export const URGENT_ICON = Siren;

/** The kinds of notice core sends, by their icon; a module's own come with its words. */
const KIND_ICON: Partial<Record<NotificationKind, LucideIcon>> = {
  announcement: Megaphone,
  urgent: URGENT_ICON,
  message: MessageSquare,
  event: CalendarDays,
  reminder: ClipboardCheck,
  consent: ShieldCheck,
  mention: AtSign,
  library: BookMarked,
  correction: HeartPulse,
};

/** What a notice of core's says, in the reader's language, from what its producer recorded. */
function coreText(notice: Notice): { title: string; body: string } | null {
  const { params } = notice;
  const title = both(params.title, params.titleAr);
  const date = params.date ?? "";
  switch (notice.kind) {
    case "announcement":
      return {
        title: params.updated === true ? m.ntfUpdated() : m.ntfAnnouncement(),
        body: title,
      };
    case "urgent":
      return { title: m.ntfUrgent(), body: title };
    case "message":
      return {
        title: m.ntfMessage({
          name:
            both(params.actorName, params.actorNameAr) ||
            inLocale(notice.actorNameEn, notice.actorNameAr),
        }),
        body: params.preview ?? "",
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
      if (params.cover)
        return {
          title: (params.cancelled ? m.ntfCoverOff : m.ntfCover)({
            name: both(params.className, params.classNameAr),
          }),
          body: [
            date ? formatDate(date) : "",
            both(params.periodName, params.periodNameAr),
          ]
            .filter(Boolean)
            .join(" · "),
        };
      return {
        title: m.ntfReminder({
          name: both(params.className, params.classNameAr),
        }),
        body: date ? formatDate(date) : "",
      };
    case "consent":
      return {
        title: m.ntfConsent(),
        body: [title, both(params.studentName, params.studentNameAr)]
          .filter(Boolean)
          .join(" · "),
      };
    case "mention":
      if (params.comment)
        return {
          title: m.ntfCommentMention({
            name:
              both(params.actorName, params.actorNameAr) ||
              inLocale(notice.actorNameEn, notice.actorNameAr),
          }),
          body: [title, params.preview].filter(Boolean).join(" · "),
        };
      return {
        title: m.ntfMention({
          name:
            both(params.actorName, params.actorNameAr) ||
            inLocale(notice.actorNameEn, notice.actorNameAr),
        }),
        body: title,
      };
    case "library":
      return {
        title: params.shared
          ? m.ntfTemplateShared()
          : m.ntfTemplateSentBack({
              name:
                both(params.actorName, params.actorNameAr) ||
                inLocale(notice.actorNameEn, notice.actorNameAr),
            }),
        body: title,
      };
    case "correction":
      return {
        title: (params.report === "accepted"
          ? m.ntfCorrectionAccepted
          : m.ntfCorrectionDeclined)({
          name: both(params.studentName, params.studentNameAr),
        }),
        body: m.ntfCorrectionBody(),
      };
  }
  return null;
}

/**
 * How the notices of the school's modules read: each kind's icon and words
 * from core or from the module that owns it, and nothing of a kind whose
 * module is off.
 */
export function useNoticeWords() {
  const added = useSlot(noticeWords);
  const of = (kind: NotificationKind) =>
    added.find((each) => each.kind === kind);
  return {
    iconOf: (kind: NotificationKind): LucideIcon =>
      of(kind)?.icon ?? KIND_ICON[kind] ?? Bell,
    textOf: (notice: Notice): { title: string; body: string } | null =>
      of(notice.kind)?.text(notice) ?? coreText(notice),
    labelOf: (kind: NotificationKind) => of(kind)?.label,
    offered: (
      kind: NotificationKind,
      workspace: Workspace,
      capabilities: readonly string[],
    ) => of(kind)?.offered?.(workspace, capabilities) ?? true,
  };
}

/** Where each workspace reads its messages. */
export const MESSAGES = {
  staff: "/messages",
  family: "/family/messages",
  me: "/me/messages",
} as const;

type Passed = Omit<NoticeLinkProps, "notice" | "workspace" | "children">;

/**
 * The thread a comment mentioning the reader is in, opened in the editor
 * of the record it is about; the editor's own page decides who may.
 */
function CommentedIn({
  notice,
  children,
  ...rest
}: Passed & { notice: Notice; children: ReactNode }) {
  const id = notice.subjectId;
  const hash = notice.params.threadId
    ? `thread-${notice.params.threadId}`
    : undefined;
  const parentId = notice.params.parentId;
  switch (notice.subjectType) {
    case "lesson":
      return parentId ? (
        <Link
          {...rest}
          to="/lesson-editor"
          search={{ id, moduleId: parentId }}
          hash={hash}
        >
          {children}
        </Link>
      ) : null;
    case "module_plan":
      return (
        <Link {...rest} to="/module-plan" search={{ moduleId: id }} hash={hash}>
          {children}
        </Link>
      );
    case "assignment":
      return (
        <Link {...rest} to="/assignment-editor" search={{ id }} hash={hash}>
          {children}
        </Link>
      );
    case "announcement":
      return (
        <Link {...rest} to="/announcement-editor" search={{ id }} hash={hash}>
          {children}
        </Link>
      );
    case "calendar_event":
      return (
        <Link {...rest} to="/event-editor" search={{ id }} hash={hash}>
          {children}
        </Link>
      );
    case "privacy_notice":
      return parentId ? (
        <Link
          {...rest}
          to="/consent-form-editor"
          search={{ purpose: parentId }}
          hash={hash}
        >
          {children}
        </Link>
      ) : null;
    default:
      return null;
  }
}

/** The lesson, assignment, news or announcement that mentions the reader. */
function MentionedIn({
  notice,
  children,
  ...rest
}: Passed & { notice: Notice; children: ReactNode }) {
  const id = notice.subjectId;
  if (notice.params.comment)
    return (
      <CommentedIn notice={notice} {...rest}>
        {children}
      </CommentedIn>
    );
  switch (notice.subjectType) {
    case "lesson":
      return (
        <Link {...rest} to="/lessons/$lessonId" params={{ lessonId: id }}>
          {children}
        </Link>
      );
    case "assignment":
      return (
        <Link
          {...rest}
          to="/assignments/$assignmentId"
          params={{ assignmentId: id }}
          search={{}}
        >
          {children}
        </Link>
      );
    case "announcement":
      return (
        <Link
          {...rest}
          to="/announcements/$announcementId"
          params={{ announcementId: id }}
        >
          {children}
        </Link>
      );
    default:
      return null;
  }
}

/** A link to what the notice is about. */
export function NoticeLink({
  notice,
  workspace,
  children,
  ...rest
}: NoticeLinkProps) {
  const added = useSlot(noticeWords).find((each) => each.kind === notice.kind);
  if (added)
    return (
      <added.Link notice={notice} workspace={workspace} {...rest}>
        {children}
      </added.Link>
    );
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
    case "message":
      return (
        <Link {...rest} to={MESSAGES[workspace]} search={{ thread: id }}>
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
      if (notice.params.cover && notice.params.cancelled)
        return (
          <Link {...rest} to="/timetable">
            {children}
          </Link>
        );
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
    case "consent":
      return (
        <Link
          {...rest}
          to={workspace === "family" ? "/family/consents" : "/me/consents"}
        >
          {children}
        </Link>
      );
    case "mention":
      return (
        <MentionedIn notice={notice} {...rest}>
          {children}
        </MentionedIn>
      );
    case "library":
      return (
        <Link {...rest} to="/templates" search={{}}>
          {children}
        </Link>
      );
    case "correction":
      return (
        <Link
          {...rest}
          to="/family/health"
          search={{ studentId: notice.params.studentId || undefined }}
        >
          {children}
        </Link>
      );
  }
  return null;
}
