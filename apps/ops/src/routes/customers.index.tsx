import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { PageHeader } from "@faridalms/ui/system/page-header";
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
import { getCustomers as loadCustomers } from "../server/customers";

export const Route = createFileRoute("/customers/")({
  validateSearch: v.object({ q: v.optional(v.string(), "") }),
  search: { middlewares: [stripSearchParams({ q: "" })] },
  loader: () => loadCustomers(),
  component: Customers,
});

type CustomerRow = Awaited<ReturnType<typeof getCustomers>>[number];

const COLUMNS: Column<CustomerRow>[] = [
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
            className="truncate text-[13px] leading-[18px] text-muted-foreground"
          >
            {customer.legalNameAr}
          </span>
        ) : null}
      </span>
    ),
  },
  { id: "country", header: "Country", cell: (customer) => customer.country },
  { id: "currency", header: "Currency", cell: (customer) => customer.currency },
  {
    id: "tax",
    header: "Tax number",
    cell: (customer) => (
      <span className="text-muted-foreground">
        {customer.taxNumber ?? "None"}
      </span>
    ),
  },
];

const CARD: DataTableCard<CustomerRow> = {
  title: (customer) => (
    <RowLink to="/customers/$customerId" params={{ customerId: customer.id }}>
      {customer.legalNameEn}
    </RowLink>
  ),
  fact: (customer) => `${customer.country} · ${customer.currency}`,
};

/** The organisations the business sells to and invoices. */
function Customers() {
  const customers = Route.useLoaderData();
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [adding, setAdding] = useState(false);
  const needle = q.trim().toLowerCase();
  const rows = customers.filter(
    (customer) =>
      !needle ||
      [customer.legalNameEn, customer.legalNameAr, customer.taxNumber]
        .filter((text) => text !== null)
        .some((text) => text.toLowerCase().includes(needle)),
  );
  return (
    <>
      <PageHeader
        title="Customers"
        count={needle ? undefined : customers.length}
        description="Each runs a tenant once its schools exist."
        action={{
          label: "New customer",
          icon: Plus,
          onClick: () => setAdding(true),
        }}
      />
      <DataTable
        caption="Customers"
        rows={rows}
        columns={COLUMNS}
        rowLabel={(customer) => customer.legalNameEn}
        toolbar={{
          search: {
            value: q,
            onChange: (value) =>
              void navigate({ search: { q: value }, replace: true }),
            label: "Search customers",
            placeholder: "Search by name or tax number",
          },
          onReset: () => void navigate({ search: {} }),
        }}
        card={CARD}
        empty={{
          icon: Building2,
          title: "Add the first customer",
          description:
            "A customer is the organisation that signs and pays: a school, or a group of schools.",
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
    </>
  );
}
