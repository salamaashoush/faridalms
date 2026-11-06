import { addDays } from "@faridalms/domain/school";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  staticData: { section: "/leads", title: "New quote" },
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
    <div className="grid">
      <PageHeader
        title="New quote"
        description={`For ${party.name}. VAT follows ${party.country ?? "the lead's country, once it is given"}; it stays a draft until it is marked sent.`}
      />
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
        secondary={
          party.kind === "lead" ? (
            <ButtonLink
              to="/leads/$leadId"
              params={{ leadId: party.id }}
              variant="outline"
            >
              Cancel
            </ButtonLink>
          ) : (
            <ButtonLink
              to="/customers/$customerId"
              params={{ customerId: party.id }}
              variant="outline"
            >
              Cancel
            </ButtonLink>
          )
        }
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
