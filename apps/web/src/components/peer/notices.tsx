import { Link } from "@tanstack/react-router";
import { UsersRound } from "lucide-react";

import type { NoticeLinkProps } from "~/components/notifications/slots";

import { noticeWords } from "~/components/notifications/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";
import { fill } from "~/utils/extension";

function ReviewsLink({
  notice,
  workspace: _workspace,
  ...rest
}: NoticeLinkProps) {
  return (
    <Link
      {...rest}
      to="/assignments/$assignmentId"
      params={{ assignmentId: notice.subjectId }}
      search={{ tab: "reviews" }}
    />
  );
}

/** Reviews handed out to a student, and their reminder before they are due. */
export const PEER_NOTICES = fill(noticeWords, {
  kind: "peer_review",
  icon: UsersRound,
  text: ({ params }) => ({
    title: params.dueSoon ? m.ntfPeerDue() : m.ntfPeerHandedOut(),
    body: [
      inLocale(params.title || null, params.titleAr || null),
      params.date ? m.ntfDue({ date: formatDate(params.date) }) : "",
    ]
      .filter(Boolean)
      .join(" · "),
  }),
  Link: ReviewsLink,
});
