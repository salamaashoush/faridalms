import type { HealthLevel } from "@faridalms/domain/onboarding";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { availableModules } from "@faridalms/domain/plans";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusText } from "@faridalms/ui/system/status";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Plus, School as SchoolIcon } from "lucide-react";
import * as v from "valibot";

import type { listSchools } from "../server/directory";

import { HealthBadge } from "../components/Health";
import { Usage } from "../components/Usage";
import {
  HEALTH_LEVEL_NAMES,
  MODULE_NAMES,
  TENANT_STATE_NAMES,
  TENANT_STATE_TONE,
} from "../format";
import { listSchools as loadSchools } from "../server/directory";

const HEALTH_LEVELS = ["red", "amber", "green"] as const;

const search = v.object({
  q: v.optional(v.string(), ""),
  health: v.optional(v.array(v.picklist(HEALTH_LEVELS)), []),
});

export const Route = createFileRoute("/schools/")({
  validateSearch: search,
  search: { middlewares: [stripSearchParams({ q: "", health: [] })] },
  loader: () => loadSchools(),
  component: Schools,
});

type SchoolRow = Awaited<ReturnType<typeof listSchools>>[number];

const nameOf = (school: SchoolRow) =>
  school.nameEn ?? school.nameAr ?? school.slug;

function onboardingOf(school: SchoolRow) {
  const onboarding = school.health?.onboarding;
  if (!onboarding) return null;
  return {
    done: onboarding.applies.filter((item) => onboarding.reached[item]).length,
    total: onboarding.applies.length,
  };
}

const COLUMNS: Column<SchoolRow>[] = [
  {
    id: "school",
    header: "School",
    primary: true,
    cell: (school) => (
      <span className="grid min-w-0">
        <RowLink to="/schools/$schoolId" params={{ schoolId: school.id }}>
          {nameOf(school)}
        </RowLink>
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
          {school.slug}
          {school.placement === "legacy" ? " · legacy" : ""}
        </span>
      </span>
    ),
  },
  {
    id: "state",
    header: "State",
    cell: (school) => (
      <StatusText tone={TENANT_STATE_TONE[school.tenantState]}>
        {TENANT_STATE_NAMES[school.tenantState]}
      </StatusText>
    ),
  },
  {
    id: "health",
    header: "Health",
    cell: (school) =>
      school.health ? <HealthBadge level={school.health.level} /> : null,
  },
  {
    id: "onboarding",
    header: "Onboarding",
    cell: (school) => {
      const progress = onboardingOf(school);
      return progress ? (
        <span className="text-muted-foreground tabular-nums">
          {progress.done} of {progress.total}
        </span>
      ) : null;
    },
  },
  {
    id: "group",
    header: "Group",
    cell: (school) => school.tenantNameEn ?? school.tenantNameAr ?? "None",
  },
  {
    id: "cell",
    header: "Cell",
    cell: (school) => (
      <span className="text-muted-foreground">
        {school.cellId} · {school.region}
      </span>
    ),
  },
  {
    id: "storage",
    header: "Storage",
    cell: (school) => (
      <Usage
        usedBytes={school.usage?.usedBytes ?? null}
        limitBytes={school.entitlements.poolBytes}
      />
    ),
  },
  {
    id: "modules",
    header: "Modules",
    cell: (school) => {
      const modules = availableModules(school.entitlements);
      return (
        <span
          className="text-muted-foreground tabular-nums"
          title={modules.map((module) => MODULE_NAMES[module]).join(", ")}
        >
          {modules.length}
        </span>
      );
    },
  },
];

const CARD: DataTableCard<SchoolRow> = {
  title: (school) => (
    <RowLink to="/schools/$schoolId" params={{ schoolId: school.id }}>
      {nameOf(school)}
    </RowLink>
  ),
  status: (school) =>
    school.health ? <HealthBadge level={school.health.level} /> : null,
  fact: (school) => TENANT_STATE_NAMES[school.tenantState],
};

function matches(school: SchoolRow, needle: string) {
  return [school.slug, school.nameEn, school.nameAr, school.tenantNameEn]
    .filter((text) => text !== null)
    .some((text) => text.toLowerCase().includes(needle));
}

/**
 * Every school on the platform, with its state, health, how far through
 * onboarding it is, its storage and how many modules it is entitled to.
 */
function Schools() {
  const schools = Route.useLoaderData();
  const { q, health } = Route.useSearch();
  const navigate = Route.useNavigate();
  const needle = q.trim().toLowerCase();
  const rows = schools.filter(
    (school) =>
      (!needle || matches(school, needle)) &&
      (health.length === 0 ||
        (school.health !== null && health.includes(school.health.level))),
  );
  const countOf = (level: HealthLevel) =>
    schools.filter((school) => school.health?.level === level).length;
  const facets: Facet[] = [
    {
      id: "health",
      label: "Health",
      options: HEALTH_LEVELS.map((level) => ({
        value: level,
        label: HEALTH_LEVEL_NAMES[level],
        count: countOf(level),
      })),
      selected: health,
      onChange: (selected) =>
        void navigate({
          search: (previous) => ({
            ...previous,
            health: HEALTH_LEVELS.filter((level) => selected.includes(level)),
          }),
        }),
    },
  ];
  return (
    <>
      <PageHeader
        title="Schools"
        count={needle || health.length ? undefined : schools.length}
        description="Usage is what each school's cell last reported."
        action={{
          label: "New school",
          icon: Plus,
          link: { to: "/schools/new" },
        }}
      />
      <DataTable
        caption="Schools"
        rows={rows}
        columns={COLUMNS}
        rowLabel={nameOf}
        toolbar={{
          search: {
            value: q,
            onChange: (value) =>
              void navigate({
                search: (previous) => ({ ...previous, q: value }),
                replace: true,
              }),
            label: "Search schools",
            placeholder: "Search by name or address",
          },
          facets,
          onReset: () => void navigate({ search: {} }),
        }}
        card={CARD}
        empty={{
          icon: SchoolIcon,
          title: "Create the first school",
          description:
            "A school is set up for a customer: what it buys, its addresses and who first runs it.",
          action: null,
        }}
      />
    </>
  );
}
