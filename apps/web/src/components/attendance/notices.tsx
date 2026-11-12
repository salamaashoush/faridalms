import { Link } from "@tanstack/react-router";
import { ClipboardCheck, UserX } from "lucide-react";

import type { NoticeLinkProps } from "~/components/notifications/slots";

import { noticeWords } from "~/components/notifications/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";
import { fill } from "~/utils/extension";

const both = (en?: string, ar?: string) => inLocale(en || null, ar || null);

function AbsenceLink({
  notice,
  workspace: _workspace,
  ...rest
}: NoticeLinkProps) {
  return (
    <Link
      {...rest}
      to="/family/attendance"
      search={{ studentId: notice.params.studentId || undefined }}
    />
  );
}

/** An absence a family is told of, and the school's answer to one it reported. */
export const ATTENDANCE_NOTICES = fill(noticeWords, {
  kind: "absence",
  icon: UserX,
  label: m.ntfKindAbsence,
  offered: (workspace) => workspace === "family",
  text: ({ params }) => {
    const name = both(params.studentName, params.studentNameAr);
    const date = params.date ? formatDate(params.date) : "";
    if (params.report)
      return {
        title: (params.report === "accepted"
          ? m.ntfReportAccepted
          : m.ntfReportDeclined)({ name }),
        body: date,
      };
    return {
      title: m.ntfAbsence({ name }),
      body: [date, both(params.className, params.classNameAr)]
        .filter(Boolean)
        .join(" · "),
    };
  },
  Link: AbsenceLink,
});

function RegisterLink({
  notice,
  workspace: _workspace,
  ...rest
}: NoticeLinkProps) {
  return (
    <Link
      {...rest}
      to="/registers/$classId"
      params={{ classId: notice.subjectId }}
      search={{ date: notice.params.date ?? "" }}
    />
  );
}

/** A register still to take, for the class's teacher. */
export const REGISTER_REMINDERS = fill(noticeWords, {
  kind: "reminder",
  icon: ClipboardCheck,
  sends: (notice) => !notice.params.cover,
  text: ({ params }) => ({
    title: m.ntfReminder({ name: both(params.className, params.classNameAr) }),
    body: params.date ? formatDate(params.date) : "",
  }),
  Link: RegisterLink,
});
