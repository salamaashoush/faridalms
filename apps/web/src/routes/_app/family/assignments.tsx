import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import * as v from "valibot";

import { FamilyBrief } from "~/components/coursework/FamilyBrief";
import { TO_DO, WorkSection } from "~/components/coursework/LearnerList";
import { SharedWork } from "~/components/coursework/SharedWork";
import { displayName } from "~/components/people/format";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { childCourseworkQuery } from "~/queries/coursework";
import { personRecordQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";

const WEEK_MS = 7 * 86_400_000;
const RECENT_MS = 14 * 86_400_000;

export const Route = createFileRoute("/_app/family/assignments")({
  validateSearch: v.object({
    studentId: v.optional(v.pipe(v.string(), v.uuid())),
    /** The piece open in the side panel, so a notice can open it. */
    assignment: v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const me = await context.queryClient.ensureQueryData(
      personRecordQuery(user.id),
    );
    const child = deps.studentId ?? me.children[0]?.studentId;
    if (child)
      await context.queryClient.ensureQueryData(childCourseworkQuery(child));
  },
  component: FamilyCourseworkPage,
});

interface ChildWorkProps {
  studentId: string;
  open: string | undefined;
  onOpen: (assignmentId: string | undefined) => void;
}

function ChildWork({ studentId, open, onOpen }: ChildWorkProps) {
  const { rows, now } = useSuspenseQuery(childCourseworkQuery(studentId)).data;
  const at = Date.parse(now);
  const missing = rows.filter((row) => row.state === "missing");
  const week = rows.filter(
    (row) =>
      TO_DO.includes(row.state) &&
      row.dueAt !== null &&
      Date.parse(row.dueAt) - at <= WEEK_MS,
  );
  const waiting = rows.filter(
    (row) => row.state === "handed_in" || row.state === "handed_in_late",
  );
  const recent = (row: (typeof rows)[number]) =>
    row.releasedAt !== null && at - Date.parse(row.releasedAt) <= RECENT_MS;
  const returned = rows.filter(
    (row) => row.state === "returned" && recent(row),
  );
  const earlier = rows
    .filter((row) => row.state === "returned" && !recent(row))
    .toSorted((a, b) => (b.releasedAt ?? "").localeCompare(a.releasedAt ?? ""));
  const props = {
    linked: false,
    onOpen: (item: { assignmentId: string }) => onOpen(item.assignmentId),
  };
  return (
    <div className="grid gap-6">
      <WorkSection
        title={m.courseworkFamilyMissing()}
        items={missing}
        empty={m.courseworkNothingMissing()}
        {...props}
      />
      <WorkSection
        title={m.courseworkFamilyThisWeek()}
        items={week}
        empty={m.courseworkNothingThisWeek()}
        {...props}
      />
      <WorkSection
        title={m.courseworkFamilyWaiting()}
        items={waiting}
        empty={m.courseworkNothingWaiting()}
        {...props}
      />
      <WorkSection
        title={m.courseworkFamilyReturned()}
        items={returned}
        empty={m.courseworkNothingReturned()}
        {...props}
      />
      {earlier.length > 0 ? (
        <WorkSection
          title={m.courseworkFamilyEarlier()}
          items={earlier}
          empty={m.courseworkNothingReturned()}
          {...props}
        />
      ) : null}
      <SharedWork studentId={studentId} />
      {open ? (
        <FamilyBrief
          studentId={studentId}
          assignmentId={open}
          title={rows.find((row) => row.assignmentId === open)?.title ?? ""}
          onClose={() => onOpen(undefined)}
        />
      ) : null}
    </div>
  );
}

function FamilyCourseworkPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const me = useSuspenseQuery(personRecordQuery(user.id)).data;
  const children = me.children;
  const current = search.studentId ?? children[0]?.studentId;
  const childFacet: Facet = {
    id: "child",
    label: m.courseworkChild(),
    single: true,
    options: children.map((child) => ({
      value: child.studentId,
      label: displayName(child),
    })),
    selected: current ? [current] : [],
    defaultSelected: children[0] ? [children[0].studentId] : [],
    onChange: ([next]) => {
      void navigate({
        search: { studentId: next || undefined, assignment: undefined },
      });
    },
  };
  return (
    <Page width="list">
      <PageHeader
        title={m.courseworkTitlePage()}
        description={m.courseworkFamilyHint()}
      />
      {current ? (
        <div className="grid gap-6">
          {children.length > 1 ? <IndexToolbar facets={[childFacet]} /> : null}
          <ChildWork
            studentId={current}
            open={search.assignment}
            onOpen={(assignment) =>
              void navigate({
                search: (previous) => ({ ...previous, assignment }),
              })
            }
          />
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      )}
    </Page>
  );
}
