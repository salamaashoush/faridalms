import { cn } from "@faridalms/ui/cn";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { phoneLink, RecordSection } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardList,
  HeartPulse,
  IdCard,
  Layers,
  Table2,
  UserCheck,
  Users,
} from "lucide-react";

import { displayName } from "~/components/people/format";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { personRecordQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/family/children")({
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    await context.queryClient.ensureQueryData(personRecordQuery(user.id));
  },
  component: ChildrenPage,
});

const link =
  "inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted";

/** Each child with the places a family follows them: work, grades, attendance, week and modules. */
function ChildrenPage() {
  const user = useCurrentUser();
  const children = useSuspenseQuery(personRecordQuery(user.id)).data.children;
  const modules = user.modules.elearning;
  return (
    <>
      <PageHeader title={m.navChildren()} description={m.homeChildrenHint()} />
      {children.length === 0 ? (
        <EmptyState
          icon={Users}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {children.map((child) => {
            const search = { studentId: child.studentId };
            return (
              <RecordSection
                key={child.studentId}
                title={displayName(child)}
                description={
                  child.relation
                    ? inLocale(child.relation.labelEn, child.relation.labelAr)
                    : undefined
                }
              >
                <ul className="flex flex-wrap gap-2">
                  <li>
                    <Link
                      to="/family/assignments"
                      search={search}
                      className={cn(link, phoneLink)}
                    >
                      <ClipboardList aria-hidden className="size-4" />
                      {m.navCoursework()}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/family/grades"
                      search={search}
                      className={cn(link, phoneLink)}
                    >
                      <BookOpen aria-hidden className="size-4" />
                      {m.navGrades()}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/family/attendance"
                      search={search}
                      className={cn(link, phoneLink)}
                    >
                      <UserCheck aria-hidden className="size-4" />
                      {m.navAttendance()}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/family/timetable"
                      search={search}
                      className={cn(link, phoneLink)}
                    >
                      <Table2 aria-hidden className="size-4" />
                      {m.navTimetable()}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/family/details"
                      search={search}
                      className={cn(link, phoneLink)}
                    >
                      <IdCard aria-hidden className="size-4" />
                      {m.familyDetails()}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/family/health"
                      search={search}
                      className={cn(link, phoneLink)}
                    >
                      <HeartPulse aria-hidden className="size-4" />
                      {m.medicalTitleShort()}
                    </Link>
                  </li>
                  {modules ? (
                    <li>
                      <Link
                        to="/family/modules"
                        search={search}
                        className={cn(link, phoneLink)}
                      >
                        <Layers aria-hidden className="size-4" />
                        {m.navModules()}
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </RecordSection>
            );
          })}
        </div>
      )}
    </>
  );
}
