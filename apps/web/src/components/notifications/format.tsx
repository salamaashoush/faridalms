import type {
  ApplicationOutcome,
  NoticeParams,
  NotificationKind,
} from "@faridalms/domain/notifications";
import type { Workspace } from "@faridalms/domain/workspace";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Link } from "@tanstack/react-router";
import {
  AtSign,
  BookMarked,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileUser,
  GraduationCap,
  HeartPulse,
  Megaphone,
  MessageSquare,
  MessageSquareText,
  Reply,
  School,
  ShieldCheck,
  Siren,
  UserPlus,
  UserX,
} from "lucide-react";

import { EVENT_KIND_LABEL } from "~/components/admissions/application-labels";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate, formatTime } from "~/utils/datetime";

export interface Notice {
  id: string;
  kind: NotificationKind;
  /** What kind of record the notice is about, where a link must know. */
  subjectType?: string;
  subjectId: string;
  params: NoticeParams;
  actorNameEn: string | null;
  actorNameAr: string | null;
}

const both = (en?: string, ar?: string) => inLocale(en || null, ar || null);

export const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  announcement: Megaphone,
  urgent: Siren,
  message: MessageSquare,
  absence: UserX,
  event: CalendarDays,
  reminder: ClipboardCheck,
  consent: ShieldCheck,
  mention: AtSign,
  library: BookMarked,
  reply: Reply,
  enquiry: UserPlus,
  application: FileUser,
  assignment: ClipboardList,
  feedback: MessageSquareText,
  grades: GraduationCap,
  correction: HeartPulse,
  reenrolment: School,
  admission_event: CalendarClock,
};

/** What a notice about an application's move is headed, for the family and for the office. */
const OUTCOME_TITLE: Record<ApplicationOutcome, () => string> = {
  offered: m.ntfOutcomeOffered,
  waitlisted: m.ntfOutcomeWaitlisted,
  declined_by_school: m.ntfOutcomeDeclined,
  enrolled: m.ntfOutcomeEnrolled,
  offer_expired: m.ntfOutcomeExpired,
  deferred: m.ntfOutcomeDeferred,
  accepted: m.ntfOutcomeAccepted,
  offer_declined: m.ntfOutcomeOfferDeclined,
};

const ENQUIRY_TITLE = {
  enquiry: m.ntfEnquiry,
  visit: m.ntfEnquiryVisit,
  general: m.ntfEnquiryGeneral,
};

/** What a notice says, in the reader's language, from what its producer recorded. */
export function noticeText(notice: Notice): { title: string; body: string } {
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
    case "absence":
      if (params.report)
        return {
          title: (params.report === "accepted"
            ? m.ntfReportAccepted
            : m.ntfReportDeclined)({
            name: both(params.studentName, params.studentNameAr),
          }),
          body: date ? formatDate(date) : "",
        };
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
      if (params.peerReview)
        return {
          title: m.ntfPeerDue(),
          body: [title, date ? m.ntfDue({ date: formatDate(date) }) : ""]
            .filter(Boolean)
            .join(" · "),
        };
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
    case "reply":
      return {
        title: m.ntfReply({
          name:
            both(params.actorName, params.actorNameAr) ||
            inLocale(notice.actorNameEn, notice.actorNameAr),
        }),
        body: title,
      };
    case "enquiry":
      return {
        title: params.assigned
          ? m.ntfEnquiryAssigned({
              name:
                both(params.actorName, params.actorNameAr) ||
                inLocale(notice.actorNameEn, notice.actorNameAr),
            })
          : ENQUIRY_TITLE[params.purpose ?? "enquiry"](),
        body: [title, params.preview ?? ""].filter(Boolean).join(" · "),
      };
    case "application":
      if (params.outcome)
        return {
          title: OUTCOME_TITLE[params.outcome](),
          body: [title, both(params.gradeName, params.gradeNameAr)]
            .filter(Boolean)
            .join(" · "),
        };
      return params.received
        ? {
            title: m.ntfApplicationReceived(),
            body: m.ntfApplicationReceivedBody({
              child: title,
              grade: both(params.gradeName, params.gradeNameAr),
              reference: params.reference ?? "",
            }),
          }
        : {
            title: m.ntfApplication(),
            body: [title, both(params.gradeName, params.gradeNameAr)]
              .filter(Boolean)
              .join(" · "),
          };
    case "assignment":
      if (params.peerReview)
        return {
          title: m.ntfPeerHandedOut(),
          body: [title, date ? m.ntfDue({ date: formatDate(date) }) : ""]
            .filter(Boolean)
            .join(" · "),
        };
      return {
        title: params.studentName
          ? m.ntfAssignmentFor({
              name: both(params.studentName, params.studentNameAr),
            })
          : m.ntfAssignment(),
        body: [
          title,
          both(params.className, params.classNameAr),
          date ? m.ntfDue({ date: formatDate(date) }) : "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "feedback": {
      const name = both(params.studentName, params.studentNameAr);
      return {
        title: params.gradeShown
          ? name
            ? m.ntfGradeShownFor({ name })
            : m.ntfGradeShown()
          : params.revise
            ? name
              ? m.ntfReviseFor({ name })
              : m.ntfRevise()
            : name
              ? m.ntfFeedbackFor({ name })
              : m.ntfFeedback(),
        body: [title, both(params.className, params.classNameAr)]
          .filter(Boolean)
          .join(" · "),
      };
    }
    case "grades":
      return {
        title: params.studentName
          ? m.ntfGradesFor({
              name: both(params.studentName, params.studentNameAr),
            })
          : m.ntfGrades(),
        body: [title, both(params.className, params.classNameAr)]
          .filter(Boolean)
          .join(" · "),
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
    case "reenrolment":
      return {
        title: m.ntfReenrolmentTitle({
          name: both(params.studentName, params.studentNameAr),
        }),
        body: m.ntfReenrolmentBody({
          year: both(params.title, params.titleAr),
        }),
      };
    case "admission_event": {
      const kind = EVENT_KIND_LABEL[params.eventKind ?? "tour"]();
      return {
        title: params.cancelled
          ? m.ntfAdmissionEventCancelled({ kind })
          : params.updated
            ? m.ntfAdmissionEventMoved({ kind })
            : m.ntfAdmissionEvent({ kind }),
        body: [
          title,
          [
            date ? formatDate(date, "weekday") : "",
            params.startTime ? formatTime(params.startTime) : "",
          ]
            .filter(Boolean)
            .join(" "),
          params.location ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
  }
  return { title: "", body: "" };
}

/** Where each workspace reads its messages. */
export const MESSAGES = {
  staff: "/messages",
  family: "/family/messages",
  me: "/me/messages",
} as const;

type Passed = Omit<ComponentProps<"a">, "href" | "children">;

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
      if (notice.params.peerReview)
        return (
          <Link
            {...rest}
            to="/assignments/$assignmentId"
            params={{ assignmentId: id }}
            search={{ tab: "reviews" }}
          >
            {children}
          </Link>
        );
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
        <Link {...rest} to="/family/consents">
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
    case "reply":
      return (
        <Link
          {...rest}
          to="/assignments/$assignmentId"
          params={{ assignmentId: notice.subjectId }}
          search={{}}
        >
          {children}
        </Link>
      );
    case "enquiry":
      return (
        <Link
          {...rest}
          to="/admissions/enquiries/$enquiryId"
          params={{ enquiryId: id }}
        >
          {children}
        </Link>
      );
    case "assignment":
    case "feedback":
      return notice.params.studentId ? (
        <Link
          {...rest}
          to="/family/assignments"
          search={{
            studentId: notice.params.studentId,
            assignment: notice.subjectId,
          }}
        >
          {children}
        </Link>
      ) : (
        <Link
          {...rest}
          to="/assignments/$assignmentId"
          params={{ assignmentId: notice.subjectId }}
          search={{}}
        >
          {children}
        </Link>
      );
    case "grades":
      return notice.params.studentId ? (
        <Link
          {...rest}
          to="/family/grades"
          search={{ studentId: notice.params.studentId }}
        >
          {children}
        </Link>
      ) : (
        <Link {...rest} to="/me/grades">
          {children}
        </Link>
      );
    case "application":
      return notice.params.received || notice.params.toFamily ? (
        <Link {...rest} to="/family/applications">
          {children}
        </Link>
      ) : (
        <Link
          {...rest}
          to="/admissions/applications/$applicationId"
          params={{ applicationId: id }}
        >
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
    case "reenrolment":
      return (
        <Link
          {...rest}
          to="/family"
          search={{ child: notice.params.studentId || undefined }}
        >
          {children}
        </Link>
      );
    case "admission_event":
      return notice.params.applicationId ? (
        <Link
          {...rest}
          to="/admissions/applications/$applicationId"
          params={{ applicationId: notice.params.applicationId }}
        >
          {children}
        </Link>
      ) : null;
  }
  return null;
}
