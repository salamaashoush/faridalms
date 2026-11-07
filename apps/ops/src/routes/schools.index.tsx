import type { HealthLevel } from "@faridalms/domain/onboarding";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { SCHOOL_STANDINGS, standingOf } from "@faridalms/domain/provisioning";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Plus, School as SchoolIcon } from "lucide-react";
import * as v from "valibot";

import type { listSchools } from "../server/directory";

import { HealthBadge } from "../components/Health";
import { Usage } from "../components/Usage";
import {
  HEALTH_LEVEL_NAMES,
  STANDING_NAMES,
  STANDING_TONE,
  TENANT_STATE_NAMES,
  TENANT_STATE_TONE,
} from "../format";
import { listSchools as loadSchools } from "../server/directory";

const HEALTH_LEVELS = ["red", "amber", "green"] as const;

const search = v.object({
  q: v.optional(v.string(), ""),
  health: v.optional(v.array(v.picklist(HEALTH_LEVELS)), []),
  access: v.optional(v.array(v.picklist(SCHOOL_STANDINGS)), []),
});

export const Route = createFileRoute("/schools/")({
  validateSearch: search,
  search: {
    middlewares: [stripSearchParams({ q: "", health: [], access: [] })],
  },
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

const accessOf = (school: SchoolRow) =>
  standingOf(school.tenantState, school.entitlements.access);

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
          <span dir="ltr">{school.slug}</span>
          {school.tenantKind === "school_group"
            ? ` · ${school.tenantNameEn ?? school.tenantNameAr ?? "a group"}`
            : ""}
          {school.placement === "legacy" ? " · legacy" : ""}
        </span>
      </span>
    ),
  },
  {
    id: "access",
    header: "Access",
    cell: (school) => {
      const standing = accessOf(school);
      return standing ? (
        <StatusBadge tone={STANDING_TONE[standing]}>
          {STANDING_NAMES[standing]}
        </StatusBadge>
      ) : (
        <StatusBadge tone={TENANT_STATE_TONE[school.tenantState]}>
          {TENANT_STATE_NAMES[school.tenantState]}
        </StatusBadge>
      );
    },
  },
  {
    id: "health",
    header: "Health",
    cell: (school) =>
      school.health ? (
        <HealthBadge level={school.health.level} />
      ) : (
        <Value notApplicable>{null}</Value>
      ),
  },
  {
    id: "onboarding",
    header: "Onboarding",
    cell: (school) => {
      const progress = onboardingOf(school);
      return progress ? (
        <span className="grid min-w-24 gap-1">
          <span className="text-muted-foreground tabular-nums">
            {progress.done} of {progress.total}
          </span>
          <span
            aria-hidden
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-primary"
              style={{
                width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`,
              }}
            />
          </span>
        </span>
      ) : (
        <Value notApplicable>{null}</Value>
      );
    },
  },
  {
    id: "students",
    header: "Students",
    align: "end",
    cell: (school) =>
      school.usage === null ? (
        <span className="text-muted-foreground">Not reported</span>
      ) : school.entitlements.students === null ? (
        school.usage.students.toLocaleString("en")
      ) : (
        `${school.usage.students.toLocaleString("en")} of ${school.entitlements.students.toLocaleString("en")}`
      ),
  },
  {
    id: "signedIn",
    header: "Signed in this week",
    align: "end",
    cell: (school) =>
      school.usage === null ? (
        <span className="text-muted-foreground">Not reported</span>
      ) : (
        school.usage.signedIn7d.toLocaleString("en")
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
];

const CARD: DataTableCard<SchoolRow> = {
  title: (school) => (
    <RowLink to="/schools/$schoolId" params={{ schoolId: school.id }}>
      {nameOf(school)}
    </RowLink>
  ),
  status: (school) =>
    school.health ? <HealthBadge level={school.health.level} /> : null,
  fact: (school) => {
    const standing = accessOf(school);
    return standing
      ? STANDING_NAMES[standing]
      : TENANT_STATE_NAMES[school.tenantState];
  },
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
  const { q, health, access } = Route.useSearch();
  const navigate = Route.useNavigate();
  const needle = q.trim().toLowerCase();
  const rows = schools.filter(
    (school) =>
      (!needle || matches(school, needle)) &&
      (health.length === 0 ||
        (school.health !== null && health.includes(school.health.level))) &&
      (access.length === 0 ||
        access.some((standing) => accessOf(school) === standing)),
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
    {
      id: "access",
      label: "Access",
      options: SCHOOL_STANDINGS.map((standing) => ({
        value: standing,
        label: STANDING_NAMES[standing],
        count: schools.filter((school) => accessOf(school) === standing).length,
      })),
      selected: access,
      onChange: (selected) =>
        void navigate({
          search: (previous) => ({
            ...previous,
            access: SCHOOL_STANDINGS.filter((standing) =>
              selected.includes(standing),
            ),
          }),
        }),
    },
  ];
  return (
    <Page width="list">
      <PageHeader
        title="Schools"
        count={
          needle || health.length || access.length ? undefined : schools.length
        }
        description="Every school on the platform, with how it is used as its cell last reported."
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
    </Page>
  );
}
