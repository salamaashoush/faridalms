import { Link } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";

import type { NoticeLinkProps } from "~/components/notifications/slots";

import { noticeWords } from "~/components/notifications/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import { usePageOn } from "~/hooks/usePageOn";
import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";
import { fill } from "~/utils/extension";

const both = (en?: string, ar?: string) => inLocale(en || null, ar || null);

/** The register of the lesson covered, where the school takes registers; the timetable otherwise. */
function CoverLink({
  notice,
  workspace: _workspace,
  ...rest
}: NoticeLinkProps) {
  const opens = usePageOn();
  if (notice.params.cancelled || !opens("/registers"))
    return <Link {...rest} to="/timetable" />;
  return (
    <Link
      {...rest}
      to="/registers/$classId"
      params={{ classId: notice.subjectId }}
      search={{ date: notice.params.date ?? "" }}
    />
  );
}

/** A lesson a teacher covers, or no longer covers. */
export const COVER_NOTICES = fill(noticeWords, {
  kind: "reminder",
  icon: ClipboardCheck,
  sends: (notice) => Boolean(notice.params.cover),
  text: ({ params }) => ({
    title: (params.cancelled ? m.ntfCoverOff : m.ntfCover)({
      name: both(params.className, params.classNameAr),
    }),
    body: [
      params.date ? formatDate(params.date) : "",
      both(params.periodName, params.periodNameAr),
    ]
      .filter(Boolean)
      .join(" · "),
  }),
  Link: CoverLink,
});
