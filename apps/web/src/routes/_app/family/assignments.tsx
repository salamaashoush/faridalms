import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import type { Facet } from "~/components/system/IndexPage";

import { FamilyBrief } from "~/components/coursework/FamilyBrief";
import { TO_DO, WorkSection } from "~/components/coursework/LearnerList";
import { SharedWork } from "~/components/coursework/SharedWork";
import { displayName } from "~/components/people/format";
import {
  EmptyState,
  IndexToolbar,
  PageHeader,
} from "~/components/system/IndexPage";
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

function ChildWork({ studentId }: { studentId: string }) {
  const user = useCurrentUser();
  const { rows, now } = useSuspenseQuery(childCourseworkQuery(studentId)).data;
  const at = Date.parse(now);
  const missing = rows.filter((row) => row.state === "missing");
  const week = rows.filter(
    (row) =>
      TO_DO.includes(row.state) &&
      row.dueAt !== null &&
      Date.parse(row.dueAt) - at <= WEEK_MS,
  );
  const returned = rows.filter(
    (row) =>
      row.state === "returned" &&
      row.releasedAt !== null &&
      at - Date.parse(row.releasedAt) <= RECENT_MS,
  );
  const [reading, setReading] = useState<{ id: string; title: string }>();
  const props = {
    timeZone: user.school.timeZone,
    linked: false,
    onOpen: (item: { assignmentId: string; title: string }) =>
      setReading({ id: item.assignmentId, title: item.title }),
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
        title={m.courseworkFamilyReturned()}
        items={returned}
        empty={m.courseworkNothingReturned()}
        {...props}
      />
      <SharedWork studentId={studentId} />
      {reading ? (
        <FamilyBrief
          studentId={studentId}
          assignmentId={reading.id}
          title={reading.title}
          onClose={() => setReading(undefined)}
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
      void navigate({ search: { studentId: next || undefined } });
    },
  };
  return (
    <>
      <PageHeader
        title={m.courseworkTitlePage()}
        description={m.courseworkFamilyHint()}
      />
      {current ? (
        <div className="grid gap-6">
          {children.length > 1 ? <IndexToolbar facets={[childFacet]} /> : null}
          <ChildWork studentId={current} />
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      )}
    </>
  );
}
