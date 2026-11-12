import { Link } from "@tanstack/react-router";
import { HeartPulse } from "lucide-react";

import type { NoticeLinkProps } from "~/components/notifications/slots";
import type { ModuleFillings } from "~/utils/extension";

import { noticeWords } from "~/components/notifications/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

function HealthLink({
  notice,
  workspace: _workspace,
  ...rest
}: NoticeLinkProps) {
  return (
    <Link
      {...rest}
      to="/family/health"
      search={{ studentId: notice.params.studentId || undefined }}
    />
  );
}

/** The school's answer to a change a family asked of a child's health record. */
export const STUDENT_RECORDS_WITH_FAMILIES: ModuleFillings = {
  module: "student_records",
  needs: ["families"],
  fillings: [
    fill(noticeWords, {
      kind: "correction",
      icon: HeartPulse,
      text: ({ params }) => ({
        title: (params.report === "accepted"
          ? m.ntfCorrectionAccepted
          : m.ntfCorrectionDeclined)({
          name: inLocale(
            params.studentName || null,
            params.studentNameAr || null,
          ),
        }),
        body: m.ntfCorrectionBody(),
      }),
      Link: HealthLink,
    }),
  ],
};
