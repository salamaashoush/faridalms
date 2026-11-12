import { Link } from "@tanstack/react-router";
import { HeartPulse } from "lucide-react";

import type { NoticeLinkProps } from "~/components/notifications/slots";
import type { ModuleFillings } from "~/utils/extension";

import { noticeWords } from "~/components/notifications/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { replaceWords } from "~/utils/words";

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
    replaceWords(m.healthReportIntroCore, m.healthReportIntro),
    replaceWords(m.healthReportShareCore, m.healthReportShare),
    replaceWords(m.healthReportShareHintCore, m.healthReportShareHint),
    replaceWords(m.healthReportUnshareCore, m.healthReportUnshare),
    replaceWords(m.healthReportSharedCore, m.healthReportShared),
    replaceWords(m.healthReportNotSharedCore, m.healthReportNotShared),
    replaceWords(m.healthReportSharedDoneCore, m.healthReportSharedDone),
    replaceWords(m.healthReportUnsharedDoneCore, m.healthReportUnsharedDone),
    replaceWords(m.healthChangesHintCore, m.healthChangesHint),
    replaceWords(m.healthChangesCaptionCore, m.healthChangesCaption),
    replaceWords(m.healthChangesAcceptHintCore, m.healthChangesAcceptHint),
    replaceWords(m.healthChangesShareReportCore, m.healthChangesShareReport),
    replaceWords(m.healthChangesDeclineHintCore, m.healthChangesDeclineHint),
    replaceWords(m.healthChangesReasonHintCore, m.healthChangesReasonHint),
    replaceWords(m.healthChangesAcceptedCore, m.healthChangesAccepted),
    replaceWords(m.healthChangesDeclinedCore, m.healthChangesDeclined),
    replaceWords(m.healthChangesEmptyAllCore, m.healthChangesEmptyAll),
    replaceWords(m.healthChangesEmptyBodyCore, m.healthChangesEmptyBody),
  ],
};
