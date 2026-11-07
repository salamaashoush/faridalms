import type { PlanVersionRow } from "@faridalms/database/business/catalogue";
import type { ModuleId } from "@faridalms/domain/modules";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { RecordTab } from "@faridalms/ui/system/record-page";
import type { SummaryItem } from "@faridalms/ui/system/summary-list";

import { LIMIT_KEYS, STORAGE_KEYS } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { DataTable } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { RecordHeader, RecordTabs } from "@faridalms/ui/system/record-page";
import { useSheet } from "@faridalms/ui/system/sheet-form";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import {
  createFileRoute,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { Archive, Blocks, Plus } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import type { VersionRow } from "../components/CatalogueVersions";

import { PlanForm, RetireSheet } from "../components/CatalogueForms";
import {
  catalogueStatus,
  currentOf,
  priceChanges,
  pricesText,
  upcomingOf,
  VersionsTable,
} from "../components/CatalogueVersions";
import { EventList } from "../components/EventList";
import { formatPrice } from "../components/PriceFields";
import {
  formatDay,
  formatLimit,
  LIMIT_NAMES,
  MODULE_GROUPS,
  MODULE_HINTS,
  MODULE_NAMES,
} from "../format";
import { getPlan } from "../server/catalogue";

const PLAN_TABS = [
  "about",
  "modules",
  "limits",
  "versions",
  "history",
] as const;
type PlanTab = (typeof PLAN_TABS)[number];

const TAB_NAMES: Record<PlanTab, string> = {
  about: "About",
  modules: "Modules",
  limits: "Limits",
  versions: "Versions",
  history: "History",
};

const search = v.object({
  tab: v.fallback(v.optional(v.picklist(PLAN_TABS), "about"), "about"),
});

export const Route = createFileRoute("/catalogue/plans/$planId")({
  staticData: { title: "Plan" },
  validateSearch: search,
  search: { middlewares: [stripSearchParams({ tab: "about" })] },
  loader: ({ params }) => getPlan({ data: { id: params.planId } }),
  component: PlanPage,
});

/** What a plan version changed from the one before it, line by line. */
function changesFrom(
  before: PlanVersionRow | undefined,
  after: PlanVersionRow,
): string[] {
  if (!before) return [];
  const lines: string[] = [];
  if (before.nameEn !== after.nameEn)
    lines.push(`Renamed from ${before.nameEn}`);
  const added = after.modules.filter((id) => !before.modules.includes(id));
  const dropped = before.modules.filter((id) => !after.modules.includes(id));
  if (added.length)
    lines.push(`Adds ${added.map((id) => MODULE_NAMES[id]).join(", ")}`);
  if (dropped.length)
    lines.push(`Drops ${dropped.map((id) => MODULE_NAMES[id]).join(", ")}`);
  for (const key of LIMIT_KEYS)
    if (before[key] !== after[key])
      lines.push(
        `${LIMIT_NAMES[key]}: ${formatLimit(key, before[key])} → ${formatLimit(key, after[key])}`,
      );
  return [...lines, ...priceChanges(before.prices, after.prices)];
}

const AREA_OF = new Map(
  MODULE_GROUPS.flatMap((group) =>
    group.modules.map((module) => [module, group.title] as const),
  ),
);

interface ModuleRow {
  id: ModuleId;
}

const MODULE_COLUMNS: Column<ModuleRow>[] = [
  {
    id: "module",
    header: "Module",
    primary: true,
    cell: (row) => (
      <span className="grid min-w-0 py-2">
        <span className="truncate font-medium">{MODULE_NAMES[row.id]}</span>
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
          {MODULE_HINTS[row.id]}
        </span>
      </span>
    ),
  },
  {
    id: "area",
    header: "Area",
    cell: (row) => (
      <span className="text-muted-foreground">{AREA_OF.get(row.id)}</span>
    ),
  },
];

const MODULE_CARD: DataTableCard<ModuleRow> = {
  title: (row) => MODULE_NAMES[row.id],
  fact: (row) => MODULE_HINTS[row.id],
};

interface PlanProps {
  version: PlanVersionRow;
}

/** The plan's names and code, then the day and prices of the version sold today. */
function AboutTab({ version }: PlanProps) {
  const plan: SummaryItem[] = [
    { id: "en", label: "Name in English", value: version.nameEn },
    {
      id: "ar",
      label: "Name in Arabic",
      value: (
        <span dir="rtl" lang="ar">
          {version.nameAr}
        </span>
      ),
    },
    {
      id: "code",
      label: "Code",
      value: <span dir="ltr">{version.code}</span>,
    },
  ];
  const sold: SummaryItem[] = [
    { id: "from", label: "Sold from", value: formatDay(version.validFrom) },
    ...(version.prices.length
      ? version.prices.map((price, index) => ({
          id: `price-${index}`,
          label: `Price in ${price.currency}`,
          value: formatPrice(price),
        }))
      : [
          {
            id: "price",
            label: "Price",
            value: "No list price: each contract sets its own",
          },
        ]),
  ];
  return (
    <>
      <SummaryList title="Plan" align="start" items={plan} />
      <SummaryList
        title={`Version ${version.version}`}
        align="start"
        items={sold}
      />
    </>
  );
}

/** The modules the version sold today includes, each with what it gives. */
function ModulesTab({ version }: PlanProps) {
  return (
    <DataTable
      caption="Modules"
      rows={version.modules.map((id) => ({ id }))}
      columns={MODULE_COLUMNS}
      rowLabel={(row) => MODULE_NAMES[row.id]}
      card={MODULE_CARD}
      empty={{
        icon: Blocks,
        title: "It includes no modules",
        description:
          "A new version of the plan can include modules; schools on this one keep what it gives.",
      }}
    />
  );
}

/** The storage of the version sold today, then what it counts. */
function LimitsTab({ version }: PlanProps) {
  const item = (key: (typeof LIMIT_KEYS)[number]): SummaryItem => ({
    id: key,
    label: LIMIT_NAMES[key],
    value: formatLimit(key, version[key]),
  });
  const storage = new Set<string>(STORAGE_KEYS);
  return (
    <>
      <SummaryList title="Storage" items={STORAGE_KEYS.map(item)} />
      <SummaryList
        title="Allowances"
        items={LIMIT_KEYS.filter((key) => !storage.has(key)).map(item)}
      />
    </>
  );
}

/**
 * A plan as it is sold: what the version sold today costs and gives, every
 * version it has had with what each changed, and its history. A change
 * of price, module or limit is a new version; a version stops being sold
 * when it is retired.
 */
function PlanPage() {
  const data = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const versioning = useSheet();
  const retiring = useSheet();
  const [chosen, setChosen] = useState<PlanVersionRow | null>(null);
  const [latest] = data.versions;
  const current = currentOf(data.versions, data.today);
  if (!latest || !current) return null;
  const upcoming = upcomingOf(data.versions, data.today);
  const coming = upcoming && upcoming.id !== current.id ? upcoming : null;
  const rows: VersionRow[] = data.versions.map((version, index) => ({
    ...version,
    changes: changesFrom(data.versions[index + 1], version),
    why: data.why[version.version] ?? null,
  }));
  const tabs: RecordTab<PlanTab>[] = PLAN_TABS.map((value) => ({
    value,
    label: TAB_NAMES[value],
    count:
      value === "modules"
        ? current.modules.length
        : value === "versions"
          ? data.versions.length
          : undefined,
  }));
  return (
    <Page width="record">
      <RecordHeader
        title={current.nameEn}
        status={catalogueStatus(data.versions, data.today)}
        facts={[
          {
            label: "Name in Arabic",
            value: (
              <span dir="rtl" lang="ar">
                {current.nameAr}
              </span>
            ),
          },
          {
            label: "Version sold",
            value: `Version ${current.version}, since ${formatDay(current.validFrom)}`,
          },
          { label: "Price", value: pricesText(current.prices) },
        ]}
        action={{ label: "New version", icon: Plus, onClick: versioning.show }}
        menu={data.versions
          .filter((version) => !version.retiredAt)
          .map((version) => ({
            label: `Retire version ${version.version}`,
            icon: Archive,
            onSelect: () => {
              setChosen(version);
              retiring.show();
            },
          }))}
      />
      {coming ? (
        <div className="mb-6">
          <AttentionList
            title="To do"
            items={[
              {
                id: coming.id,
                tone: "info",
                title: `Version ${coming.version} goes on sale on ${formatDay(coming.validFrom)}`,
                detail:
                  data.why[coming.version] ??
                  "Contracts made from that day hold it.",
                action: (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void navigate({
                        search: { tab: "versions" },
                        replace: true,
                        resetScroll: false,
                      })
                    }
                  >
                    See what changes
                  </Button>
                ),
              },
            ]}
          />
        </div>
      ) : null}
      <RecordTabs
        label="The plan's parts"
        tabs={tabs}
        value={tab}
        onChange={(next) =>
          void navigate({
            search: { tab: next },
            replace: true,
            resetScroll: false,
          })
        }
      >
        {tab === "about" ? (
          <AboutTab version={current} />
        ) : tab === "modules" ? (
          <ModulesTab version={current} />
        ) : tab === "limits" ? (
          <LimitsTab version={current} />
        ) : tab === "versions" ? (
          <VersionsTable kind="plan" rows={rows} today={data.today} />
        ) : (
          <EventList events={data.history} names={data.names} />
        )}
      </RecordTabs>
      <PlanForm
        key={`version-${versioning.key}`}
        from={latest}
        open={versioning.open}
        onOpenChange={versioning.onOpenChange}
        onSaved={() => router.invalidate()}
      />
      {chosen ? (
        <RetireSheet
          key={`retire-${retiring.key}`}
          kind="plan"
          id={chosen.id}
          version={chosen.version}
          open={retiring.open}
          onOpenChange={retiring.onOpenChange}
        />
      ) : null}
    </Page>
  );
}
