import type { HeaderAction } from "@faridalms/ui/system/page-header";

import { Skeleton } from "@faridalms/ui/skeleton";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { RowLink } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import {
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
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
import { AssistantSettings } from "~/components/admin/AssistantSettings";
import { CommonsPictures } from "~/components/admin/CommonsPictures";
import { SchoolProfileSection } from "~/components/admin/SchoolEditors";
import { schoolSettingsSections } from "~/components/admin/slots";
import {
  filterSubjects,
  SUBJECT_PAGE_SIZE,
  SubjectCatalogue,
  subjectOf,
  SubjectSheet,
} from "~/components/admin/SubjectCatalogue";
import { AttendanceRules } from "~/components/attendance/AttendanceRules";
import { UsageBar } from "~/components/files/UsageBar";
import { GradingSettings } from "~/components/grading/GradingSettings";
import { FeaturesCard } from "~/components/learning/FeaturesCard";
import { ReadingNorms } from "~/components/reading/ReadingNorms";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { accessChangesQuery, accessRolesQuery } from "~/queries/access";
import { assistantSettingsQuery } from "~/queries/assistant";
import { attendanceSettingsQuery } from "~/queries/attendance";
import { subjectsQuery } from "~/queries/classes";
import { gradingHistoryQuery, gradingOverviewQuery } from "~/queries/grading";
import { readingNormsQuery } from "~/queries/reading";
import {
  pictureSourcesQuery,
  schoolFeaturesQuery,
  schoolProfileQuery,
  schoolStorageQuery,
} from "~/queries/school-settings";
import { currentUserQuery } from "~/queries/user";
import { filled } from "~/utils/extension";
import { requirePage } from "~/utils/page-access";

const searchSchema = v.object({
  section: v.optional(
    v.picklist([
      "school",
      "subjects",
      "attendance",
      "reading",
      "grading",
      "access",
      "assistant",
    ]),
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
    requirePage(user, "school:manage", "grading:manage");
    const grading = gradesHere(user);
    // Someone who sets up only grading lands on its tab; a tab nobody here
    // may open falls back to the one they can.
    if (deps.section === "grading" ? !grading : !keepsSchool(user))
      throw redirect({
        to: "/settings",
        search: { section: grading ? "grading" : "school" },
      });
    const { queryClient } = context;
    if (deps.section === "grading")
      await Promise.all([
        queryClient.ensureQueryData(gradingOverviewQuery),
        queryClient.ensureQueryData(gradingHistoryQuery(1)),
      ]);
    else if (deps.section === "school")
      await Promise.all([
        queryClient.ensureQueryData(schoolProfileQuery),
        queryClient.ensureQueryData(schoolFeaturesQuery),
        queryClient.ensureQueryData(pictureSourcesQuery),
        ...filled(context.extensions, user.modules, schoolSettingsSections).map(
          (section) => queryClient.ensureQueryData(section.query()),
        ),
      ]);
    else if (deps.section === "subjects")
      await queryClient.ensureQueryData(subjectsQuery);
    else if (deps.section === "attendance")
      await queryClient.ensureQueryData(attendanceSettingsQuery);
    else if (deps.section === "assistant")
      await queryClient.ensureQueryData(assistantSettingsQuery);
    else if (deps.section === "reading")
      await queryClient.ensureQueryData(readingNormsQuery);
    else
      await Promise.all([
        queryClient.ensureQueryData(accessRolesQuery),
        queryClient.ensureQueryData(accessChangesQuery(1)),
      ]);
  },
  component: SettingsRoute,
});

interface Viewer {
  capabilities: readonly string[];
  modules: { gradebook: boolean };
}

const keepsSchool = (user: Viewer) =>
  user.capabilities.includes("school:manage");

const gradesHere = (user: Viewer) =>
  user.modules.gradebook && user.capabilities.includes("grading:manage");

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
  const user = useCurrentUser();
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
    <Page width="form">
      <PageHeader
        title={m.adminSettingsTitle()}
        description={m.adminSettingsSubtitle()}
        action={action}
      />
      <RecordTabs
        label={m.adminSettingsTitle()}
        tabs={[
          ...(keepsSchool(user)
            ? [
                { value: "school" as const, label: m.settingsSchoolTab() },
                {
                  value: "subjects" as const,
                  label: m.adminSubjectsSection(),
                },
                { value: "attendance" as const, label: m.attendanceTitle() },
                { value: "reading" as const, label: m.readingSettingsTab() },
              ]
            : []),
          ...(gradesHere(user)
            ? [{ value: "grading" as const, label: m.gradingTitle() }]
            : []),
          ...(keepsSchool(user)
            ? [
                {
                  value: "access" as const,
                  label: m.adminPermissionsSection(),
                },
                { value: "assistant" as const, label: m.assistantTab() },
              ]
            : []),
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
        ) : search.section === "reading" ? (
          <SettingsPage>
            <ReadingNorms />
          </SettingsPage>
        ) : search.section === "grading" ? (
          <GradingSettings />
        ) : search.section === "assistant" ? (
          <AssistantSettings />
        ) : (
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <AccessTab search={search} patch={patch} />
          </Suspense>
        )}
      </RecordTabs>
    </Page>
  );
}

function SchoolTab() {
  const sections = useSlot(schoolSettingsSections);
  return (
    <SettingsPage>
      <SchoolProfileSection />
      <SettingsSection
        title={m.schoolDaysTitle()}
        description={m.schoolDaysSettingsHint()}
      >
        <ButtonLink to="/school-days" search={{}} variant="outline">
          {m.schoolDaysOpen()}
        </ButtonLink>
      </SettingsSection>
      {sections.map((section) => (
        <section.Section key={section.key} />
      ))}
      <FeaturesCard />
      <CommonsPictures />
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
