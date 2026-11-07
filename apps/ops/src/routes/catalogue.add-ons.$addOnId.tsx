import type { AddOnVersionRow } from "@faridalms/database/business/catalogue";
import type { RecordTab } from "@faridalms/ui/system/record-page";
import type { SummaryItem } from "@faridalms/ui/system/summary-list";

import { Button } from "@faridalms/ui/button";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { Page } from "@faridalms/ui/system/page";
import { RecordHeader, RecordTabs } from "@faridalms/ui/system/record-page";
import { useSheet } from "@faridalms/ui/system/sheet-form";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import {
  createFileRoute,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { Archive, Plus } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import type { VersionRow } from "../components/CatalogueVersions";

import {
  AddOnForm,
  addOnGives,
  KIND_NAMES,
  RetireSheet,
} from "../components/CatalogueForms";
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
import { formatDay } from "../format";
import { getAddOn } from "../server/catalogue";

const ADD_ON_TABS = ["about", "versions", "history"] as const;
type AddOnTab = (typeof ADD_ON_TABS)[number];

const TAB_NAMES: Record<AddOnTab, string> = {
  about: "About",
  versions: "Versions",
  history: "History",
};

const search = v.object({
  tab: v.fallback(v.optional(v.picklist(ADD_ON_TABS), "about"), "about"),
});

export const Route = createFileRoute("/catalogue/add-ons/$addOnId")({
  staticData: { title: "Add-on" },
  validateSearch: search,
  search: { middlewares: [stripSearchParams({ tab: "about" })] },
  loader: ({ params }) => getAddOn({ data: { id: params.addOnId } }),
  component: AddOnPage,
});

/** What an add-on version changed from the one before it, line by line. */
function changesFrom(
  before: AddOnVersionRow | undefined,
  after: AddOnVersionRow,
): string[] {
  if (!before) return [];
  const lines: string[] = [];
  if (before.nameEn !== after.nameEn)
    lines.push(`Renamed from ${before.nameEn}`);
  const gave = addOnGives(before);
  const gives = addOnGives(after);
  if (gave !== gives) lines.push(gives);
  return [...lines, ...priceChanges(before.prices, after.prices)];
}

interface AboutTabProps {
  version: AddOnVersionRow;
}

/** The add-on's names, kind and what it gives, then the version sold today. */
function AboutTab({ version }: AboutTabProps) {
  const addOn: SummaryItem[] = [
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
    { id: "kind", label: "Kind", value: KIND_NAMES[version.kind] },
    { id: "gives", label: "What it gives", value: addOnGives(version) },
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
      <SummaryList title="Add-on" align="start" items={addOn} />
      <SummaryList
        title={`Version ${version.version}`}
        align="start"
        items={sold}
      />
    </>
  );
}

/**
 * An add-on as it is sold: what it gives and costs, every version it has
 * had with what each changed, and its history.
 */
function AddOnPage() {
  const data = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const versioning = useSheet();
  const retiring = useSheet();
  const [chosen, setChosen] = useState<AddOnVersionRow | null>(null);
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
  const tabs: RecordTab<AddOnTab>[] = ADD_ON_TABS.map((value) => ({
    value,
    label: TAB_NAMES[value],
    count: value === "versions" ? data.versions.length : undefined,
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
            value: `${KIND_NAMES[current.kind]}, version ${current.version} since ${formatDay(current.validFrom)}`,
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
        label="The add-on's parts"
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
        ) : tab === "versions" ? (
          <VersionsTable kind="add_on" rows={rows} today={data.today} />
        ) : (
          <EventList events={data.history} names={data.names} />
        )}
      </RecordTabs>
      <AddOnForm
        key={`version-${versioning.key}`}
        from={latest}
        open={versioning.open}
        onOpenChange={versioning.onOpenChange}
        onSaved={() => router.invalidate()}
      />
      {chosen ? (
        <RetireSheet
          key={`retire-${retiring.key}`}
          kind="add_on"
          id={chosen.id}
          version={chosen.version}
          open={retiring.open}
          onOpenChange={retiring.onOpenChange}
        />
      ) : null}
    </Page>
  );
}
