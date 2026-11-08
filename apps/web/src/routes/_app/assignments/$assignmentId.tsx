import type { ContentLocale } from "@faridalms/domain/translations";

import { CONTENT_LOCALES } from "@faridalms/domain/translations";
import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { LtiHostProvider } from "~/components/content/lti";
import {
  AssignmentRecord,
  RECORD_TABS,
} from "~/components/coursework/AssignmentRecord";
import {
  BriefReading,
  readingOf,
  titleRead,
} from "~/components/coursework/BriefLanguage";
import { LearnerWork } from "~/components/coursework/LearnerWork";
import { assignmentRecordQuery, myWorkQuery } from "~/queries/coursework";

const learns = (workspace: string | null) => workspace === "me";

/**
 * One address for a piece of work: its teacher reads the brief and everyone's
 * standing, a student reads the brief and works on their own attempt.
 */
export const Route = createFileRoute("/_app/assignments/$assignmentId")({
  staticData: {
    trail: <AssignmentTrail />,
    section: ["/assignments", "/me/assignments"],
  },
  validateSearch: v.object({
    tab: v.fallback(v.optional(v.picklist(RECORD_TABS), "brief"), "brief"),
    /** The language the brief is read in, where it has two. */
    read: v.fallback(v.optional(v.picklist(CONTENT_LOCALES)), undefined),
  }),
  loader: async ({ context, params }) => {
    if (learns(context.auth.workspace))
      await context.queryClient.ensureQueryData(
        myWorkQuery(params.assignmentId),
      );
    else
      await context.queryClient.ensureQueryData(
        assignmentRecordQuery(params.assignmentId),
      );
  },
  component: AssignmentPage,
});

interface TeacherTrailProps {
  id: string;
}

function TeacherTrail({ id }: TeacherTrailProps) {
  const { read } = Route.useSearch();
  const data = useSuspenseQuery(assignmentRecordQuery(id)).data;
  return (
    <BreadcrumbCurrent>
      {titleRead(data, readingOf(data, read))}
    </BreadcrumbCurrent>
  );
}

interface LearnerTrailProps {
  id: string;
}

function LearnerTrail({ id }: LearnerTrailProps) {
  const { read } = Route.useSearch();
  const data = useSuspenseQuery(myWorkQuery(id)).data;
  const brief = {
    title: data.assignment.title,
    language: data.assignment.language,
    translation: data.translation,
  };
  return (
    <BreadcrumbCurrent>
      {titleRead(brief, readingOf(brief, read))}
    </BreadcrumbCurrent>
  );
}

function AssignmentTrail() {
  const { assignmentId } = Route.useParams();
  const { auth } = Route.useRouteContext();
  return learns(auth.workspace) ? (
    <LearnerTrail id={assignmentId} />
  ) : (
    <TeacherTrail id={assignmentId} />
  );
}

function AssignmentPage() {
  const { assignmentId } = Route.useParams();
  const { tab, read } = Route.useSearch();
  const { auth } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  const reading = {
    read,
    onRead: (locale: ContentLocale) =>
      void navigate({
        search: (previous) => ({ ...previous, read: locale }),
        replace: true,
      }),
  };
  return (
    <BriefReading value={reading}>
      <LtiHostProvider type="assignment" id={assignmentId}>
        {learns(auth.workspace) ? (
          <LearnerWork assignmentId={assignmentId} />
        ) : (
          <AssignmentRecord
            assignmentId={assignmentId}
            tab={tab}
            onTab={(next) => {
              void navigate({
                resetScroll: false,
                replace: true,
                search: (previous) => ({ ...previous, tab: next }),
              });
            }}
          />
        )}
      </LtiHostProvider>
    </BriefReading>
  );
}
