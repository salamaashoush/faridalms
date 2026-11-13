import type {
  AddOnVersionRow,
  PlanVersionRow,
} from "@faridalms/database/business/catalogue";
import type { AddOnKind } from "@faridalms/domain/subscriptions";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { ADD_ON_KINDS } from "@faridalms/domain/subscriptions";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
import { Blocks, Package, Plus } from "lucide-react";
import * as v from "valibot";

import type { CatalogueVersion } from "../components/CatalogueVersions";

import { AddOnForm, KIND_NAMES, PlanForm } from "../components/CatalogueForms";
import {
  catalogueStatus,
  currentOf,
  pricesText,
  upcomingOf,
} from "../components/CatalogueVersions";
import { formatDay, formatLimit, LIMIT_NAMES, MODULE_NAMES } from "../format";
import { getCatalogue } from "../server/catalogue";

const KINDS = ["plan", ...ADD_ON_KINDS] as const;
type Kind = (typeof KINDS)[number];

const search = v.object({
  q: v.optional(v.string(), ""),
  kind: v.optional(v.array(v.picklist(KINDS)), []),
  retired: v.optional(v.boolean(), false),
});

export const Route = createFileRoute("/catalogue/")({
  staticData: { title: "Catalogue" },
  validateSearch: search,
  search: {
    middlewares: [stripSearchParams({ q: "", kind: [], retired: false })],
  },
  loader: () => getCatalogue(),
  component: Catalogue,
});

type Data = Awaited<ReturnType<typeof getCatalogue>>;

/**
 * A plan or an add-on as the list shows it: the version sold today, one
 * still to go on sale, and all of them.
 */
type Entry = (
  | { kind: "plan"; current: PlanVersionRow }
  | { kind: AddOnKind; current: AddOnVersionRow }
) & {
  id: string;
  upcoming: CatalogueVersion | undefined;
  versions: CatalogueVersion[];
};

const KIND_LABELS: Record<Kind, string> = { plan: "Plan", ...KIND_NAMES };

/** Versions grouped under the plan or add-on they belong to, newest first. */
function grouped<T>(versions: T[], owner: (version: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const version of versions)
    groups.set(owner(version), [
      ...(groups.get(owner(version)) ?? []),
      version,
    ]);
  return [...groups.values()];
}

function entriesOf(data: Data): Entry[] {
  const upcoming = (
    versions: CatalogueVersion[],
    current: CatalogueVersion,
  ) => {
    const next = upcomingOf(versions, data.today);
    return next && next.id !== current.id ? next : undefined;
  };
  const plans = grouped(data.plans, (version) => version.planId).flatMap(
    (versions): Entry[] => {
      const current = currentOf(versions, data.today);
      return current
        ? [
            {
              id: current.planId,
              kind: "plan",
              current,
              upcoming: upcoming(versions, current),
              versions,
            },
          ]
        : [];
    },
  );
  const addOns = grouped(data.addOns, (version) => version.addOnId).flatMap(
    (versions): Entry[] => {
      const current = currentOf(versions, data.today);
      return current
        ? [
            {
              id: current.addOnId,
              kind: current.kind,
              current,
              upcoming: upcoming(versions, current),
              versions,
            },
          ]
        : [];
    },
  );
  const byName = (a: Entry, b: Entry) =>
    a.current.nameEn.localeCompare(b.current.nameEn);
  return [...plans.toSorted(byName), ...addOns.toSorted(byName)];
}

/** What a plan or an add-on gives a school, in a few words. */
function givesText(entry: Entry): string {
  if (entry.kind === "plan") {
    const { current } = entry;
    const students =
      current.students === null
        ? "any number of students"
        : `${formatLimit("students", current.students)} students`;
    return `${current.modules.length} modules, ${students}`;
  }
  const { current } = entry;
  if (current.kind === "module" && current.module)
    return MODULE_NAMES[current.module];
  if (current.kind === "limit_pack" && current.limitKey)
    return `${formatLimit(current.limitKey, current.amount)} more: ${LIMIT_NAMES[current.limitKey].toLowerCase()}`;
  return "Nothing in the schools";
}

interface EntryLinkProps {
  entry: Entry;
}

function EntryLink({ entry }: EntryLinkProps) {
  return entry.kind === "plan" ? (
    <RowLink to="/catalogue/plans/$planId" params={{ planId: entry.id }}>
      {entry.current.nameEn}
    </RowLink>
  ) : (
    <RowLink to="/catalogue/add-ons/$addOnId" params={{ addOnId: entry.id }}>
      {entry.current.nameEn}
    </RowLink>
  );
}

function columns(today: string): Column<Entry>[] {
  return [
    {
      id: "name",
      header: "Name",
      primary: true,
      cell: (entry) => (
        <span className="grid min-w-0 py-2">
          <EntryLink entry={entry} />
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            <bdi dir="rtl" lang="ar">
              {entry.current.nameAr}
            </bdi>
          </span>
        </span>
      ),
    },
    {
      id: "kind",
      header: "Kind",
      cell: (entry) => KIND_LABELS[entry.kind],
    },
    {
      id: "gives",
      header: "Gives",
      width: "medium",
      cell: (entry) => givesText(entry),
    },
    {
      id: "price",
      header: "Price",
      width: "medium",
      cell: (entry) =>
        entry.current.prices.length ? (
          pricesText(entry.current.prices)
        ) : (
          <span className="text-muted-foreground">Set by each contract</span>
        ),
    },
    {
      id: "version",
      header: "Version",
      width: "narrow",
      cell: (entry) => (
        <>
          {entry.current.version}, since {formatDay(entry.current.validFrom)}
          {entry.upcoming ? (
            <span className="block text-[13px] leading-[18px] text-muted-foreground">
              {entry.upcoming.version} from{" "}
              {formatDay(entry.upcoming.validFrom)}
            </span>
          ) : null}
        </>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (entry) => {
        const status = catalogueStatus(entry.versions, today);
        return <StatusText tone={status.tone}>{status.label}</StatusText>;
      },
    },
  ];
}

function card(today: string): DataTableCard<Entry> {
  return {
    title: (entry) => <EntryLink entry={entry} />,
    status: (entry) => catalogueStatus(entry.versions, today).label,
    fact: (entry) =>
      `${KIND_LABELS[entry.kind]} · ${entry.current.prices.length ? pricesText(entry.current.prices) : "Set by each contract"}`,
  };
}

/**
 * The plans and add-ons the business sells, each as the version sold today:
 * what it gives, its price, and whether it is still sold. Each opens its
 * own page, where it is versioned and retired.
 */
function Catalogue() {
  const data = Route.useLoaderData();
  const { q, kind, retired } = Route.useSearch();
  const navigate = Route.useNavigate();
  const open = useNavigate();
  const addingPlan = useSheet();
  const addingAddOn = useSheet();
  const go = (patch: Partial<v.InferOutput<typeof search>>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
  const today = data.today;
  const all = entriesOf(data);
  const isRetired = (entry: Entry) =>
    catalogueStatus(entry.versions, today).label === "Retired";
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (entry) =>
      (retired || !isRetired(entry)) &&
      (kind.length === 0 || kind.includes(entry.kind)) &&
      (!needle ||
        [entry.current.nameEn, entry.current.nameAr, entry.current.code].some(
          (text) => text.toLowerCase().includes(needle),
        )),
  );
  const facets: Facet[] = [
    {
      id: "kind",
      label: "Kind",
      options: KINDS.map((value) => ({
        value,
        label: KIND_LABELS[value],
        count: all.filter((entry) => entry.kind === value).length,
      })),
      selected: kind,
      onChange: (selected) =>
        go({ kind: KINDS.filter((value) => selected.includes(value)) }),
    },
    {
      id: "include",
      label: "Include",
      options: [
        {
          value: "retired",
          label: "Retired",
          count: all.filter(isRetired).length,
        },
      ],
      selected: retired ? ["retired"] : [],
      onChange: (selected) => go({ retired: selected.includes("retired") }),
    },
  ];
  return (
    <Page width="list">
      <PageHeader
        title="Catalogue"
        count={all.filter((entry) => !isRetired(entry)).length}
        description="Plans and add-ons as they are sold. A version never changes once made: a new price, module or limit is a new version, and a contract keeps the version it bought."
        action={{ label: "New plan", icon: Plus, onClick: addingPlan.show }}
        menu={[
          { label: "New add-on", icon: Package, onSelect: addingAddOn.show },
          {
            label: "Modules on offer",
            icon: Blocks,
            onSelect: () => open({ to: "/catalogue/modules" }),
          },
        ]}
      />
      <DataTable
        caption="Catalogue"
        rows={rows}
        columns={columns(today)}
        rowLabel={(entry) => entry.current.nameEn}
        card={card(today)}
        toolbar={{
          search: {
            value: q,
            onChange: (value) => go({ q: value }),
            label: "Search the catalogue",
            placeholder: "Search by name or code",
          },
          facets,
          onReset: () => go({ q: "", kind: [], retired: false }),
        }}
        empty={{
          icon: Package,
          title: "Put the first plan on sale",
          description:
            "A plan sets the modules, limits and price a school buys; add-ons sell more on top of it. Start one with New plan.",
        }}
      />
      <PlanForm
        key={`plan-${addingPlan.key}`}
        from={null}
        open={addingPlan.open}
        onOpenChange={addingPlan.onOpenChange}
        onSaved={(id) =>
          open({ to: "/catalogue/plans/$planId", params: { planId: id } })
        }
      />
      <AddOnForm
        key={`add-on-${addingAddOn.key}`}
        from={null}
        open={addingAddOn.open}
        onOpenChange={addingAddOn.onOpenChange}
        onSaved={(id) =>
          open({
            to: "/catalogue/add-ons/$addOnId",
            params: { addOnId: id },
          })
        }
      />
    </Page>
  );
}
