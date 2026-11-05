import { addDays } from "@faridalms/domain/school";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as v from "valibot";

import { failure } from "../actions";
import { QuoteForm } from "../components/QuoteForm";
import { addQuote, getQuoteStart } from "../server/quotes";

const uuid = v.pipe(v.string(), v.uuid());

export const Route = createFileRoute("/quotes/new")({
  validateSearch: v.object({
    leadId: v.optional(uuid),
    customerId: v.optional(uuid),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getQuoteStart({ data: deps }),
  component: NewQuote,
});

/** A first quote for a lead or customer, built from what is sold. */
function NewQuote() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const add = useServerFn(addQuote);
  const { party } = data;
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        {party.kind === "lead" ? (
          <Link
            to="/leads/$leadId"
            params={{ leadId: party.id }}
            className="text-sm text-muted-foreground hover:underline"
          >
            {party.name}
          </Link>
        ) : (
          <Link
            to="/customers/$customerId"
            params={{ customerId: party.id }}
            className="text-sm text-muted-foreground hover:underline"
          >
            {party.name}
          </Link>
        )}
        <h1 className="text-2xl font-semibold">New quote</h1>
        <p className="text-sm text-muted-foreground">
          VAT follows {party.country ?? "the lead's country, once it is given"}.
          It stays a draft, changed in place, until it is marked sent.
        </p>
      </div>
      <QuoteForm
        initial={{
          currency: party.currency ?? (party.country === "EG" ? "EGP" : "USD"),
          planVersionId: null,
          quantity: 1,
          unitPriceMinor: 0,
          discountPercent: 0,
          addOns: [],
          termStartsOn: data.today,
          termEndsOn: addDays(data.today, 365),
          schedule: "annual",
          validUntil: data.validUntil,
          notesEn: null,
          notesAr: null,
        }}
        plans={data.selling.plans}
        addOns={data.selling.addOns}
        submitLabel="Save the quote"
        onSubmit={async (spec) => {
          try {
            const out = await add({
              data: {
                leadId: party.kind === "lead" ? party.id : party.leadId,
                customerId: party.kind === "customer" ? party.id : null,
                spec,
              },
            });
            if (!out.ok) return out.message;
            toast.success("Quote saved.");
            await navigate({
              to: "/quotes/$quoteId",
              params: { quoteId: out.id },
            });
            return null;
          } catch (error) {
            return failure(error, "The quote could not be saved.");
          }
        }}
      />
    </div>
  );
}
