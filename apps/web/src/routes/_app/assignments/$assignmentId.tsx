import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import {
  LEARNER_TABS,
  LearnerAssignmentRecord,
} from "~/components/assignments/LearnerAssignmentRecord";
import {
  TEACHER_TABS,
  TeacherAssignmentRecord,
} from "~/components/assignments/TeacherAssignmentRecord";
import * as m from "~/i18n/messages";
import {
  assignmentWorkspaceQuery,
  attemptReviewQuery,
  learnerAssignmentQuery,
} from "~/queries/assignments";
import { visibleStudentsQuery } from "~/queries/school";

const LEARNER_STATES = [
  "all",
  "scheduled",
  "not_started",
  "draft",
  "submitted",
  "returned",
  "missing",
] as const;

/**
 * One canonical record for every role. Teachers get the workspace, learners
 * and families get the brief and the work; the API decides which the caller
 * may read.
 */
export const Route = createFileRoute("/_app/assignments/$assignmentId")({
  staticData: { breadcrumb: m.assignmentsTitle },
  validateSearch: v.object({
    tab: v.optional(v.picklist([...TEACHER_TABS, ...LEARNER_TABS]), "overview"),
    studentId: v.optional(v.string(), ""),
    attempt: v.optional(v.string(), ""),
    q: v.optional(v.string(), ""),
    state: v.optional(v.picklist(LEARNER_STATES), "all"),
    page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
  loaderDeps: ({ search }) => ({
    studentId: search.studentId,
    attempt: search.attempt,
  }),
  loader: async ({ context, params, deps }) => {
    const role = context.auth.workspace;
    if (role === "teach" || role === "admin") {
      await context.queryClient.ensureQueryData(
        assignmentWorkspaceQuery(params.assignmentId),
      );
      if (deps.attempt)
        await context.queryClient.ensureQueryData(
          attemptReviewQuery(deps.attempt),
        );
      return;
    }
    await Promise.all([
      context.queryClient.ensureQueryData(
        learnerAssignmentQuery(params.assignmentId, deps.studentId),
      ),
      context.queryClient.ensureQueryData(visibleStudentsQuery),
    ]);
  },
  component: AssignmentPage,
});
function AssignmentPage() {
  const { assignmentId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { auth } = Route.useRouteContext();
  const patch = (change: Partial<typeof search>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  if (auth.workspace === "teach" || auth.workspace === "admin") {
    const tab = TEACHER_TABS.find((item) => item === search.tab) ?? "overview";
    return (
      <TeacherAssignmentRecord
        id={assignmentId}
        search={{ ...search, tab }}
        onSearch={patch}
      />
    );
  }
  const tab = LEARNER_TABS.find((item) => item === search.tab) ?? "brief";
  return (
    <LearnerAssignmentRecord
      id={assignmentId}
      studentId={search.studentId}
      tab={tab}
      family={auth.workspace === "family"}
      onTab={(next) => patch({ tab: next })}
      onStudent={(studentId) => patch({ studentId })}
    />
  );
}
