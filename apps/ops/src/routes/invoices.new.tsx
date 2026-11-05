import { businessToday } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { failure } from "../actions";
import {
  blankLine,
  InvoiceLinesFields,
  linesOf,
} from "../components/InvoiceLinesForm";
import { getCustomer } from "../server/customers";
import { addInvoice } from "../server/invoicing";

export const Route = createFileRoute("/invoices/new")({
  validateSearch: v.object({ customerId: v.pipe(v.string(), v.uuid()) }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getCustomer({ data: { id: deps.customerId } }),
  component: NewInvoice,
});

/** An invoice by hand: a service sold once, or anything off the schedule. */
function NewInvoice() {
  const { customer } = Route.useLoaderData();
  const navigate = useNavigate();
  const add = useServerFn(addInvoice);
  const [drafts, setDrafts] = useState(() => [blankLine()]);
  const [forDay, setForDay] = useState(businessToday());
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link
          to="/customers/$customerId"
          params={{ customerId: customer.id }}
          className="text-sm text-muted-foreground hover:underline"
        >
          {customer.legalNameEn}
        </Link>
        <h1 className="text-2xl font-semibold">New invoice</h1>
        <p className="text-sm text-muted-foreground">
          In {customer.currency}, with the VAT its country is charged. It stays
          a draft until it is issued.
        </p>
      </div>
      <form
        aria-label="New invoice"
        className="grid max-w-3xl gap-4 rounded-lg border p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          const read = linesOf(drafts);
          if (!read.ok) {
            setAnswer(read.message);
            return;
          }
          setSaving(true);
          setAnswer(null);
          try {
            const out = await add({
              data: { customerId: customer.id, forDay, lines: read.lines },
            });
            if (out.ok) {
              toast.success("Draft saved.");
              await navigate({
                to: "/invoices/$invoiceId",
                params: { invoiceId: out.id },
              });
            } else setAnswer(out.message);
          } catch (error) {
            setAnswer(failure(error, "The invoice could not be drafted."));
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid max-w-xs gap-1.5 text-sm">
          <label htmlFor="invoice-for" className="font-medium">
            For the day
          </label>
          <Input
            id="invoice-for"
            type="date"
            required
            value={forDay}
            onChange={(event) => setForDay(event.target.value)}
          />
        </div>
        <InvoiceLinesFields
          prefix="manual"
          currency={customer.currency}
          drafts={drafts}
          onChange={setDrafts}
        />
        {answer ? (
          <p role="alert" className="text-sm text-destructive">
            {answer}
          </p>
        ) : null}
        <Button type="submit" disabled={saving} className="justify-self-start">
          {saving ? "Saving…" : "Save the draft"}
        </Button>
      </form>
    </div>
  );
}
