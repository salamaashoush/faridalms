import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { History, Users } from "lucide-react";
import * as v from "valibot";

import { FamilyBrief } from "~/components/coursework/FamilyBrief";
import { TO_DO, WorkSection } from "~/components/coursework/LearnerList";
import { SharedWork } from "~/components/coursework/SharedWork";
import { displayName } from "~/components/people/format";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { childCourseworkQuery } from "~/queries/coursework";
import { childrenQuery } from "~/queries/families";
import { currentUserQuery } from "~/queries/user";
import { useWords } from "~/utils/words";

const WEEK_MS = 7 * 86_400_000;
const RECENT_MS = 14 * 86_400_000;

export const Route = createFileRoute("/_app/family/assignments")({
  validateSearch: v.object({
    studentId: v.optional(v.pipe(v.string(), v.uuid())),
    /** The piece open in the side panel, so a notice can open it. */
    assignment: v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined),
    /** The work of classes that ended, in place of those still running. */
    ended: v.fallback(v.optional(v.boolean(), false), false),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const children = await context.queryClient.ensureQueryData(
      childrenQuery(user.id),
    );
    const child = deps.studentId ?? children[0]?.studentId;
    if (child)
      await context.queryClient.ensureQueryData(
        childCourseworkQuery(child, deps.ended),
      );
  },
  component: FamilyCourseworkPage,
});

interface ChildWorkProps {
  studentId: string;
  ended: boolean;
  open: string | undefined;
  onOpen: (assignmentId: string | undefined) => void;
}

function ChildWork({ studentId, ended, open, onOpen }: ChildWorkProps) {
  const words = useWords();
  const { rows, now } = useSuspenseQuery(
    childCourseworkQuery(studentId, ended),
  ).data;
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
          title={words(m.courseworkFamilyEarlierCore)()}
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
  const children = useSuspenseQuery(childrenQuery(user.id)).data;
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
        search: (previous) => ({
          ...previous,
          studentId: next || undefined,
          assignment: undefined,
        }),
      });
    },
  };
  return (
    <Page width="list">
      <PageHeader
        title={m.courseworkTitlePage()}
        description={m.courseworkFamilyHint()}
        menu={
          current
            ? [
                {
                  label: search.ended
                    ? m.courseworkCurrentClasses()
                    : m.courseworkEndedClasses(),
                  icon: History,
                  onSelect: () => {
                    void navigate({
                      search: (previous) => ({
                        ...previous,
                        ended: !search.ended,
                        assignment: undefined,
                      }),
                    });
                  },
                },
              ]
            : []
        }
      />
      {current ? (
        <div className="grid gap-6">
          {children.length > 1 ? <IndexToolbar facets={[childFacet]} /> : null}
          <ChildWork
            studentId={current}
            ended={search.ended}
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
