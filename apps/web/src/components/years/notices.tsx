import { Link } from "@tanstack/react-router";
import { School } from "lucide-react";

import type { NoticeLinkProps } from "~/components/notifications/slots";

import { noticeWords } from "~/components/notifications/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

function ReenrolmentLink({ notice, workspace, ...rest }: NoticeLinkProps) {
  if (notice.params.own && workspace === "me")
    return <Link {...rest} to="/me" />;
  return (
    <Link
      {...rest}
      to="/family"
      search={{ child: notice.params.studentId || undefined }}
    />
  );
}

/** Whoever decides for a learner asked whether they return next year: a family, or the learner themself. */
export const YEARS_NOTICES = fill(noticeWords, {
  kind: "reenrolment",
  icon: School,
  label: m.ntfKindReenrolment,
  text: ({ params }) => {
    const year = inLocale(params.title || null, params.titleAr || null);
    return params.own
      ? {
          title: m.learnerNextYearTitle({ year }),
          body: m.ntfReenrolmentOwnBody({ year }),
        }
      : {
          title: m.ntfReenrolmentTitle({
            name: inLocale(
              params.studentName || null,
              params.studentNameAr || null,
            ),
          }),
          body: m.ntfReenrolmentBody({ year }),
        };
  },
  Link: ReenrolmentLink,
});
