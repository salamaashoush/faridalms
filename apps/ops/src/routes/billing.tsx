import type { Currency } from "@faridalms/domain/subscriptions";
import type {
  BatchAction,
  Column,
  DataTableCard,
  DataTableTotal,
  RowAction,
} from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { PAGE_SIZE, PAGE_SIZES } from "@faridalms/domain/paging";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { CellWithNote } from "@faridalms/ui/system/cell-note";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import {
  createFileRoute,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Banknote,
  FileCheck,
  Plus,
  Receipt,
  Send,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { TaxIdDocument } from "../components/TaxIdSheet";
import type { InvoiceStanding } from "../format";

import { attemptWith } from "../actions";
import { PaymentSheet } from "../components/PaymentSheet";
import { TaxIdSheet } from "../components/TaxIdSheet";
import {
  formatDay,
  formatMoney,
  INVOICE_KIND_NAMES,
  INVOICE_STANDING_NAMES,
  INVOICE_STANDING_TONE,
  INVOICE_STANDINGS,
  standingOf,
} from "../format";
import { useMay } from "../may";
import { getBilling, issue } from "../server/invoicing";

const TAX_IDS = ["missing", "held"] as const;

const search = v.object({
  q: v.fallback(v.optional(v.string(), ""), ""),
  status: v.fallback(
    v.optional(v.array(v.picklist(INVOICE_STANDINGS)), []),
    [],
  ),
  taxId: v.fallback(v.optional(v.array(v.picklist(TAX_IDS)), []), []),
  page: v.fallback(
    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
  size: v.fallback(v.optional(v.picklist(PAGE_SIZES), PAGE_SIZE), PAGE_SIZE),
});

export const Route = createFileRoute("/billing")({
  validateSearch: search,
  search: {
    middlewares: [
      stripSearchParams({
        q: "",
        status: [],
        taxId: [],
        page: 1,
        size: PAGE_SIZE,
      }),
    ],
  },
  loader: () => getBilling(),
  component: Billing,
});

type Data = Awaited<ReturnType<typeof getBilling>>;
type Invoice = Data["invoices"][number];
type Row = Invoice & { standing: InvoiceStanding };
type Customer = Data["customers"][number];

const RANK: Record<InvoiceStanding, number> = {
  draft: 0,
  overdue: 1,
  issued: 2,
  partly_paid: 2,
  paid: 3,
  credited: 3,
};

/**
 * What needs doing first: drafts to issue, oldest first; then overdue,
 * longest first; then open by due day; then the settled, newest first.
 */
function byUrgency(a: Row, b: Row): number {
  const rank = RANK[a.standing] - RANK[b.standing];
  if (rank) return rank;
  if (a.standing === "draft") return a.forDay.localeCompare(b.forDay);
  if (RANK[a.standing] === 3) return b.forDay.localeCompare(a.forDay);
  return (a.dueOn ?? "").localeCompare(b.dueOn ?? "");
}

const isOpen = (row: Row) =>
  row.standing === "issued" ||
  row.standing === "partly_paid" ||
  row.standing === "overdue";

const forOf = (row: Row) =>
  `${INVOICE_KIND_NAMES[row.kind]}, ${formatDay(row.forDay)}`;

const notApplicable = <Value notApplicable>{null}</Value>;

const COLUMNS: Column<Row>[] = [
  {
    id: "customer",
    header: "Customer",
    primary: true,
    cell: (row) => (
      <CellWithNote note={forOf(row)}>
        <RowLink to="/invoices/$invoiceId" params={{ invoiceId: row.id }}>
          {row.customerName}
        </RowLink>
      </CellWithNote>
    ),
  },
  {
    id: "number",
    header: "Number",
    cell: (row) =>
      row.number ? <span dir="ltr">{row.number}</span> : notApplicable,
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <StatusBadge tone={INVOICE_STANDING_TONE[row.standing]}>
        {INVOICE_STANDING_NAMES[row.standing]}
      </StatusBadge>
    ),
  },
  {
    id: "issued",
    header: "Issued",
    cell: (row) => (row.issuedOn ? formatDay(row.issuedOn) : notApplicable),
  },
  {
    id: "due",
    header: "Due",
    cell: (row) =>
      !row.dueOn || row.standing === "draft" ? (
        notApplicable
      ) : row.standing === "overdue" ? (
        <StatusText tone="danger">{formatDay(row.dueOn)}</StatusText>
      ) : (
        formatDay(row.dueOn)
      ),
  },
  {
    id: "total",
    header: "Total",
    align: "end",
    cell: (row) => formatMoney(row.totalMinor, row.currency),
  },
  {
    id: "owed",
    header: "Owed",
    align: "end",
    cell: (row) =>
      isOpen(row) && row.owedMinor > 0
        ? formatMoney(row.owedMinor, row.currency)
        : notApplicable,
  },
];

const CARD: DataTableCard<Row> = {
  title: (row) => (
    <RowLink to="/invoices/$invoiceId" params={{ invoiceId: row.id }}>
      {row.customerName}
    </RowLink>
  ),
  status: (row) => (
    <StatusBadge tone={INVOICE_STANDING_TONE[row.standing]}>
      {INVOICE_STANDING_NAMES[row.standing]}
    </StatusBadge>
  ),
  fact: (row) =>
    isOpen(row) && row.owedMinor > 0
      ? `${formatMoney(row.owedMinor, row.currency)} owed · ${row.number ?? ""}`
      : `${formatMoney(row.totalMinor, row.currency)} · ${row.number ?? forOf(row)}`,
};

const issueConfirmation = (count: number) => ({
  title: count === 1 ? "Issue this invoice?" : `Issue ${count} invoices?`,
  body: "Each is numbered and dated today and due in 30 days. An issued invoice never changes; it can only be credited.",
  label: count === 1 ? "Issue" : `Issue ${count}`,
});

/** One summing row per currency: what the rows shown come to, and still owe. */
function totalsOf(rows: readonly Row[]): DataTableTotal[] {
  const sums = new Map<Currency, { total: number; owed: number }>();
  for (const row of rows) {
    const held = sums.get(row.currency) ?? { total: 0, owed: 0 };
    held.total += row.totalMinor;
    if (isOpen(row)) held.owed += row.owedMinor;
    sums.set(row.currency, held);
  }
  return [...sums]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([currency, sum]) => ({
      id: currency,
      label: `Total in ${currency}`,
      cells: {
        total: formatMoney(sum.total, currency),
        ...(sum.owed ? { owed: formatMoney(sum.owed, currency) } : {}),
      },
    }));
}

/**
 * Finance's invoices, every state in one list: drafts the daily round made
 * to check and issue, what is owed, and what was settled, ordered by what
 * needs doing first. Recording money received is the page's action.
 */
function Billing() {
  const data = Route.useLoaderData();
  const { q, status, taxId, page, size } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const mayBill = useMay("billing");
  const send = useServerFn(issue);
  const paying = useSheet();
  const [payer, setPayer] = useState<Customer | null>(null);
  const recording = useSheet();
  const [taxDocument, setTaxDocument] = useState<TaxIdDocument | null>(null);
  const all: Row[] = data.invoices
    .map((invoice) => ({
      ...invoice,
      standing: standingOf(invoice, data.today),
    }))
    .toSorted(byUrgency);
  const needle = q.trim().toLowerCase();
  const held = (row: Row) => (row.taxAuthorityId ? "held" : "missing");
  const rows = all.filter(
    (row) =>
      (!needle ||
        row.customerName.toLowerCase().includes(needle) ||
        (row.number?.toLowerCase().includes(needle) ?? false)) &&
      (status.length === 0 || status.includes(row.standing)) &&
      (taxId.length === 0 ||
        (row.standing !== "draft" && taxId.includes(held(row)))),
  );
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * size, current * size);
  const filtered = Boolean(needle) || status.length > 0 || taxId.length > 0;
  const go = (change: Partial<v.InferOutput<typeof search>>) =>
    void navigate({
      search: (previous) => ({ ...previous, page: 1, ...change }),
      replace: true,
    });

  const issueAll = async (chosen: readonly Row[]) => {
    let issued = 0;
    const refused: string[] = [];
    for (const row of chosen.toSorted((a, b) =>
      a.forDay.localeCompare(b.forDay),
    )) {
      const out = await attemptWith(
        () => send({ data: { id: row.id } }),
        "It could not be issued.",
      );
      if (out.ok) issued += 1;
      else refused.push(`${row.customerName}: ${out.message}`);
    }
    if (issued)
      toast.success(
        issued === 1 ? "1 invoice issued." : `${issued} invoices issued.`,
      );
    if (refused.length)
      toast.error(
        refused.length === 1
          ? "A draft was not issued."
          : `${refused.length} drafts were not issued.`,
        { description: refused.join(" ") },
      );
    await router.invalidate();
  };
  const batchActions: BatchAction<Row>[] | undefined =
    mayBill && status.length === 1 && status[0] === "draft"
      ? [
          {
            label: "Issue",
            icon: Send,
            onSelect: issueAll,
            confirm: (chosen) => issueConfirmation(chosen.length),
          },
        ]
      : undefined;
  const customerOf = (row: Row) =>
    data.customers.find((customer) => customer.id === row.customerId) ?? null;
  const rowActions = (row: Row): RowAction[] => [
    ...(mayBill && row.standing === "draft"
      ? [
          {
            label: "Issue",
            icon: Send,
            onSelect: () => issueAll([row]),
            confirm: issueConfirmation(1),
          },
        ]
      : []),
    ...(mayBill && isOpen(row)
      ? [
          {
            label: "Record a payment",
            icon: Banknote,
            onSelect: () => {
              setPayer(customerOf(row));
              paying.show();
            },
          },
        ]
      : []),
    ...(mayBill && row.standing !== "draft"
      ? [
          {
            label: row.taxAuthorityId
              ? "Change the tax authority id"
              : "Record the tax authority id",
            icon: FileCheck,
            onSelect: () => {
              setTaxDocument({
                kind: "invoice",
                id: row.id,
                number: row.number,
                held: row.taxAuthorityId,
              });
              recording.show();
            },
          },
        ]
      : []),
    {
      label: "Open the customer",
      icon: UserRound,
      onSelect: () =>
        void navigate({
          to: "/customers/$customerId",
          params: { customerId: row.customerId },
        }),
    },
  ];
  const facets: Facet[] = [
    {
      id: "status",
      label: "Status",
      options: INVOICE_STANDINGS.map((value) => ({
        value,
        label: INVOICE_STANDING_NAMES[value],
        count: all.filter((row) => row.standing === value).length,
      })),
      selected: status,
      onChange: (selected) =>
        go({
          status: INVOICE_STANDINGS.filter((value) => selected.includes(value)),
        }),
    },
    {
      id: "taxId",
      label: "Tax authority id",
      options: [
        {
          value: "missing",
          label: "Not recorded",
          count: all.filter(
            (row) => row.standing !== "draft" && !row.taxAuthorityId,
          ).length,
        },
        {
          value: "held",
          label: "Recorded",
          count: all.filter((row) => row.taxAuthorityId).length,
        },
      ],
      selected: taxId,
      onChange: (selected) =>
        go({ taxId: TAX_IDS.filter((value) => selected.includes(value)) }),
    },
  ];
  const newInvoice = {
    label: "New invoice",
    icon: Plus,
    onSelect: () => void navigate({ to: "/invoices/new" }),
  };
  return (
    <Page width="list">
      <PageHeader
        title="Billing"
        count={filtered ? undefined : all.length}
        description="The daily round drafts each contract's invoices before they fall due; check and issue them here. An issued invoice never changes: it is credited."
        action={
          mayBill
            ? {
                label: "Record a payment",
                icon: Banknote,
                onClick: () => {
                  setPayer(null);
                  paying.show();
                },
              }
            : undefined
        }
        menu={mayBill ? [newInvoice] : []}
      />
      <DataTable
        caption="Invoices"
        rows={shown}
        columns={COLUMNS}
        rowLabel={(row) => row.number ?? `Draft for ${row.customerName}`}
        card={CARD}
        toolbar={{
          search: {
            value: q,
            onChange: (value) => go({ q: value }),
            label: "Search invoices",
            placeholder: "Customer or number",
          },
          facets,
          onReset: () => void navigate({ search: {}, replace: true }),
        }}
        rowActions={rowActions}
        batchActions={batchActions}
        totals={totalsOf(rows)}
        pagination={
          rows.length > PAGE_SIZE
            ? {
                page: current,
                pages,
                total: rows.length,
                pageSize: size,
                onPage: (next) =>
                  void navigate({
                    search: (previous) => ({ ...previous, page: next }),
                  }),
                onPageSize: (next) => {
                  const chosen = PAGE_SIZES.find((one) => one === next);
                  if (chosen) go({ size: chosen });
                },
              }
            : undefined
        }
        empty={{
          icon: Receipt,
          title: "Draft the first invoice",
          description:
            "The daily round drafts each contract's invoices two weeks before they fall due; New invoice drafts one for anything off the schedule.",
          action: mayBill ? (
            <ButtonLink to="/invoices/new" variant="outline">
              <Plus aria-hidden />
              New invoice
            </ButtonLink>
          ) : undefined,
        }}
      />
      {mayBill ? (
        <PaymentSheet
          key={`pay-${paying.key}-${payer?.id ?? "any"}`}
          customers={payer ? [payer] : data.customers}
          today={data.today}
          open={paying.open}
          onOpenChange={paying.onOpenChange}
        />
      ) : null}
      {mayBill && taxDocument ? (
        <TaxIdSheet
          key={`tax-${recording.key}`}
          document={taxDocument}
          open={recording.open}
          onOpenChange={recording.onOpenChange}
        />
      ) : null}
    </Page>
  );
}
