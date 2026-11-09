import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
import { Building2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { getCustomers } from "../server/customers";

import { NewCustomerSheet } from "../components/CustomerForm";
import {
  formatMoney,
  SUBSCRIPTION_STATE_NAMES,
  SUBSCRIPTION_STATE_TONE,
} from "../format";
import { getCustomers as loadCustomers } from "../server/customers";

const MONEY_VIEWS = ["owes", "overdue"] as const;

const search = v.object({
  q: v.optional(v.string(), ""),
  owner: v.optional(v.array(v.string()), []),
  money: v.fallback(v.optional(v.picklist(MONEY_VIEWS)), undefined),
});

export const Route = createFileRoute("/customers/")({
  validateSearch: search,
  search: { middlewares: [stripSearchParams({ q: "", owner: [] })] },
  loader: () => loadCustomers(),
  component: Customers,
});

type Data = Awaited<ReturnType<typeof getCustomers>>;
type CustomerRow = Data["customers"][number];

/** The facet's value for a customer nobody looks after. */
const NOBODY = "nobody";

function columnsFor(data: Data): Column<CustomerRow>[] {
  return [
    {
      id: "customer",
      header: "Customer",
      primary: true,
      cell: (customer) => (
        <span className="grid min-w-0">
          <RowLink
            to="/customers/$customerId"
            params={{ customerId: customer.id }}
          >
            {customer.legalNameEn}
          </RowLink>
          {customer.legalNameAr ? (
            <span
              dir="rtl"
              lang="ar"
              className="justify-self-start truncate text-[13px] leading-[18px] text-muted-foreground"
            >
              {customer.legalNameAr}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "subscription",
      header: "Subscription",
      cell: (customer) =>
        customer.subscription ? (
          <span className="flex min-w-0 items-center gap-2">
            <StatusBadge
              tone={SUBSCRIPTION_STATE_TONE[customer.subscription.state]}
            >
              {SUBSCRIPTION_STATE_NAMES[customer.subscription.state]}
            </StatusBadge>
            <span className="truncate text-muted-foreground">
              {customer.subscription.plan ??
                (customer.subscription.grandfathered
                  ? "No plan sold yet"
                  : "No plan")}
            </span>
          </span>
        ) : (
          <Value absent="None" />
        ),
    },
    {
      id: "schools",
      header: "Schools",
      align: "end",
      cell: (customer) => customer.schools.toLocaleString("en"),
    },
    ...(data.mayBill
      ? [
          {
            id: "owed",
            header: "Owed",
            align: "end" as const,
            cell: (customer: CustomerRow) =>
              customer.owed.owedMinor === 0 ? (
                <Value absent="Nothing" />
              ) : (
                <span className="grid justify-items-end">
                  {formatMoney(customer.owed.owedMinor, customer.currency)}
                  {customer.owed.overdueMinor ? (
                    <StatusText tone="danger">
                      {formatMoney(
                        customer.owed.overdueMinor,
                        customer.currency,
                      )}{" "}
                      overdue
                    </StatusText>
                  ) : null}
                </span>
              ),
          },
        ]
      : []),
    {
      id: "owner",
      header: "Looked after by",
      cell: (customer) =>
        customer.accountOwnerId ? (
          (data.names[customer.accountOwnerId] ?? "A former operator")
        ) : (
          <Value absent="Nobody yet" />
        ),
    },
  ];
}

const CARD: DataTableCard<CustomerRow> = {
  title: (customer) => (
    <RowLink to="/customers/$customerId" params={{ customerId: customer.id }}>
      {customer.legalNameEn}
    </RowLink>
  ),
  status: (customer) =>
    customer.subscription
      ? SUBSCRIPTION_STATE_NAMES[customer.subscription.state]
      : null,
  fact: (customer) =>
    customer.owed.overdueMinor
      ? `${formatMoney(customer.owed.overdueMinor, customer.currency)} overdue`
      : `${customer.schools.toLocaleString("en")} ${customer.schools === 1 ? "school" : "schools"}`,
};

/**
 * The organisations the business sells to and invoices: what each holds,
 * how many schools it runs, what it owes and who looks after it.
 */
function Customers() {
  const data = Route.useLoaderData();
  const { q, owner, money } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [adding, setAdding] = useState(false);
  const needle = q.trim().toLowerCase();
  const { customers, names } = data;
  const rows = customers.filter(
    (customer) =>
      (!needle ||
        [customer.legalNameEn, customer.legalNameAr, customer.taxNumber]
          .filter((text) => text !== null)
          .some((text) => text.toLowerCase().includes(needle))) &&
      (owner.length === 0 ||
        owner.includes(customer.accountOwnerId ?? NOBODY)) &&
      (money === "owes"
        ? customer.owed.owedMinor > 0
        : money === "overdue"
          ? customer.owed.overdueMinor > 0
          : true),
  );
  const owners = [
    ...new Set(
      customers.flatMap((customer) =>
        customer.accountOwnerId ? [customer.accountOwnerId] : [],
      ),
    ),
  ];
  const facets: Facet[] = [
    {
      id: "owner",
      label: "Looked after by",
      options: [
        ...owners.map((id) => ({
          value: id,
          label: names[id] ?? "A former operator",
          count: customers.filter((customer) => customer.accountOwnerId === id)
            .length,
        })),
        {
          value: NOBODY,
          label: "Nobody yet",
          count: customers.filter((customer) => !customer.accountOwnerId)
            .length,
        },
      ],
      selected: owner,
      onChange: (selected) =>
        void navigate({
          search: (previous) => ({ ...previous, owner: selected }),
          replace: true,
        }),
    },
    ...(data.mayBill
      ? [
          {
            id: "money",
            label: "Money",
            single: true,
            options: [
              {
                value: "owes",
                label: "Owes money",
                count: customers.filter((row) => row.owed.owedMinor > 0).length,
              },
              {
                value: "overdue",
                label: "Has overdue invoices",
                count: customers.filter((row) => row.owed.overdueMinor > 0)
                  .length,
              },
            ],
            selected: money ? [money] : [],
            onChange: (selected: string[]) =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  money: MONEY_VIEWS.find((view) => view === selected[0]),
                }),
                replace: true,
              }),
          },
        ]
      : []),
  ];
  const filtered = Boolean(needle) || owner.length > 0 || money !== undefined;
  return (
    <Page width="list">
      <PageHeader
        title="Customers"
        count={filtered ? undefined : customers.length}
        description="The organisations that sign and pay: a school, or a group of schools."
        action={{
          label: "New customer",
          icon: Plus,
          onClick: () => setAdding(true),
        }}
      />
      <DataTable
        caption="Customers"
        rows={rows}
        columns={columnsFor(data)}
        rowLabel={(customer) => customer.legalNameEn}
        toolbar={{
          search: {
            value: q,
            onChange: (value) =>
              void navigate({
                search: (previous) => ({ ...previous, q: value }),
                replace: true,
              }),
            label: "Search customers",
            placeholder: "Search by name or tax number",
          },
          facets,
          onReset: () => void navigate({ search: {} }),
        }}
        card={CARD}
        empty={{
          icon: Building2,
          title: "Add the first customer",
          description:
            "A customer is the organisation that signs and pays. New school creates one too.",
        }}
      />
      <NewCustomerSheet
        open={adding}
        onOpenChange={setAdding}
        onCreated={async (customerId) => {
          toast.success("Customer created.");
          await navigate({
            to: "/customers/$customerId",
            params: { customerId },
          });
        }}
      />
    </Page>
  );
}
