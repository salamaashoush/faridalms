import { Link } from "@tanstack/react-router";
import { School } from "lucide-react";

import type { NoticeLinkProps } from "~/components/notifications/slots";

import { noticeWords } from "~/components/notifications/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

function ReenrolmentLink({
  notice,
  workspace: _workspace,
  ...rest
}: NoticeLinkProps) {
  return (
    <Link
      {...rest}
      to="/family"
      search={{ child: notice.params.studentId || undefined }}
    />
  );
}

/** A family asked whether their child returns next year. */
export const YEARS_NOTICES = fill(noticeWords, {
  kind: "reenrolment",
  icon: School,
  label: m.ntfKindReenrolment,
  text: ({ params }) => ({
    title: m.ntfReenrolmentTitle({
      name: inLocale(params.studentName || null, params.studentNameAr || null),
    }),
    body: m.ntfReenrolmentBody({
      year: inLocale(params.title || null, params.titleAr || null),
    }),
  }),
  Link: ReenrolmentLink,
});
