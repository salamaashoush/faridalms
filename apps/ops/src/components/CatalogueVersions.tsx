import type { Price } from "@faridalms/domain/subscriptions";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { RecordStatus } from "@faridalms/ui/system/record-page";

import { CellWithNote } from "@faridalms/ui/system/cell-note";
import { DataTable } from "@faridalms/ui/system/data-table";
import { useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Archive, History } from "lucide-react";
import { useState } from "react";

import { formatDay, formatMoney, formatWhenDay } from "../format";
import { RetireSheet } from "./CatalogueForms";
import { formatPrice, UNIT_NAMES } from "./PriceFields";

/** What a version of a plan or an add-on has in common. */
export interface CatalogueVersion {
  id: string;
  version: number;
  validFrom: string;
  retiredAt: Date | null;
  prices: Price[];
}

/** Whether a version is sold today, only from a later day, or retired. */
export function versionStatus(
  version: CatalogueVersion,
  today: string,
): RecordStatus & { text: string } {
  if (version.retiredAt)
    return {
      label: "Retired",
      tone: "neutral",
      text: `Retired ${formatWhenDay(version.retiredAt)}`,
    };
  if (version.validFrom > today)
    return {
      label: "Not sold yet",
      tone: "info",
      text: `Sold from ${formatDay(version.validFrom)}`,
    };
  return { label: "Sold", tone: "success", text: "Sold" };
}

/**
 * Where a plan or an add-on stands as a whole: sold while a version is, else
 * waiting for one still to come, else retired.
 */
export function catalogueStatus(
  versions: readonly CatalogueVersion[],
  today: string,
): RecordStatus {
  const open = versions.filter((version) => !version.retiredAt);
  if (open.some((version) => version.validFrom <= today))
    return { label: "Sold", tone: "success" };
  if (open.length) return { label: "Not sold yet", tone: "info" };
  return { label: "Retired", tone: "neutral" };
}

/**
 * The version a new contract gets today: the newest still sold whose day
 * has come, else the next to come, else the newest. Versions are newest
 * first.
 */
export function currentOf<T extends CatalogueVersion>(
  versions: readonly T[],
  today: string,
): T | undefined {
  const open = versions.filter((version) => !version.retiredAt);
  return (
    open.find((version) => version.validFrom <= today) ??
    open.at(-1) ??
    versions[0]
  );
}

/** A version still to go on sale, newer than the one sold today. */
export function upcomingOf<T extends CatalogueVersion>(
  versions: readonly T[],
  today: string,
): T | undefined {
  return versions.find(
    (version) => !version.retiredAt && version.validFrom > today,
  );
}

/** A version's prices on one line, or that each contract sets its own. */
export const pricesText = (prices: readonly Price[]) =>
  prices.length
    ? prices.map(formatPrice).join(" · ")
    : "No list price: each contract sets its own";

const priceKey = (price: Price) => `${price.currency}/${price.unit}`;

/** How a version's list prices differ from the version before it. */
export function priceChanges(
  before: readonly Price[],
  after: readonly Price[],
): string[] {
  const lines: string[] = [];
  for (const price of after) {
    const was = before.find((one) => priceKey(one) === priceKey(price));
    const unit = UNIT_NAMES[price.unit];
    if (!was) lines.push(`Priced ${formatPrice(price)}`);
    else {
      if (was.amountMinor !== price.amountMinor)
        lines.push(
          `Price ${unit}: ${formatMoney(was.amountMinor, was.currency)} → ${formatMoney(price.amountMinor, price.currency)}`,
        );
      if (was.minimumMinor !== price.minimumMinor)
        lines.push(
          `Least a year in ${price.currency}: ${was.minimumMinor ? formatMoney(was.minimumMinor, was.currency) : "none"} → ${price.minimumMinor ? formatMoney(price.minimumMinor, price.currency) : "none"}`,
        );
    }
  }
  for (const was of before)
    if (!after.some((price) => priceKey(price) === priceKey(was)))
      lines.push(`No longer priced in ${was.currency} ${UNIT_NAMES[was.unit]}`);
  return lines;
}

/** A version as a row: what it changed and why it was made. */
export interface VersionRow extends CatalogueVersion {
  changes: readonly string[];
  why: string | null;
}

function columns(today: string): Column<VersionRow>[] {
  return [
    {
      id: "version",
      header: "Version",
      primary: true,
      cell: (row) => (
        <CellWithNote note={row.why}>Version {row.version}</CellWithNote>
      ),
    },
    {
      id: "from",
      header: "Sold from",
      cell: (row) => formatDay(row.validFrom),
    },
    {
      id: "price",
      header: "Price",
      width: "medium",
      cell: (row) =>
        row.prices.length ? (
          pricesText(row.prices)
        ) : (
          <span className="text-muted-foreground">Set by each contract</span>
        ),
    },
    {
      id: "changes",
      header: "What changed",
      width: "wide",
      cell: (row) =>
        row.changes.length ? (
          <ul className="grid gap-0.5">
            {row.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">
            {row.version === 1 ? "The first version" : "Only its day or name"}
          </span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => {
        const status = versionStatus(row, today);
        return <StatusText tone={status.tone}>{status.text}</StatusText>;
      },
    },
  ];
}

const CARD: DataTableCard<VersionRow> = {
  title: (row) => `Version ${row.version}`,
  fact: (row) => `From ${formatDay(row.validFrom)} · ${pricesText(row.prices)}`,
  status: (row) => (row.retiredAt ? "Retired" : null),
};

export interface VersionsTableProps {
  kind: "plan" | "add_on";
  rows: readonly VersionRow[];
  today: string;
}

/**
 * Every version of a plan or an add-on, newest first: when it is sold
 * from, its price, what it changed and why, and whether it is still sold.
 * A version still sold is retired from its row's menu.
 */
export function VersionsTable({ kind, rows, today }: VersionsTableProps) {
  const retiring = useSheet();
  const [chosen, setChosen] = useState<VersionRow | null>(null);
  return (
    <>
      <DataTable
        caption="Versions"
        rows={[...rows]}
        columns={columns(today)}
        rowLabel={(row) => `Version ${row.version}`}
        card={CARD}
        rowActions={(row) =>
          row.retiredAt
            ? []
            : [
                {
                  label: "Retire",
                  icon: Archive,
                  onSelect: () => {
                    setChosen(row);
                    retiring.show();
                  },
                },
              ]
        }
        empty={{ icon: History, title: "No versions" }}
      />
      {chosen ? (
        <RetireSheet
          key={retiring.key}
          kind={kind}
          id={chosen.id}
          version={chosen.version}
          open={retiring.open}
          onOpenChange={retiring.onOpenChange}
        />
      ) : null}
    </>
  );
}
