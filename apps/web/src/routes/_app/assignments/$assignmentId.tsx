import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import {
  AssignmentRecord,
  RECORD_TABS,
} from "~/components/coursework/AssignmentRecord";
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
    section: ["/teach/assignments", "/me/assignments"],
  },
  validateSearch: v.object({
    tab: v.fallback(v.optional(v.picklist(RECORD_TABS), "brief"), "brief"),
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

function TeacherTrail({ id }: { id: string }) {
  const data = useSuspenseQuery(assignmentRecordQuery(id)).data;
  return <BreadcrumbCurrent>{data.title}</BreadcrumbCurrent>;
}

function LearnerTrail({ id }: { id: string }) {
  const data = useSuspenseQuery(myWorkQuery(id)).data;
  return <BreadcrumbCurrent>{data.assignment.title}</BreadcrumbCurrent>;
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
  const { tab } = Route.useSearch();
  const { auth } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  if (learns(auth.workspace))
    return <LearnerWork assignmentId={assignmentId} />;
  return (
    <AssignmentRecord
      assignmentId={assignmentId}
      tab={tab}
      onTab={(next) => {
        void navigate({ search: (previous) => ({ ...previous, tab: next }) });
      }}
    />
  );
}
