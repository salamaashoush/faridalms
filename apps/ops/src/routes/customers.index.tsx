import { Button } from "@faridalms/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@faridalms/ui/table";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { CustomerForm } from "../components/CustomerForm";
import { getCustomers } from "../server/customers";

export const Route = createFileRoute("/customers/")({
  loader: () => getCustomers(),
  component: Customers,
});

function Customers() {
  const customers = Route.useLoaderData();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            The organisations the business sells to and invoices, each with the
            tenant it runs once its schools exist.
          </p>
        </div>
        <Button variant="outline" onClick={() => setAdding((open) => !open)}>
          New customer
        </Button>
      </div>
      {adding ? (
        <CustomerForm
          customer={null}
          onSaved={async (customerId) => {
            toast.success("Customer created.");
            await navigate({
              to: "/customers/$customerId",
              params: { customerId },
            });
          }}
        />
      ) : null}
      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Tax number</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: customer.id }}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {customer.legalNameEn}
                    </Link>
                    {customer.legalNameAr ? (
                      <div
                        dir="rtl"
                        lang="ar"
                        className="text-xs text-muted-foreground"
                      >
                        {customer.legalNameAr}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{customer.country}</TableCell>
                  <TableCell>{customer.currency}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.taxNumber ?? "None"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
