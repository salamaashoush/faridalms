import { cn } from "@faridalms/ui/cn";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
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
import { usePageOn } from "~/hooks/usePageOn";
import * as m from "~/i18n/messages";
import { childrenQuery } from "~/queries/families";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/family/children")({
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    await context.queryClient.ensureQueryData(childrenQuery(user.id));
  },
  component: ChildrenPage,
});

const link =
  "inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted";

/** The pages a family follows a child on, each where the school has it. */
const CHILD_PAGES = [
  { to: "/family/assignments", icon: ClipboardList, label: m.navCoursework },
  { to: "/family/grades", icon: BookOpen, label: m.navGrades },
  { to: "/family/attendance", icon: UserCheck, label: m.navAttendance },
  { to: "/family/timetable", icon: Table2, label: m.navTimetable },
  { to: "/family/details", icon: IdCard, label: m.familyDetails },
  { to: "/family/health", icon: HeartPulse, label: m.medicalTitleShort },
  { to: "/family/modules", icon: Layers, label: m.navModules },
] as const;

/** Each child with the places a family follows them: work, grades, attendance, week and modules. */
function ChildrenPage() {
  const user = useCurrentUser();
  const children = useSuspenseQuery(childrenQuery(user.id)).data;
  const opens = usePageOn();
  return (
    <Page width="list">
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
                  {CHILD_PAGES.filter((page) => opens(page.to)).map(
                    ({ to, icon: Icon, label }) => (
                      <li key={to}>
                        <Link
                          to={to}
                          search={search}
                          className={cn(link, phoneLink)}
                        >
                          <Icon aria-hidden className="size-4" />
                          {label()}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </RecordSection>
            );
          })}
        </div>
      )}
    </Page>
  );
}
