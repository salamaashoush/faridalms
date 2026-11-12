import type { Workspace } from "@faridalms/domain/workspace";

import { Link } from "@tanstack/react-router";
import {
  ClipboardList,
  GraduationCap,
  MessageSquareText,
  Reply,
} from "lucide-react";

import type { NoticeLinkProps } from "~/components/notifications/slots";
import type { Filling } from "~/utils/extension";

import { noticeWords } from "~/components/notifications/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";
import { fill } from "~/utils/extension";

const both = (en?: string, ar?: string) => inLocale(en || null, ar || null);

const learners = (workspace: Workspace) =>
  workspace === "me" || workspace === "family";

/** Work set, returned or graded: a family's view of a child's, or the work itself. */
function WorkLink({ notice, workspace: _workspace, ...rest }: NoticeLinkProps) {
  return notice.params.studentId ? (
    <Link
      {...rest}
      to="/family/assignments"
      search={{
        studentId: notice.params.studentId,
        assignment: notice.subjectId,
      }}
    />
  ) : (
    <Link
      {...rest}
      to="/assignments/$assignmentId"
      params={{ assignmentId: notice.subjectId }}
      search={{}}
    />
  );
}

function GradesLink({
  notice,
  workspace: _workspace,
  ...rest
}: NoticeLinkProps) {
  return notice.params.studentId ? (
    <Link
      {...rest}
      to="/family/grades"
      search={{ studentId: notice.params.studentId }}
    />
  ) : (
    <Link {...rest} to="/me/grades" />
  );
}

function ReplyLink({
  notice,
  workspace: _workspace,
  ...rest
}: NoticeLinkProps) {
  return (
    <Link
      {...rest}
      to="/assignments/$assignmentId"
      params={{ assignmentId: notice.subjectId }}
      search={{}}
    />
  );
}

/** Coursework's notices: work set, feedback and grades, and replies in a discussion. */
export const COURSEWORK_NOTICES: Filling[] = [
  fill(noticeWords, {
    kind: "assignment",
    icon: ClipboardList,
    label: m.ntfKindAssignment,
    offered: learners,
    text: ({ params }) => ({
      title: params.studentName
        ? m.ntfAssignmentFor({
            name: both(params.studentName, params.studentNameAr),
          })
        : m.ntfAssignment(),
      body: [
        both(params.title, params.titleAr),
        both(params.className, params.classNameAr),
        params.date ? m.ntfDue({ date: formatDate(params.date) }) : "",
      ]
        .filter(Boolean)
        .join(" · "),
    }),
    Link: WorkLink,
  }),
  fill(noticeWords, {
    kind: "feedback",
    icon: MessageSquareText,
    label: m.ntfKindFeedback,
    offered: learners,
    text: ({ params }) => {
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
        body: [
          both(params.title, params.titleAr),
          both(params.className, params.classNameAr),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    },
    Link: WorkLink,
  }),
  fill(noticeWords, {
    kind: "grades",
    icon: GraduationCap,
    label: m.ntfKindGrades,
    offered: learners,
    text: ({ params }) => ({
      title: params.studentName
        ? m.ntfGradesFor({
            name: both(params.studentName, params.studentNameAr),
          })
        : m.ntfGrades(),
      body: [
        both(params.title, params.titleAr),
        both(params.className, params.classNameAr),
      ]
        .filter(Boolean)
        .join(" · "),
    }),
    Link: GradesLink,
  }),
  fill(noticeWords, {
    kind: "reply",
    icon: Reply,
    label: m.ntfKindReply,
    offered: (workspace, capabilities) =>
      workspace === "me" || capabilities.includes("submissions:grade"),
    text: (notice) => ({
      title: m.ntfReply({
        name:
          both(notice.params.actorName, notice.params.actorNameAr) ||
          inLocale(notice.actorNameEn, notice.actorNameAr),
      }),
      body: both(notice.params.title, notice.params.titleAr),
    }),
    Link: ReplyLink,
  }),
];
