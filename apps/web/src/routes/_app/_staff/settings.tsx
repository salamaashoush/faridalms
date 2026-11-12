import type { HeaderAction } from "@faridalms/ui/system/page-header";
import type { QueryClient } from "@tanstack/react-query";

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
import type { SettingsTab } from "~/components/admin/slots";
import type { Subject, SubjectSort } from "~/components/admin/SubjectCatalogue";

import {
  AccessRolesPanel,
  findRole,
  RoleSheet,
} from "~/components/admin/AccessRolesPanel";
import { AssistantSettings } from "~/components/admin/AssistantSettings";
import { CommonsPictures } from "~/components/admin/CommonsPictures";
import { SchoolProfileSection } from "~/components/admin/SchoolEditors";
import { schoolSettingsSections, settingsTabs } from "~/components/admin/slots";
import {
  filterSubjects,
  SUBJECT_PAGE_SIZE,
  SubjectCatalogue,
  subjectOf,
  SubjectSheet,
} from "~/components/admin/SubjectCatalogue";
import { UsageBar } from "~/components/files/UsageBar";
import { FeaturesCard } from "~/components/learning/FeaturesCard";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { accessChangesQuery, accessRolesQuery } from "~/queries/access";
import { assistantSettingsQuery } from "~/queries/assistant";
import { subjectsQuery } from "~/queries/classes";
import {
  pictureSourcesQuery,
  schoolFeaturesQuery,
  schoolProfileQuery,
  schoolStorageQuery,
} from "~/queries/school-settings";
import { currentUserQuery } from "~/queries/user";
import { filled } from "~/utils/extension";
import { requirePage } from "~/utils/page-access";

/** A tab as the page lists it: where it sits, who keeps it and what it loads. */
interface ListedTab {
  value: string;
  label: () => string;
  place: number;
  capability?: string;
  load(queryClient: QueryClient): Promise<unknown>;
}

/** The settings' own tabs at their places; the modules on add theirs between them. */
const OWN_TABS: readonly ListedTab[] = [
  {
    value: "school",
    label: m.settingsSchoolTab,
    place: 10,
    load: (queryClient) =>
      Promise.all([
        queryClient.ensureQueryData(schoolProfileQuery),
        queryClient.ensureQueryData(schoolFeaturesQuery),
        queryClient.ensureQueryData(pictureSourcesQuery),
      ]),
  },
  {
    value: "subjects",
    label: m.adminSubjectsSection,
    place: 20,
    load: (queryClient) => queryClient.ensureQueryData(subjectsQuery),
  },
  {
    value: "access",
    label: m.adminPermissionsSection,
    place: 60,
    load: (queryClient) =>
      Promise.all([
        queryClient.ensureQueryData(accessRolesQuery),
        queryClient.ensureQueryData(accessChangesQuery(1)),
      ]),
  },
  {
    value: "assistant",
    label: m.assistantTab,
    place: 70,
    load: (queryClient) => queryClient.ensureQueryData(assistantSettingsQuery),
  },
];

/** The tabs this person keeps, the settings' own and the modules', in their places. */
const tabsFor = (
  user: { capabilities: readonly string[] },
  added: readonly SettingsTab[],
): ListedTab[] =>
  [
    ...OWN_TABS,
    ...added.map((tab) => ({
      ...tab,
      load: (queryClient: QueryClient) =>
        Promise.all(
          tab.queries().map((query) => queryClient.ensureQueryData(query)),
        ),
    })),
  ]
    .filter((tab) =>
      user.capabilities.includes(tab.capability ?? "school:manage"),
    )
    .toSorted((a, b) => a.place - b.place);

const searchSchema = v.object({
  section: v.optional(v.pipe(v.string(), v.regex(/^[a-z]{1,20}$/)), "school"),
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
    const tabs = tabsFor(
      user,
      filled(context.extensions, user.modules, settingsTabs),
    );
    const first = tabs[0];
    if (!first) return requirePage(user, "school:manage");
    const tab = tabs.find((each) => each.value === deps.section);
    // A tab nobody here may open falls back to the first they can.
    if (!tab)
      throw redirect({ to: "/settings", search: { section: first.value } });
    const { queryClient } = context;
    await Promise.all([
      tab.load(queryClient),
      ...(tab.value === "school"
        ? filled(context.extensions, user.modules, schoolSettingsSections).map(
            (section) => queryClient.ensureQueryData(section.query()),
          )
        : []),
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
  const user = useCurrentUser();
  const moduleTabs = useSlot(settingsTabs);
  const moduleTab = moduleTabs.find((tab) => tab.value === search.section);
  const tabs = tabsFor(user, moduleTabs);
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
        tabs={tabs.map((tab) => ({ value: tab.value, label: tab.label() }))}
        value={search.section}
        onChange={(section) => void navigate({ search: { section } })}
      >
        {search.section === "school" ? (
          <SchoolTab />
        ) : search.section === "subjects" ? (
          <SubjectsTab search={search} patch={patch} />
        ) : moduleTab ? (
          <moduleTab.Tab />
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
