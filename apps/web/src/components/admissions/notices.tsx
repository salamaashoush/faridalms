import type { ApplicationOutcome } from "@faridalms/domain/notifications";

import { Link } from "@tanstack/react-router";
import { CalendarClock, FileUser, UserPlus } from "lucide-react";

import type { NoticeLinkProps } from "~/components/notifications/slots";
import type { Filling } from "~/utils/extension";

import { noticeWords } from "~/components/notifications/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate, formatTime } from "~/utils/datetime";
import { fill } from "~/utils/extension";

import { EVENT_KIND_LABEL } from "./application-labels";

const both = (en?: string, ar?: string) => inLocale(en || null, ar || null);

/** What a notice about an application's move is headed, for the applicant and for the office. */
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

function EnquiryLink({
  notice,
  workspace: _workspace,
  ...rest
}: NoticeLinkProps) {
  return (
    <Link
      {...rest}
      to="/admissions/enquiries/$enquiryId"
      params={{ enquiryId: notice.subjectId }}
    />
  );
}

function ApplicationLink({ notice, workspace, ...rest }: NoticeLinkProps) {
  if (!notice.params.received && !notice.params.toFamily)
    return (
      <Link
        {...rest}
        to="/admissions/applications/$applicationId"
        params={{ applicationId: notice.subjectId }}
      />
    );
  return workspace === "me" ? (
    <Link {...rest} to="/me/applications" />
  ) : (
    <Link {...rest} to="/family/applications" />
  );
}

function AdmissionEventLink({
  notice,
  workspace: _workspace,
  children,
  ...rest
}: NoticeLinkProps) {
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

/** Admissions' notices: enquiries for those who work them, applications as they move, and tours and interviews. */
export const ADMISSIONS_NOTICES: Filling[] = [
  fill(noticeWords, {
    kind: "enquiry",
    icon: UserPlus,
    label: m.ntfKindEnquiry,
    offered: (_workspace, capabilities) =>
      capabilities.includes("admissions:manage"),
    text: (notice) => ({
      title: notice.params.assigned
        ? m.ntfEnquiryAssigned({
            name:
              both(notice.params.actorName, notice.params.actorNameAr) ||
              inLocale(notice.actorNameEn, notice.actorNameAr),
          })
        : ENQUIRY_TITLE[notice.params.purpose ?? "enquiry"](),
      body: [
        both(notice.params.title, notice.params.titleAr),
        notice.params.preview ?? "",
      ]
        .filter(Boolean)
        .join(" · "),
    }),
    Link: EnquiryLink,
  }),
  fill(noticeWords, {
    kind: "application",
    icon: FileUser,
    label: m.ntfKindApplication,
    offered: (_workspace, capabilities) =>
      capabilities.includes("admissions:manage") ||
      capabilities.includes("applications:submit"),
    text: ({ params }) => {
      const title = both(params.title, params.titleAr);
      const intake = both(params.intakeName, params.intakeNameAr);
      if (params.outcome)
        return {
          title: OUTCOME_TITLE[params.outcome](),
          body: [title, intake].filter(Boolean).join(" · "),
        };
      return params.received
        ? {
            title: m.ntfApplicationReceived(),
            body: m.ntfApplicationReceivedBody({
              child: title,
              intake,
              reference: params.reference ?? "",
            }),
          }
        : {
            title: m.ntfApplication(),
            body: [title, intake].filter(Boolean).join(" · "),
          };
    },
    Link: ApplicationLink,
  }),
  fill(noticeWords, {
    kind: "admission_event",
    icon: CalendarClock,
    label: m.ntfKindAdmissionEvent,
    text: ({ params }) => {
      const kind = EVENT_KIND_LABEL[params.eventKind ?? "tour"]();
      return {
        title: params.cancelled
          ? m.ntfAdmissionEventCancelled({ kind })
          : params.updated
            ? m.ntfAdmissionEventMoved({ kind })
            : m.ntfAdmissionEvent({ kind }),
        body: [
          both(params.title, params.titleAr),
          [
            params.date ? formatDate(params.date, "weekday") : "",
            params.startTime ? formatTime(params.startTime) : "",
          ]
            .filter(Boolean)
            .join(" "),
          params.location ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    },
    Link: AdmissionEventLink,
  }),
];
