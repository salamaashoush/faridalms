import type { QuoteContent } from "@faridalms/database/business/quotes";
import type { QuoteLine, QuoteSpec } from "@faridalms/domain/quotes";

import { agreementsInForce } from "@faridalms/database/business/agreements";
import { catalogue } from "@faridalms/database/business/catalogue";
import { customerById } from "@faridalms/database/business/customers";
import { leadById } from "@faridalms/database/business/leads";
import { listTaxRates, profile } from "@faridalms/database/business/profile";
import {
  acceptQuote,
  createQuote,
  markQuoteSent,
  QuoteError,
  quoteById,
  quotesFor,
  reviseQuote,
  saveQuote,
} from "@faridalms/database/business/quotes";
import { rateOn } from "@faridalms/domain/business";
import { quoteSpecSchema, quoteTotals } from "@faridalms/domain/quotes";
import { addDays } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { requireArea } from "./access";
import { requireBusiness } from "./business";
import { directoryAdmin } from "./directory-admin";
import { opsEnv } from "./env";
import { consoleMail } from "./mail";
import { draftOfQuote, quoteVatName } from "./quote-parts";

type Outcome<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const uuid = v.pipe(v.string(), v.uuid());

/** How long a quote stands unless the operator says otherwise. */
const VALID_DAYS = 30;
/** The largest signed copy or purchase order kept with a quote. */
const MAX_ATTACHMENT = 10 * 1024 * 1024;
const ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

const REFUSED: Record<QuoteError["code"], string> = {
  not_found: "No such quote.",
  not_draft: "It has been sent, so a change is a new version.",
  not_open: "It was accepted or superseded, so it no longer changes.",
};

/** Who a quote is for: a lead, or a customer, with the country its VAT follows. */
async function partyOf(input: {
  leadId: string | null;
  customerId: string | null;
}) {
  const db = requireBusiness();
  if (input.customerId) {
    const found = await customerById(db, input.customerId);
    if (!found) return null;
    return {
      kind: "customer" as const,
      id: found.customer.id,
      name: found.customer.legalNameEn,
      nameAr: found.customer.legalNameAr,
      address: found.customer.address,
      taxNumber: found.customer.taxNumber,
      country: found.customer.country,
      currency: found.customer.currency,
      leadId: input.leadId,
    };
  }
  if (input.leadId) {
    const found = await leadById(db, input.leadId);
    if (!found) return null;
    return {
      kind: "lead" as const,
      id: found.lead.id,
      name: found.lead.organisation,
      nameAr: null,
      address: null,
      taxNumber: null,
      country: found.lead.country,
      currency: null,
      leadId: found.lead.id,
    };
  }
  return null;
}

/**
 * A quote's lines and amounts from the catalogue: each version named as it
 * is now, with VAT at the rate in force in the party's country today.
 */
async function contentOf(
  spec: QuoteSpec,
  country: string,
): Promise<Outcome<{ content: QuoteContent }>> {
  const db = requireBusiness();
  const [sold, rates] = await Promise.all([catalogue(db), listTaxRates(db)]);
  const lines: QuoteLine[] = [];
  if (spec.planVersionId) {
    const plan = sold.plans.find((row) => row.id === spec.planVersionId);
    if (!plan || plan.retiredAt)
      return { ok: false, message: "That plan version is no longer sold." };
    lines.push({
      kind: "plan",
      versionId: plan.id,
      nameEn: plan.nameEn,
      nameAr: plan.nameAr,
      unit:
        plan.prices.find((price) => price.currency === spec.currency)?.unit ??
        null,
      quantity: spec.quantity,
      unitPriceMinor: spec.unitPriceMinor,
      discountPercent: spec.discountPercent,
    });
  }
  for (const item of spec.addOns) {
    const addOn = sold.addOns.find((row) => row.id === item.addOnVersionId);
    if (!addOn || addOn.retiredAt)
      return { ok: false, message: "An add-on version is no longer sold." };
    lines.push({
      kind: "add_on",
      versionId: addOn.id,
      nameEn: addOn.nameEn,
      nameAr: addOn.nameAr,
      unit:
        addOn.prices.find((price) => price.currency === spec.currency)?.unit ??
        null,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      discountPercent: item.discountPercent,
    });
  }
  const rate = rateOn(
    rates.map((row) => ({ ...row, percent: Number(row.percent) })),
    country,
    businessToday(),
  );
  return {
    ok: true,
    content: {
      spec,
      lines,
      country,
      totals: quoteTotals({
        lines,
        vatPercent: rate?.percent ?? 0,
        schedule: spec.schedule,
      }),
    },
  };
}

/**
 * What sending a quote with its link starts from: who it goes to, and for
 * a party without a school, the school its acceptance sets up; and what is
 * missing before it can be sent.
 */
async function offerStartOf(
  quote: QuoteRow,
  party: Awaited<ReturnType<typeof partyOf>>,
) {
  const db = requireBusiness();
  const [lead, customer, business, inForce] = await Promise.all([
    quote.leadId ? leadById(db, quote.leadId) : null,
    quote.customerId ? customerById(db, quote.customerId) : null,
    profile(db),
    agreementsInForce(db, businessToday()),
  ]);
  const decider = customer?.contacts.find(
    (contact) => contact.email && contact.roles.includes("decision_maker"),
  );
  const to =
    quote.offer?.to ??
    (decider?.email
      ? { name: decider.name, email: decider.email, locale: decider.locale }
      : lead
        ? {
            name: lead.lead.name,
            email: lead.lead.email ?? "",
            locale: lead.lead.locale,
          }
        : { name: "", email: "", locale: "en" as const });
  const needsSchool = !customer?.customer.tenantId;
  const name = lead?.lead.organisation ?? party?.name ?? "";
  return {
    to,
    needsSchool,
    school: quote.offer?.school ?? {
      nameEn: name || null,
      nameAr: null,
      slug: suggestedSlug(name),
    },
    portalDomain: opsEnv().PORTAL_DOMAIN,
    missing: [
      ...(business ? [] : ["the business's legal details in Settings"]),
      ...(inForce.terms && inForce.dpa
        ? []
        : ["the terms and the data processing agreement in Settings"]),
      ...(consoleMail() ? [] : ["email (RESEND_API_KEY and EMAIL_FROM)"]),
    ],
  };
}

/** A portal address from a name: its letters and digits, joined by hyphens. */
function suggestedSlug(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 63);
}

/** What a new quote for a lead or customer starts from. */
export const getQuoteStart = createServerFn({ method: "GET" })
  .validator((input: { leadId?: string; customerId?: string }) =>
    v.parse(
      v.object({ leadId: v.optional(uuid), customerId: v.optional(uuid) }),
      input,
    ),
  )
  .handler(async ({ data }) => {
    await requireArea("leads");
    const party = await partyOf({
      leadId: data.leadId ?? null,
      customerId: data.customerId ?? null,
    });
    if (!party) throw new Error("NOT_FOUND");
    const sold = await catalogue(requireBusiness());
    const today = businessToday();
    return {
      party,
      today,
      validUntil: addDays(today, VALID_DAYS),
      selling: {
        plans: sold.plans.filter((plan) => !plan.retiredAt),
        addOns: sold.addOns.filter((addOn) => !addOn.retiredAt),
      },
    };
  });

/** A quote, its other versions, who it is for, and the business's own details. */
export const getQuote = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }) => {
    await requireArea("leads");
    const db = requireBusiness();
    const quote = await quoteById(db, data.id);
    if (!quote) throw new Error("NOT_FOUND");
    const [party, business, versions, sold, vatName] = await Promise.all([
      partyOf(quote),
      profile(db),
      quotesFor(db, {
        leadId: quote.leadId ?? undefined,
        customerId: quote.customerId ?? undefined,
      }),
      catalogue(db),
      quoteVatName(quote),
    ]);
    return {
      quote,
      party,
      business,
      vatName,
      offer: await offerStartOf(quote, party),
      versions: versions.filter((row) => row.number === quote.number),
      today: businessToday(),
      selling: {
        plans: sold.plans.filter((plan) => !plan.retiredAt),
        addOns: sold.addOns.filter((addOn) => !addOn.retiredAt),
      },
    };
  });

const newQuoteInput = v.object({
  leadId: v.nullable(uuid),
  customerId: v.nullable(uuid),
  spec: quoteSpecSchema,
});

export const addQuote = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof newQuoteInput>) =>
    v.parse(newQuoteInput, input),
  )
  .handler(async ({ data }): Promise<Outcome<{ id: string }>> => {
    const { operator } = await requireArea("leads");
    const party = await partyOf(data);
    if (!party) return { ok: false, message: "No such lead or customer." };
    if (!party.country)
      return {
        ok: false,
        message: "Give the lead its country first: the quote's VAT follows it.",
      };
    const built = await contentOf(data.spec, party.country);
    if (!built.ok) return built;
    const id = await createQuote(requireBusiness(), {
      ...built.content,
      leadId: party.leadId,
      customerId: party.kind === "customer" ? party.id : null,
      year: businessToday().slice(0, 4),
      by: operator.id,
    });
    return { ok: true, id };
  });

const changeInput = v.object({ id: uuid, spec: quoteSpecSchema });

/**
 * Changes a quote: in place while it is a draft, as a new version once it
 * has been sent. Answers the quote to show.
 */
export const changeQuote = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof changeInput>) =>
    v.parse(changeInput, input),
  )
  .handler(async ({ data }): Promise<Outcome<{ id: string }>> => {
    const { operator } = await requireArea("leads");
    const db = requireBusiness();
    const held = await quoteById(db, data.id);
    if (!held) return { ok: false, message: REFUSED.not_found };
    const built = await contentOf(data.spec, held.country);
    if (!built.ok) return built;
    try {
      if (held.state === "draft") {
        await saveQuote(db, { ...built.content, id: data.id, by: operator.id });
        return { ok: true, id: data.id };
      }
      return {
        ok: true,
        id: await reviseQuote(db, {
          ...built.content,
          id: data.id,
          by: operator.id,
        }),
      };
    } catch (error) {
      if (error instanceof QuoteError)
        return { ok: false, message: REFUSED[error.code] };
      throw error;
    }
  });

export const sendQuote = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("leads");
    try {
      await markQuoteSent(requireBusiness(), {
        id: data.id,
        by: operator.id,
        offer: null,
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof QuoteError)
        return { ok: false, message: REFUSED[error.code] };
      throw error;
    }
  });

/** A quote as the stores answer it. */
type QuoteRow = NonNullable<Awaited<ReturnType<typeof quoteById>>>;

/**
 * Records a quote accepted, with the signed copy or purchase order: the
 * customer, from its lead if it has none, and the school's draft prefilled
 * with what was sold, ready from its schools step.
 */
export const accept = createServerFn({ method: "POST" })
  .validator((input: FormData) => {
    const id = v.parse(uuid, input.get("id"));
    const file = input.get("attachment");
    if (!(file instanceof File)) throw new Error("ATTACHMENT");
    return { id, file };
  })
  .handler(async ({ data }): Promise<Outcome<{ draftId: string }>> => {
    const { operator } = await requireArea("leads");
    if (!ATTACHMENT_TYPES.has(data.file.type))
      return {
        ok: false,
        message: "Attach the signed copy or purchase order as a PDF or image.",
      };
    if (data.file.size === 0 || data.file.size > MAX_ATTACHMENT)
      return { ok: false, message: "Attach a file of up to 10 MB." };
    const db = requireBusiness();
    const quote = await quoteById(db, data.id);
    if (!quote) return { ok: false, message: REFUSED.not_found };
    const lead = quote.leadId ? await leadById(db, quote.leadId) : null;
    if (!quote.customerId && !lead)
      return { ok: false, message: REFUSED.not_found };
    const [cell] = await directoryAdmin().openCells();
    try {
      const { draftId } = await acceptQuote(db, {
        id: quote.id,
        evidence: {
          kind: "paper",
          attachment: {
            name: data.file.name.slice(0, 200),
            type: data.file.type,
            bytes: new Uint8Array(await data.file.arrayBuffer()),
          },
        },
        newCustomer:
          lead && !quote.customerId
            ? {
                legalNameEn: lead.lead.organisation,
                legalNameAr: null,
                taxNumber: null,
                commercialRegistry: null,
                address: null,
                country: quote.country,
                contact:
                  lead.lead.email || lead.lead.phone
                    ? {
                        name: lead.lead.name,
                        email: lead.lead.email,
                        phone: lead.lead.phone,
                        roles: ["decision_maker"],
                        locale: lead.lead.locale,
                      }
                    : null,
              }
            : null,
        draft: () =>
          draftOfQuote({
            quote,
            cellId: cell?.id ?? "",
            schoolName: lead?.lead.organisation ?? null,
            setup: null,
          }),
        draftStep: "schools",
        by: operator.id,
      });
      return { ok: true, draftId };
    } catch (error) {
      if (error instanceof QuoteError)
        return { ok: false, message: REFUSED[error.code] };
      throw error;
    }
  });
