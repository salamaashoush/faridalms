import type { HeaderAction } from "@faridalms/ui/system/page-header";

import { Skeleton } from "@faridalms/ui/skeleton";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { RowLink } from "@faridalms/ui/system/data-table";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Fact, Facts, RecordTabs } from "@faridalms/ui/system/record-page";
import {
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Suspense, useState } from "react";
import * as v from "valibot";

import type { AccessRole } from "~/components/admin/AccessRolesPanel";
import type { Subject, SubjectSort } from "~/components/admin/SubjectCatalogue";

import {
  AccessRolesPanel,
  findRole,
  RoleSheet,
} from "~/components/admin/AccessRolesPanel";
import { OutsideTools } from "~/components/admin/OutsideTools";
import { SchoolProfileSection } from "~/components/admin/SchoolEditors";
import {
  filterSubjects,
  SUBJECT_PAGE_SIZE,
  SubjectCatalogue,
  subjectOf,
  SubjectSheet,
} from "~/components/admin/SubjectCatalogue";
import { AttendanceRules } from "~/components/attendance/AttendanceRules";
import { UsageBar } from "~/components/files/UsageBar";
import { FeaturesCard } from "~/components/learning/FeaturesCard";
import { lastDay } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { accessChangesQuery, accessRolesQuery } from "~/queries/access";
import { attendanceSettingsQuery } from "~/queries/attendance";
import { subjectsQuery } from "~/queries/classes";
import { ltiToolsQuery } from "~/queries/lti";
import {
  schoolFeaturesQuery,
  schoolProfileQuery,
  schoolStorageQuery,
} from "~/queries/school-settings";
import { peopleOptionsQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";
import { formatDate } from "~/utils/datetime";
import { requirePage } from "~/utils/page-access";

const searchSchema = v.object({
  section: v.optional(
    v.picklist(["school", "subjects", "attendance", "access", "tools"]),
    "school",
  ),
  q: v.optional(v.string(), ""),
  sort: v.optional(v.picklist(["name", "code"]), "name"),
  dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  // The open sheet: "new", or the subject or role being edited. A new role
  // may copy another one, named by "from".
  subject: v.optional(v.string()),
  role: v.optional(v.string()),
  from: v.optional(v.string()),
});
type Search = v.InferOutput<typeof searchSchema>;

export const Route = createFileRoute("/_app/_staff/settings")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ section: search.section }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "school:manage");
    const { queryClient } = context;
    if (deps.section === "school")
      await Promise.all([
        queryClient.ensureQueryData(schoolProfileQuery),
        queryClient.ensureQueryData(schoolFeaturesQuery),
        queryClient.ensureQueryData(peopleOptionsQuery),
      ]);
    else if (deps.section === "subjects")
      await queryClient.ensureQueryData(subjectsQuery);
    else if (deps.section === "attendance")
      await queryClient.ensureQueryData(attendanceSettingsQuery);
    else if (deps.section === "tools")
      await queryClient.ensureQueryData(ltiToolsQuery);
    else
      await Promise.all([
        queryClient.ensureQueryData(accessRolesQuery),
        queryClient.ensureQueryData(accessChangesQuery(1)),
      ]);
  },
  component: SettingsRoute,
});

/**
 * A sheet opened from the URL. It stays mounted while it closes, so it can
 * animate out with its content, and opening it again starts a fresh form.
 */
function useUrlSheet(value: string | undefined) {
  const [previous, setPrevious] = useState(value);
  const [shown, setShown] = useState(value ? { value, generation: 1 } : null);
  if (value !== previous) {
    setPrevious(value);
    if (value) setShown({ value, generation: (shown?.generation ?? 0) + 1 });
  }
  return { shown, open: Boolean(value) };
}

function SettingsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // An empty catalogue offers Add subject in its empty state instead, so the
  // page keeps one primary button.
  const subjects = (
    useQuery({ ...subjectsQuery, enabled: search.section === "subjects" }).data
      ?.rows ?? []
  ).map(subjectOf);
  const patch = (change: Partial<Search>, replace = false) => {
    void navigate({
      search: (previous) => ({ ...previous, ...change }),
      replace,
    });
  };
  const action: HeaderAction | undefined =
    search.section === "subjects" && subjects.length
      ? {
          label: m.settingsAddSubject(),
          icon: Plus,
          onClick: () => patch({ subject: "new" }),
        }
      : search.section === "access"
        ? {
            label: m.accessNewRole(),
            icon: Plus,
            onClick: () => patch({ role: "new", from: undefined }),
          }
        : undefined;
  return (
    <>
      <PageHeader
        title={m.adminSettingsTitle()}
        description={m.adminSettingsSubtitle()}
        action={action}
      />
      <RecordTabs
        label={m.adminSettingsTitle()}
        tabs={[
          { value: "school", label: m.settingsSchoolTab() },
          { value: "subjects", label: m.adminSubjectsSection() },
          { value: "attendance", label: m.attendanceTitle() },
          { value: "access", label: m.adminPermissionsSection() },
          { value: "tools", label: m.ltiTools() },
        ]}
        value={search.section}
        onChange={(section) => void navigate({ search: { section } })}
      >
        {search.section === "school" ? (
          <SchoolTab />
        ) : search.section === "subjects" ? (
          <SubjectsTab search={search} patch={patch} />
        ) : search.section === "attendance" ? (
          <SettingsPage>
            <AttendanceRules />
          </SettingsPage>
        ) : search.section === "tools" ? (
          <OutsideTools />
        ) : (
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <AccessTab search={search} patch={patch} />
          </Suspense>
        )}
      </RecordTabs>
    </>
  );
}

function SchoolTab() {
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  const year = options.years.find((row) => row.id === options.workingYearId);
  return (
    <SettingsPage>
      <SchoolProfileSection />
      <SettingsSection
        title={m.settingsWorkingYear()}
        description={m.settingsWorkingYearHint()}
        footer={
          <ButtonLink
            to="/academic-years"
            variant="outline"
            className="max-md:h-10"
          >
            {m.academicYearsManage()}
          </ButtonLink>
        }
      >
        {year ? (
          <Facts short>
            <Fact label={m.academicYearName()}>
              {inLocale(year.titleEn, year.titleAr)}
            </Fact>
            <Fact label={m.adminStartsOn()}>{formatDate(year.startsOn)}</Fact>
            <Fact label={m.adminEndsOn()}>
              {formatDate(lastDay(year.endsBefore))}
            </Fact>
          </Facts>
        ) : (
          <p className="text-sm leading-5 text-muted-foreground">
            {m.settingsNoWorkingYear()}
          </p>
        )}
      </SettingsSection>
      <FeaturesCard />
      <StorageSection />
    </SettingsPage>
  );
}

function StorageSection() {
  const storage = useQuery(schoolStorageQuery).data;
  return (
    <SettingsSection
      title={m.settingsStorage()}
      description={m.settingsStorageHint()}
    >
      {storage ? (
        <UsageBar
          usedBytes={storage.usedBytes}
          limitBytes={storage.limitBytes}
        />
      ) : (
        <div aria-busy="true" className="min-h-10" />
      )}
    </SettingsSection>
  );
}

function subjectLink(search: Search) {
  return (subject: Subject, name: string) => (
    <RowLink to="/settings" search={{ ...search, subject: subject.id }}>
      {name}
    </RowLink>
  );
}

function roleLink(role: AccessRole, name: string) {
  return (
    <RowLink to="/settings" search={{ section: "access", role: role.id }}>
      {name}
    </RowLink>
  );
}

interface SubjectsTabProps {
  search: Search;
  patch: (change: Partial<Search>, replace?: boolean) => void;
}

function SubjectsTab({ search, patch }: SubjectsTabProps) {
  const subjects = (
    useQuery({ ...subjectsQuery, enabled: search.section === "subjects" }).data
      ?.rows ?? []
  ).map(subjectOf);
  const filtered = filterSubjects(subjects, search.q, search.sort, search.dir);
  const pages = Math.max(1, Math.ceil(filtered.length / SUBJECT_PAGE_SIZE));
  const page = Math.min(search.page, pages);
  const sheet = useUrlSheet(search.subject);
  const editing =
    sheet.shown && sheet.shown.value !== "new"
      ? subjects.find((subject) => subject.id === sheet.shown?.value)
      : undefined;
  const toolbar = {
    search: {
      value: search.q,
      onChange: (q: string) => patch({ q, page: 1 }, true),
      label: m.settingsSubjectsSearch(),
      placeholder: m.settingsSubjectsSearchPlaceholder(),
    },
    onReset: () => patch({ q: "", page: 1 }),
  };
  return (
    <>
      <SubjectCatalogue
        rows={filtered.slice(
          (page - 1) * SUBJECT_PAGE_SIZE,
          page * SUBJECT_PAGE_SIZE,
        )}
        total={filtered.length}
        page={page}
        toolbar={toolbar}
        sort={{
          value: search.sort,
          direction: search.dir,
          onChange: (sort: SubjectSort, dir) => patch({ sort, dir, page: 1 }),
        }}
        onPage={(next) => patch({ page: next })}
        nameLink={subjectLink(search)}
        onAdd={() => patch({ subject: "new" })}
        onEdit={(subject) => patch({ subject: subject.id })}
      />
      {sheet.shown && (sheet.shown.value === "new" || editing) ? (
        <SubjectSheet
          key={sheet.shown.generation}
          open={sheet.open}
          subject={editing}
          onClose={() => patch({ subject: undefined }, true)}
        />
      ) : null}
    </>
  );
}

interface AccessTabProps {
  search: Search;
  patch: (change: Partial<Search>, replace?: boolean) => void;
}

function AccessTab({ search, patch }: AccessTabProps) {
  const roles = useSuspenseQuery(accessRolesQuery).data;
  const sheet = useUrlSheet(search.role);
  const editing =
    sheet.shown && sheet.shown.value !== "new"
      ? findRole(roles, sheet.shown.value)
      : undefined;
  const copyOf =
    sheet.shown?.value === "new" && search.from
      ? findRole(roles, search.from)
      : undefined;
  return (
    <>
      <AccessRolesPanel
        nameLink={roleLink}
        onEdit={(role) => patch({ role: role.id, from: undefined })}
        onDuplicate={(role) => patch({ role: "new", from: role.id })}
      />
      {sheet.shown && (sheet.shown.value === "new" || editing) ? (
        <RoleSheet
          key={sheet.shown.generation}
          open={sheet.open}
          role={editing}
          copyOf={copyOf}
          onClose={() => patch({ role: undefined, from: undefined }, true)}
        />
      ) : null}
    </>
  );
}
